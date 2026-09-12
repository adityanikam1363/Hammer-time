#!/usr/bin/env python3
"""YOLO -> TrackShift ingestion bridge for full-lap F1 footage.

This script is tuned for the full-race use-case described by the user:
- detect one tracked car in the frame
- detect its 4 wheel centers (or the leading front pair when only a subset is visible)
- detect the white track limit line near the car
- convert those detections into the same per-frame geometry format the TrackShift backend expects

The app logic already decides violations from the front-two-tire offsets against the fitted
boundaries, so the job of this script is to provide the raw geometry for that decision.
"""

from __future__ import annotations

import argparse
import json
import time
from typing import Any, Iterable

import cv2
import numpy as np
import requests

try:
    from ultralytics import YOLO
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"ultralytics is required. Install it with: pip install -r requirements-cv.txt\n{exc}")


WHITE_LINE_CLASSES = {
    "white_boundary",
    "track_limit_white",
    "track_limit",
    "white_line",
    "edge_white",
}
CAR_CLASSES = {"car", "vehicle", "race_car", "f1_car"}
WHEEL_CLASSES = {
    "wheel_front_left",
    "wheel_front_right",
    "wheel_rear_left",
    "wheel_rear_right",
    "front_left_wheel",
    "front_right_wheel",
    "rear_left_wheel",
    "rear_right_wheel",
    "wheel_fl",
    "wheel_fr",
    "wheel_rl",
    "wheel_rr",
}


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def box_center(box: Iterable[float]) -> tuple[float, float]:
    values = [float(v) for v in box]
    if len(values) != 4:
        raise ValueError(f"Expected 4 bbox values, got {len(values)}")
    x1, y1, x2, y2 = values
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def point_from_box(box: Iterable[float], width: int, height: int) -> dict[str, float]:
    cx, cy = box_center(box)
    return {"x": clamp(cx / width, 0.0, 1.0), "y": clamp(cy / height, 0.0, 1.0)}


def sample_box_points(box: Iterable[float], width: int, height: int, samples: int = 12) -> list[dict[str, float]]:
    x1, y1, x2, y2 = [float(v) for v in box]
    xs = np.linspace(x1, x2, samples)
    ys = np.linspace(y1, y2, samples)
    out: list[dict[str, float]] = []
    for i in range(samples):
        x = float(xs[i])
        y = float(ys[i])
        out.append({"x": clamp(x / width, 0.0, 1.0), "y": clamp(y / height, 0.0, 1.0)})
    return out


def label_for_box(box: Any, class_names: dict[int, str]) -> str:
    cls_id = int(box.cls[0]) if hasattr(box, "cls") and len(box.cls) > 0 else None
    if cls_id is None:
        return ""
    return class_names.get(int(cls_id), "")


def detection_candidates(results: Any, candidates: set[str]) -> list[dict[str, Any]]:
    if results is None or not hasattr(results, "boxes") or results.boxes is None:
        return []

    class_names = getattr(results, "names", {})
    found: list[dict[str, Any]] = []
    for i, box in enumerate(results.boxes):
        label = label_for_box(box, class_names)
        if label in candidates:
            found.append({
                "box": [float(v) for v in box.xyxy[i]],
                "conf": float(box.conf[i]),
                "cls": label,
            })
    return found


def choose_front_tires(results: Any) -> tuple[dict[str, float], dict[str, float]]:
    candidates = detection_candidates(results, WHEEL_CLASSES)
    if not candidates:
        return {"x": 0.0, "y": 0.0}, {"x": 0.0, "y": 0.0}

    def label_sort_key(item: dict[str, Any]) -> tuple[str, float]:
        label = item["cls"]
        left_bias = 0.0 if "left" in label else 1.0
        x_center = box_center(item["box"])[0]
        return (left_bias, x_center)

    ordered = sorted(candidates, key=label_sort_key)
    left = min(ordered, key=lambda item: box_center(item["box"])[0])
    right = max(ordered, key=lambda item: box_center(item["box"])[0])
    return left["point"], right["point"]


def extract_front_tires(results: Any, width: int, height: int) -> tuple[dict[str, float], dict[str, float]]:
    candidates = detection_candidates(results, WHEEL_CLASSES)
    if not candidates:
        return {"x": 0.0, "y": 0.0}, {"x": 0.0, "y": 0.0}

    by_name = {}
    for item in candidates:
        by_name.setdefault(item["cls"], item)

    front_left = by_name.get("wheel_front_left") or by_name.get("front_left_wheel") or by_name.get("wheel_fl")
    front_right = by_name.get("wheel_front_right") or by_name.get("front_right_wheel") or by_name.get("wheel_fr")

    if front_left is not None and front_right is not None:
        return point_from_box(front_left["box"], width, height), point_from_box(front_right["box"], width, height)

    left = min(candidates, key=lambda item: box_center(item["box"])[0])
    right = max(candidates, key=lambda item: box_center(item["box"])[0])

    left["point"] = point_from_box(left["box"], width, height)
    right["point"] = point_from_box(right["box"], width, height)
    return left["point"], right["point"]


def white_boundary_from_results(results: Any, width: int, height: int) -> tuple[list[dict[str, float]], list[dict[str, float]]]:
    white = detection_candidates(results, WHITE_LINE_CLASSES)
    if not white:
        return [], []

    chosen = max(white, key=lambda item: item["conf"])
    x1, y1, x2, y2 = chosen["box"]
    left_curve = []
    right_curve = []
    samples = 12
    ys = np.linspace(y1, y2, samples)
    for yi in ys:
        left_curve.append({"x": clamp(x1 / width, 0.0, 1.0), "y": clamp(float(yi) / height, 0.0, 1.0)})
        right_curve.append({"x": clamp(x2 / width, 0.0, 1.0), "y": clamp(float(yi) / height, 0.0, 1.0)})
    return left_curve, right_curve


def frame_to_payload(frame: np.ndarray, model: YOLO, batch_index: int, timestamp_sec: float) -> dict[str, Any]:
    results = model(frame, verbose=False, conf=0.25)[0]
    height, width = frame.shape[:2]

    left_boundary, right_boundary = white_boundary_from_results(results, width, height)
    tire_left, tire_right = extract_front_tires(results, width, height)

    # Fallback: if no distinct white boundary is seen, use the frame edges as a neutral estimate.
    if not left_boundary and not right_boundary:
        left_boundary = [{"x": 0.02, "y": float(i) / max(height - 1, 1)} for i in range(0, height, max(height // 12, 1))]
        right_boundary = [{"x": 0.98, "y": float(i) / max(height - 1, 1)} for i in range(0, height, max(height // 12, 1))]

    conf_values = [item["conf"] for item in detection_candidates(results, WHITE_LINE_CLASSES)]
    conf_values.extend(item["conf"] for item in detection_candidates(results, WHEEL_CLASSES))
    seg_conf = float(np.mean(conf_values)) if conf_values else 0.5

    return {
        "frameIndex": int(batch_index),
        "timestampSec": float(timestamp_sec),
        "leftBoundaryPx": left_boundary,
        "rightBoundaryPx": right_boundary,
        "tireLeftPx": tire_left,
        "tireRightPx": tire_right,
        "segConfidence": clamp(seg_conf, 0.0, 1.0),
        "frameWidth": int(width),
        "frameHeight": int(height),
    }


def iter_video_frames(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            yield frame_index, frame_index / fps, frame
            frame_index += 1
    finally:
        cap.release()


def send_batch(api_url: str, secret: str, payload: dict[str, Any]) -> None:
    headers = {"Content-Type": "application/json", "x-ingest-secret": secret}
    response = requests.post(api_url, data=json.dumps(payload), headers=headers, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"Ingest failed ({response.status_code}): {response.text}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run YOLO detections for a full-lap F1 track-limit analysis.")
    parser.add_argument("--video", required=True, help="Input video path")
    parser.add_argument("--model", required=True, help="YOLO model path (.pt)")
    parser.add_argument("--session-id", required=True, help="Existing session UUID")
    parser.add_argument("--api-url", required=True, help="Ingest endpoint URL")
    parser.add_argument("--secret", required=True, help="CV_INGEST_SECRET")
    parser.add_argument("--batch-size", type=int, default=30, help="Frames per batch")
    parser.add_argument("--conf", type=float, default=0.25, help="YOLO confidence threshold")
    parser.add_argument("--start-frame", type=int, default=0, help="Optional frame offset")
    args = parser.parse_args()

    model = YOLO(args.model)
    model.conf = args.conf
    batch: list[dict[str, Any]] = []
    total_sent = 0

    for frame_index, timestamp_sec, frame in iter_video_frames(args.video):
        if frame_index < args.start_frame:
            continue

        batch.append(frame_to_payload(frame, model, frame_index, timestamp_sec))
        if len(batch) >= args.batch_size:
            send_batch(args.api_url, args.secret, {"frames": batch})
            total_sent += len(batch)
            batch = []
            time.sleep(0.05)

    if batch:
        send_batch(args.api_url, args.secret, {"frames": batch})
        total_sent += len(batch)

    print(json.dumps({"ok": True, "framesSent": total_sent}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
