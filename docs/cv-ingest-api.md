# TrackShift backend — CV service contract

The external Python CV service (YOLOv8-seg) never runs inside this app. It posts raw
per-frame pixel detections here; everything downstream (curve fit, offsets, debounce,
composite confidence, turn assignment, persistence, realtime) runs in this backend.

## 1. Open a session

```
POST /api/public/sessions
{ "durationSec": 214, "videoUrl": "https://…", "trackSlug": "tt-assen",
  "calibration": [{ "turnNumber": 1, "timestampSec": 10.2, "xPct": 42.1, "yPct": 63.4 }] }
-> 201 { "id": "<uuid>", "status": "processing" }
```

## 2. Push detections (internal, shared secret)

```
POST /api/public/ingest/<sessionId>/frames
x-ingest-secret: <CV_INGEST_SECRET>
{ "frames": [{
    "frameIndex": 0, "timestampSec": 0.0,
    "leftBoundaryPx": [{ "x": 100, "y": 0 }, …],
    "rightBoundaryPx": [{ "x": 900, "y": 0 }, …],
    "tireLeftPx": { "x": 130, "y": 800 },
    "tireRightPx": { "x": 870, "y": 800 },
    "segConfidence": 0.9, "frameWidth": 1920, "frameHeight": 1080
  }] }
-> 200 { "ok": true, "framesIngested": 60, "violations": 3 }
```

Batches of up to 600 frames. Every field is validated; bad payloads return 422 and
write nothing. Violations are recomputed for the whole session on each batch, so an
excursion split across two batches still yields exactly one violation, and a steward's
confirm/dismiss decision is carried over.

## 3. Read endpoints (used by the dashboard)

- `GET /api/public/sessions/:id`
- `GET /api/public/sessions/:id/violations` — `Violation[]`
- `PATCH /api/public/sessions/:id/violations/:violationId` — `{ status }`
- `GET /api/public/sessions/:id/boundary-frame?t=<sec>` — nearest `BoundaryFrame`
- `GET /api/public/sessions/:id/calibration` — `CalibrationPoint[]`

Violations and boundary frames also stream over realtime while a session is processing.

## Math (see `src/lib/trackshift/geometry.ts`, unit tested)

1. Least-squares quadratic fit `x(y) = a·y² + b·y + c` per side, per frame.
2. `offsetLeft = tireLeft.x − xLeft(tireLeft.y)`, `offsetRight = tireRight.x − xRight(tireRight.y)`;
   breach when `offsetLeft < 0 || offsetRight > 0`.
3. Geometry normalised to 0–1 frame space; `offsetPx` on a violation stays in pixels.
4. Temporal debounce: 300 ms window, ≥60 % breached frames, one violation per excursion
   anchored at the largest-magnitude frame.
5. Confidence = 0.40·seg + 0.25·(1 − fit residual) + 0.20·temporal + 0.15·min(|offset|/50, 1),
   clamped and rounded to 2 decimals.
6. Turn assigned from the nearest calibration point.
