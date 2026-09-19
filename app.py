from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import os

model_bundle = joblib.load("iris_svm_model.pkl")
model = model_bundle["model"]
target_names = model_bundle["target_names"]
if not hasattr(model, "predict_proba"):
    raise RuntimeError("Mô hình chưa hỗ trợ predict_proba; hãy huấn luyện lại bằng train.py.")

app = FastAPI(title="Iris SVM API")

# Mở CORS để Frontend gọi API không bị chặn
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IrisInput(BaseModel):
    sepal_length: float
    sepal_width: float
    petal_length: float
    petal_width: float

@app.get("/", response_class=HTMLResponse)
def home():
    if not os.path.exists("index.html"):
        return "<h3>Không tìm thấy file index.html</h3>"

    with open("index.html", "r", encoding="utf-8") as file:
        return file.read()
from fastapi.responses import FileResponse

@app.get("/{image_name}.jpg")
def flower_image(image_name: str):
    if image_name not in {"setosa", "versicolor", "virginica"}:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(f"{image_name}.jpg")
@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/predict")
def predict(data: IrisInput):
    try:
        features = [[
            data.sepal_length,
            data.sepal_width,
            data.petal_length,
            data.petal_width
        ]]
        
        prediction_idx = int(model.predict(features)[0])
        predicted_name = target_names[prediction_idx]

        # Xác suất được sắp theo model.classes_, không lấy vị trí bằng mã nhãn.
        scores = model.predict_proba(features)[0]
        probabilities = {
            target_names[int(label)]: round(float(score) * 100, 2)
            for label, score in zip(model.classes_, scores)
        }
        confidence = probabilities[predicted_name]

        return {
            "prediction": predicted_name,
            "confidence": confidence,
            "probabilities": probabilities
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
