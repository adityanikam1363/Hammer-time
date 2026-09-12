# YOLO integration for TrackShift

This project already expects a CV service to send per-frame geometry to the ingest API. The cleanest way to plug in YOLO is to keep the model outside the main app and produce the same payload contract the backend already understands.

## Required custom classes

Train or fine-tune a YOLO model with these classes:

- `left_boundary`
- `right_boundary`
- `front_tire_left`
- `front_tire_right`
- `car` (optional, useful for filtering posture and wheel assignment)

The model should be used on the same track setup and same camera view when possible. For a single circuit, the same model can usually be reused across multiple race clips.

## Expected payload format

The ingest endpoint accepts JSON shaped like:

```json
{
  "frames": [{
    "frameIndex": 0,
    "timestampSec": 0.0,
    "leftBoundaryPx": [{ "x": 0.12, "y": 0.1 }, { "x": 0.14, "y": 0.9 }],
    "rightBoundaryPx": [{ "x": 0.88, "y": 0.1 }, { "x": 0.86, "y": 0.9 }],
    "tireLeftPx": { "x": 0.31, "y": 0.74 },
    "tireRightPx": { "x": 0.69, "y": 0.74 },
    "segConfidence": 0.92,
    "frameWidth": 1920,
    "frameHeight": 1080
  }]
}
```

The app then does the curve fit and violation detection automatically.

## Script entry point

See the starter inference script at [scripts/yolo_trackshift_ingest.py](../scripts/yolo_trackshift_ingest.py).

Run it like this:

```bash
python -m pip install -r requirements-cv.txt
python scripts/yolo_trackshift_ingest.py \
  --video /path/to/race.mp4 \
  --model /path/to/custom_yolov8.pt \
  --session-id <uuid> \
  --api-url http://localhost:3000/api/public/ingest/<uuid>/frames \
  --secret $CV_INGEST_SECRET \
  --batch-size 30
```

## Important design rule

Do not decide the violation from the driver-head camera itself. The violation rule should come from the front two tires against the fitted left/right boundary, as implemented in [src/lib/trackshift/geometry.ts](../src/lib/trackshift/geometry.ts).

That keeps the decision logic deterministic and aligned with the app's existing math.
