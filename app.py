from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

# 1. Tải mô hình
model = joblib.load("svm_model.pkl")

app = FastAPI(
    title="Iris Classification API",
    description="SVM model for the Iris dataset",
    version="1.0.0"
)

# --- ĐOẠN MÃ MỞ KHÓA BẢO MẬT (CORS) ĐỂ FILE INDEX.HTML TRUY CẬP ĐƯỢC ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cho phép tất cả các giao diện/file HTML gọi đến
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ---------------------------------------------------------------------

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
    features = [[
        data.sepal_length,
        data.sepal_width,
        data.petal_length,
        data.petal_width
    ]]
    prediction = int(model.predict(features))
    return {
        "class_id": prediction,
        "prediction": species[prediction]
    }
