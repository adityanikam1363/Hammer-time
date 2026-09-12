#!/usr/bin/env python3
"""YOLO -> TrackShift ingestion bridge.

This starter script is designed for the same-track setup the app expects:
- a custom YOLO model trained to detect the track edge(s) and the front tires
- optional car detection if you want to refine wheel selection

The output payload matches the ingestion contract in docs/cv-ingest-api.md and
src/routes/api/public/ingest.$sessionId.frames.ts.

Expected classes in the custom model:
- left_boundary
- right_boundary
- front_tire_left
- front_tire_right
- car (optional)

Usage:
    python scripts/yolo_trackshift_ingest.py \
      --video /path/to/video.mp4 \
      --model /path/to/custom_yolov8.pt \
      --session-id <uuid> \
      --api-url http://localhost:3000/api/public/ingest/<uuid>/frames \
      --secret $CV_INGEST_SECRET \
      --batch-size 30
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
import requests

try:
    from ultralytics import YOLO
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"ultralytics is required. Install it with: pip install -r requirements-cv.txt\n{exc}")


CLASS_LEFT_BOUNDARY = "left_boundary"
CLASS_RIGHT_BOUNDARY = "right_boundary"
CLASS_TIRE_LEFT = "front_tire_left"
CLASS_TIRE_RIGHT = "front_tire_right"
CLASS_CAR = "car"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def box_center(box: Iterable[float]) -> tuple[float, float]:
    xs = [float(v) for v in box]
    if len(xs) != 4:
        raise ValueError(f"Expected 4 values in bounding box, got {len(xs)}")
    x1, y1, x2, y2 = xs
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def sample_box_points(box: Iterable[float], width: int, height: int, samples: int = 12) -> list[dict[str, float]]:
    x1, y1, x2, y2 = [float(v) for v in box]
    xs = np.linspace(x1, x2, samples)
    ys = np.linspace(y1, y2, samples)
    points: list[dict[str, float]] = []
    for i in range(samples):
        x = float(xs[i])
        y = float(ys[i])
        points.append({"x": clamp(x / width, 0.0, 1.0), "y": clamp(y / height, 0.0, 1.0)})
    return points


def point_from_box(box: Iterable[float], width: int, height: int) -> dict[str, float]:
    cx, cy = box_center(box)
    return {"x": clamp(cx / width, 0.0, 1.0), "y": clamp(cy / height, 0.0, 1.0)}


def best_detection(results: Any, class_name: str) -> dict[str, Any] | None:
    if results is None or not hasattr(results, "boxes"):
        return None

    for i, box in enumerate(results.boxes):
        cls_id = int(box.cls[i]) if hasattr(box, "cls") and len(box.cls) > i else None
        names = getattr(results, "names", {})
        label = names.get(cls_id, "") if cls_id is not None else ""
        if label == class_name:
            return {
                "box": [float(v) for v in box.xyxy[i]],
                "conf": float(box.conf[i]),
                "cls": label,
            }
    return None


def frame_to_payload(frame: np.ndarray, model: YOLO, batch_index: int, timestamp_sec: float) -> dict[str, Any]:
    results = model(frame, verbose=False, conf=0.25)[0]
    names = getattr(results, "names", {})

    left = best_detection(results, CLASS_LEFT_BOUNDARY)
    right = best_detection(results, CLASS_RIGHT_BOUNDARY)
    front_left = best_detection(results, CLASS_TIRE_LEFT)
    front_right = best_detection(results, CLASS_TIRE_RIGHT)

    height, width = frame.shape[:2]

    left_boundary = sample_box_points(left["box"], width, height) if left else []
    right_boundary = sample_box_points(right["box"], width, height) if right else []

    tire_left = point_from_box(front_left["box"], width, height) if front_left else {"x": 0.0, "y": 0.0}
    tire_right = point_from_box(front_right["box"], width, height) if front_right else {"x": 0.0, "y": 0.0}

    seg_conf = 0.0
    if left:
        seg_conf = max(seg_conf, left["conf"])
    if right:
        seg_conf = max(seg_conf, right["conf"])
    if front_left:
        seg_conf = max(seg_conf, front_left["conf"])
    if front_right:
        seg_conf = max(seg_conf, front_right["conf"])

    if seg_conf == 0.0:
        seg_conf = 0.01

    return {
        "frameIndex": int(batch_index),
        "timestampSec": float(timestamp_sec),
        "leftBoundaryPx": left_boundary,
        "rightBoundaryPx": right_boundary,
        "tireLeftPx": tire_left,
        "tireRightPx": tire_right,
        "segConfidence": float(seg_conf),
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
    parser = argparse.ArgumentParser(description="Run YOLO detections and ingest TrackShift frames.")
    parser.add_argument("--video", required=True, help="Input video path")
    parser.add_argument("--model", required=True, help="YOLO model path (.pt)")
    parser.add_argument("--session-id", required=True, help="Existing session UUID")
    parser.add_argument("--api-url", required=True, help="Ingest endpoint URL, e.g. http://localhost:3000/api/public/ingest/<sessionId>/frames")
    parser.add_argument("--secret", required=True, help="CV_INGEST_SECRET")
    parser.add_argument("--batch-size", type=int, default=30, help="Number of frames per batch")
    parser.add_argument("--conf", type=float, default=0.25, help="YOLO confidence threshold")
    parser.add_argument("--start-frame", type=int, default=0, help="Optional frame offset")
    args = parser.parse_args()

    model = YOLO(args.model)
    frames: list[dict[str, Any]] = []
    total_sent = 0

    for frame_index, timestamp_sec, frame in iter_video_frames(args.video):
        if frame_index < args.start_frame:
            continue

        # Local inference for one frame.
        model.conf = args.conf
        payload = frame_to_payload(frame, model, frame_index, timestamp_sec)
        frames.append(payload)

        if len(frames) >= args.batch_size:
            send_batch(args.api_url, args.secret, {"frames": frames})
            total_sent += len(frames)
            frames = []
            time.sleep(0.05)

    if frames:
        send_batch(args.api_url, args.secret, {"frames": frames})
        total_sent += len(frames)

    print(json.dumps({"ok": True, "framesSent": total_sent}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
