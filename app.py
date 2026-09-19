from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import os

if not os.path.exists("svm_model.pkl"):
    raise FileNotFoundError("Chưa thấy file svm_model.pkl. Vui lòng chạy train.py trước!")

model = joblib.load("svm_model.pkl")

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

species = {0: "setosa", 1: "versicolor", 2: "virginica"}

@app.get("/")
def home():
    return {"message": "Iris SVM API is running"}

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
        predicted_name = species[prediction_idx]
        
        # Lấy xác suất độ tin cậy
        confidence = 100.0
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(features)[0]
            confidence = round(float(probs[prediction_idx]) * 100, 2)

        return {
            "prediction": predicted_name,
            "confidence": confidence
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))