import cv2
import os

VIDEO_PATH = "videos/f1_violation.mp4"
OUTPUT_DIR = "dataset/images/train"

os.makedirs(OUTPUT_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():
    print("ERROR: Could not open video")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

print(f"FPS: {fps}")
print(f"Total frames: {total_frames}")

frame_number = 0
saved = 0

FRAME_INTERVAL = 5

while True:
    ret, frame = cap.read()

    if not ret:
        break

    if frame_number % FRAME_INTERVAL == 0:
        filename = os.path.join(
            OUTPUT_DIR,
            f"frame_{saved:04d}.jpg"
        )

        cv2.imwrite(filename, frame)
        saved += 1

    frame_number += 1

cap.release()

print("Finished!")
print(f"Saved {saved} frames to {OUTPUT_DIR}")