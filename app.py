# --- THƯ VIỆN CHUẨN ---
import csv
import io
import math
import os
import runpy
from contextlib import asynccontextmanager
from time import perf_counter
from zipfile import BadZipFile

# --- THƯ VIỆN API, MÔ HÌNH VÀ TỆP ---
import joblib
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook
from pydantic import BaseModel
from sqlalchemy.orm import Session

# --- CƠ SỞ DỮ LIỆU VÀ XÁC THỰC ---
from database import get_db
from models import User
from sql_api import get_current_user, router as sql_router, save_prediction

# ĐƯỜNG DẪN TỆP
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "iris_svm_model.pkl")
INDEX_PATH = os.path.join(BASE_DIR, "index.html")
STATIC_DIR = os.path.join(BASE_DIR, "static")
# ĐỌC MÔ HÌNH AI
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError("Không tìm thấy iris_svm_model.pkl")
model_bundle = joblib.load(MODEL_PATH)
required_keys = [
    "models",
    "model_names",
    "model_types",
    "evaluations",
    "default_model",
    "target_names",
]
missing_keys = [key for key in required_keys if key not in model_bundle]
if missing_keys:

    runpy.run_path(os.path.join(BASE_DIR, "train.py"), run_name="__main__")

    model_bundle = joblib.load(MODEL_PATH)
models = model_bundle["models"]
model_names = model_bundle["model_names"]
model_types = model_bundle["model_types"]
evaluations = model_bundle["evaluations"]
default_model = model_bundle["default_model"]
target_names = model_bundle["target_names"]


# KHỞI TẠO FASTAPI
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iris Studio API started")
    yield
    print("Iris Studio API stopped")



app = FastAPI(
    title="Iris Studio API",
    description="API phân loại hoa Iris và lưu lịch sử dự đoán",
    version="3.0.0",
    lifespan=lifespan,
)
app.include_router(sql_router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- DỮ LIỆU ĐẦU VÀO ---
class IrisInput(BaseModel):
    sepal_length: float
    sepal_width: float
    petal_length: float
    petal_width: float
    model_name: str = "svm_rbf"


FILE_COLUMNS = (
    "sepal_length",
    "sepal_width",
    "petal_length",
    "petal_width",
)


FILE_COLUMN_ALIASES = {
    "sepal_length": ("sepal_length", "sepallengthcm"),
    "sepal_width": ("sepal_width", "sepalwidthcm"),
    "petal_length": ("petal_length", "petallengthcm"),
    "petal_width": ("petal_width", "petalwidthcm"),
}
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_FILE_ROWS = 2000


# --- DỰ ĐOÁN CHUNG ---
def run_prediction(model_key: str, features: list[list[float]]):
    if model_key not in models:
        raise HTTPException(status_code=400, detail="Tên mô hình không hợp lệ")
    selected_model = models[model_key]
    start_time = perf_counter()
    prediction_idx = int(selected_model.predict(features)[0])
    predicted_name = target_names[prediction_idx]
    scores = selected_model.predict_proba(features)[0]
    prediction_time = (perf_counter() - start_time) * 1000
    probabilities = {
        target_names[int(label)]: round(float(score) * 100, 2)
        for label, score in zip(selected_model.classes_, scores)
    }
    model_type = model_types.get(model_key, ("Không xác định", "Không xác định"))
    return {
        "prediction": predicted_name,
        "confidence": probabilities[predicted_name],
        "probabilities": probabilities,
        "prediction_time_ms": round(prediction_time, 3),
        "model_name": model_key,
        "model_display_name": model_names.get(model_key, model_key),
        "family": model_type[0],
        "boundary": model_type[1],
    }


# TRANG CHỦ
@app.get("/", response_class=HTMLResponse)
def home():
    if os.path.exists(INDEX_PATH):
        with open(INDEX_PATH, "r", encoding="utf-8") as page:
            return page.read()
    return """
    <h3>
    Iris Studio API đang hoạt động
    </h3>
    """
# --- ẢNH HOA ---
@app.get("/{image_name}.jpg")
def flower_image(image_name: str):
    if image_name not in {"setosa", "versicolor", "virginica"}:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = os.path.join(BASE_DIR, f"{image_name}.jpg")

    if not os.path.isfile(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(image_path)


# HEALTH CHECK
@app.get("/health")
def health():
    return {"status": "healthy", "models_loaded": len(models), "default_model": default_model}


# DỰ ĐOÁN VÀ LƯU LỊCH SỬ
@app.post("/predict")
def predict(
    data: IrisInput, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        features = [[data.sepal_length, data.sepal_width, data.petal_length, data.petal_width]]
        result = run_prediction(data.model_name, features)
        # Lưu kết quả vào SQL Server
        save_prediction(db, current_user, data, result)
        return result
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


# --- TRANG DỰ ĐOÁN VÀ CÂU CHUYỆN: SO SÁNH MÔ HÌNH ---
@app.post("/predict/all")
def predict_all(data: IrisInput):
    features = [[data.sepal_length, data.sepal_width, data.petal_length, data.petal_width]]
    predictions = {model_key: run_prediction(model_key, features) for model_key in models}
    return {"default_model": default_model, "total_models": len(models), "predictions": predictions}


# ĐÁNH GIÁ MÔ HÌNH
@app.get("/models/evaluation")
def get_models_evaluation():
    if not evaluations:
        raise HTTPException(status_code=503, detail="Chưa có dữ liệu đánh giá")
    return {"default_model": default_model, "models": evaluations}

# ĐÁNH GIÁ MÔ HÌNH
@app.get("/models/evaluation")
def get_models_evaluation():
    if not evaluations:
        raise HTTPException(status_code=503, detail="Chưa có dữ liệu đánh giá")
    return {"default_model": default_model, "models": evaluations}


# DỰ ĐOÁN FILE CSV/XLSX
@app.post("/predict/file")
async def predict_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()

    if extension not in {".csv", ".xlsx"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ tệp .csv hoặc .xlsx.")

    content = await file.read(MAX_FILE_BYTES + 1)
    await file.close()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="Tệp phải nhỏ hơn 5 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="Tệp đang trống.")

    workbook = None
    try:
        if extension == ".csv":
            try:
                data = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail="Tệp CSV cần được lưu dưới dạng UTF-8.")

            try:
                dialect = csv.Sniffer().sniff(data[:4096], delimiters=",;\t")
                delimiter = dialect.delimiter
            except csv.Error:
                delimiter = ","

            reader = csv.reader(io.StringIO(data, newline=""), delimiter=delimiter)
            headers = next(reader, [])
            source_rows = reader
        else:
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            source_rows = workbook.active.iter_rows(values_only=True)
            headers = next(source_rows, [])

        headers = [str(value).strip() if value is not None else "" for value in headers]
        normalized = [header.lower() for header in headers]

        if len(set(normalized)) != len(normalized) or any(not header for header in headers):
            raise HTTPException(
                status_code=400, detail="Dòng tiêu đề không được trống hoặc trùng tên cột."
            )

        measurement_columns = {
            column: next(
                (
                    headers[normalized.index(alias)]
                    for alias in FILE_COLUMN_ALIASES[column]
                    if alias in normalized
                ),
                None,
            )
            for column in FILE_COLUMNS
        }

        missing = [column for column in FILE_COLUMNS if measurement_columns[column] is None]
        if missing:
            raise HTTPException(status_code=400, detail="Thiếu cột: " + ", ".join(missing))

        results = []

        for row_number, row in enumerate(source_rows, start=2):
            if not any(value is not None and str(value).strip() for value in row):
                continue

            if len(results) >= MAX_FILE_ROWS:
                raise HTTPException(
                    status_code=400, detail="Tệp chỉ được chứa tối đa 2000 dòng dữ liệu."
                )

            original = {
                header: (str(row[index]) if index < len(row) and row[index] is not None else "")
                for index, header in enumerate(headers)
            }
            result = {"row_number": row_number, "original": original}

            try:
                if len(row) > len(headers) and any(
                    str(value).strip() for value in row[len(headers) :] if value is not None
                ):
                    raise ValueError("Số cột vượt quá dòng tiêu đề.")

                features = []
                for column in FILE_COLUMNS:
                    raw = original[measurement_columns[column]].strip().replace(",", ".")
                    value = float(raw)

                    if not math.isfinite(value) or value < 0:
                        raise ValueError("Các số đo phải không âm và hữu hạn.")
                    features.append(value)

                prediction = run_prediction(default_model, [features])
                result.update(
                    {
                        "prediction": prediction["prediction"],
                        "confidence": prediction["confidence"],
                        "probabilities": prediction["probabilities"],
                        "error": None,
                        "warning": (
                            "Có số đo 0 cm; hãy kiểm tra dữ liệu gốc." if 0 in features else None
                        ),
                    }
                )
            except ValueError as error:
                result.update(
                    {
                        "prediction": None,
                        "confidence": None,
                        "probabilities": None,
                        "error": str(error),
                        "warning": None,
                    }
                )

            results.append(result)

        if not results:
            raise HTTPException(status_code=400, detail="Tệp không có dòng dữ liệu nào.")
        return {
            "filename": filename,
            "model_name": default_model,
            "columns": headers,
            "measurement_columns": measurement_columns,
            "total": len(results),
            "success": sum(item["error"] is None for item in results),
            "results": results,
        }

    except HTTPException:
        raise
    except (ValueError, OSError, KeyError, EOFError, BadZipFile, csv.Error) as error:
        raise HTTPException(status_code=400, detail=f"Không đọc được tệp: {error}")
    finally:
        if workbook is not None:
            workbook.close()
