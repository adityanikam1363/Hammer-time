from ultralytics import YOLO

model = YOLO("yolov8n.pt")

model.train(
    data="dataset/dataset.yaml",
    epochs=50,
    imgsz=640,
    batch=8,
    name="hammer_time"
)