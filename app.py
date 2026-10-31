# --- THƯ VIỆN CHUẨN ---
import csv
import io
import math
import os
import runpy
from contextlib import asynccontextmanager
from functools import lru_cache
from time import perf_counter
from zipfile import BadZipFile

# --- THƯ VIỆN API, MÔ HÌNH VÀ TỆP ---
import joblib
import numpy as np
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from openpyxl import load_workbook
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split

# --- CƠ SỞ DỮ LIỆU VÀ XÁC THỰC ---
from database import get_db
from models import User
from sql_api import get_current_user, router as sql_router, save_prediction, init_db

# ĐƯỜNG DẪN TỆP
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "iris_svm_model.pkl")
PUBLIC_FILES_DIR = os.path.join(BASE_DIR, "static", "files")
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
    init_db()
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

# --- CORS: CHỈ CHO PHÉP GIAO DIỆN ĐÃ CẤU HÌNH ---
# Trên Render đặt FRONTEND_URL bằng URL Static Site; không đặt URL của API.
frontend_origins = os.getenv("FRONTEND_ORIGINS") or os.getenv(
    "FRONTEND_URL", "http://localhost:5500,http://localhost:5173"
)
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in frontend_origins.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,  # Đăng nhập hiện tại dùng Bearer token, không dùng cookie API.
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
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


# --- TRANG CHỦ API: GIAO DIỆN ĐƯỢC TRIỂN KHAI Ở STATIC SITE RIÊNG ---
@app.get("/")
def home():
    return {"service": "Iris Studio API", "docs": "/docs", "health": "/health"}


# --- ẢNH HOA ---
@app.get("/{image_name}.jpg")
def flower_image(image_name: str):
    if image_name not in {"setosa", "versicolor", "virginica"}:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = os.path.join(BASE_DIR, f"{image_name}.jpg")

    if not os.path.isfile(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(image_path)


# --- TẢI TỆP MẪU: HEADER ATTACHMENT HỖ TRỢ GIAO DIỆN KHÁC ORIGIN ---
@app.get("/static/files/{file_name}", include_in_schema=False)
def download_sample(file_name: str):
    if (
        "/" in file_name
        or "\\" in file_name
        or os.path.splitext(file_name)[1].lower() not in {".csv", ".xlsx"}
    ):
        raise HTTPException(status_code=404, detail="Sample file not found")
    file_path = os.path.join(PUBLIC_FILES_DIR, file_name)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Sample file not found")
    return FileResponse(file_path, filename=file_name)


# HEALTH CHECK
@app.get("/health")
def health():
    return {
        "status": "healthy",
        "models_loaded": len(models),
        "default_model": default_model,
    }


# DỰ ĐOÁN VÀ LƯU LỊCH SỬ
@app.post("/predict")
def predict(
    data: IrisInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        features = [
            [data.sepal_length, data.sepal_width, data.petal_length, data.petal_width]
        ]
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
    features = [
        [data.sepal_length, data.sepal_width, data.petal_length, data.petal_width]
    ]
    predictions = {
        model_key: run_prediction(model_key, features) for model_key in models
    }
    return {
        "default_model": default_model,
        "total_models": len(models),
        "predictions": predictions,
    }


# --- ĐÁNH GIÁ: BÁO CÁO TỪ MA TRẬN ĐÃ LƯU VÀ CẤU HÌNH MÔ HÌNH ---
def model_evaluation_detail(model_key: str, metrics: dict):
    matrix = metrics.get("confusion_matrix")
    report = []
    if matrix is not None and len(matrix) == len(target_names):
        for i, species in enumerate(target_names):
            support = sum(matrix[i])
            predicted = sum(row[i] for row in matrix)
            true_positive = matrix[i][i]
            precision = true_positive / predicted if predicted else 0.0
            recall = true_positive / support if support else 0.0
            f1 = (
                2 * precision * recall / (precision + recall)
                if precision + recall
                else 0.0
            )
            report.append(
                {
                    "species": species,
                    "precision": round(precision * 100, 2),
                    "recall": round(recall * 100, 2),
                    "f1_score": round(f1 * 100, 2),
                    "support": int(support),
                }
            )
    parameter_keys = (
        "kernel",
        "C",
        "gamma",
        "degree",
        "coef0",
        "probability",
        "max_iter",
        "solver",
        "penalty",
        "criterion",
        "p",
        "n_neighbors",
        "weights",
        "metric",
        "max_depth",
        "min_samples_split",
        "min_samples_leaf",
        "random_state",
    )
    parameters = models[model_key].get_params()
    if parameters.get("kernel") != "poly":
        parameters.pop("degree", None)
    if parameters.get("kernel") not in {"poly", "sigmoid"}:
        parameters.pop("coef0", None)
    if parameters.get("kernel") == "linear":
        parameters.pop("gamma", None)
    return {
        **metrics,
        "classification_report": report,
        "parameters": {
            key: parameters[key] for key in parameter_keys if key in parameters
        },
    }


@app.get("/models/evaluation")
def get_models_evaluation():
    if not evaluations:
        raise HTTPException(status_code=503, detail="Chưa có dữ liệu đánh giá")
    return {
        "models": {
            key: model_evaluation_detail(key, metrics)
            for key, metrics in evaluations.items()
        },
        "default_model": default_model,
        "target_names": target_names,
        "test_size": model_bundle.get("test_size"),
        "cv_folds": model_bundle.get("cv_folds"),
        "random_state": model_bundle.get("random_state"),
    }


# --- GIỚI HẠN: ĐỐI CHIẾU SAI SỐ TRÊN CÙNG CÁC MẪU KIỂM TRA ---
@app.get("/models/robustness")
@lru_cache(maxsize=1)
def get_model_robustness():
    """Nhiễu tương đối có seed cố định; chỉ dự đoán, không huấn luyện/lưu lịch sử."""
    test_count = model_bundle.get("test_size")
    split_seed = model_bundle.get("random_state")
    iris = load_iris()
    if (
        not isinstance(test_count, int)
        or not 0 < test_count < len(iris.data)
        or not isinstance(split_seed, int)
    ):
        raise HTTPException(
            status_code=503,
            detail="Chưa đủ thông tin để tái tạo tập kiểm tra của mô hình.",
        )

    # Dùng đúng phép chia của train.py: shuffle=True, không stratify.
    _, test_indices = train_test_split(
        np.arange(len(iris.data)),
        test_size=test_count,
        random_state=split_seed,
    )
    values = iris.data[test_indices]
    truth = iris.target[test_indices]
    levels = [0, 5, 10, 15, 20, 30, 40, 50]
    noise_seed = 42
    directions = np.random.default_rng(noise_seed).uniform(-1.0, 1.0, values.shape)
    # Chia sẻ cùng số đo cho mọi mô hình; giữ độ chính xác đầy đủ để đối chiếu.
    noisy_values = [values * (1.0 + directions * level / 100.0) for level in levels]
    results = {}
    for key, model in models.items():
        baseline = model.predict(values)
        baseline_matrix = np.zeros((len(target_names), len(target_names)), dtype=int)
        np.add.at(baseline_matrix, (truth, baseline), 1)
        recorded = evaluations.get(key, {}).get("confusion_matrix")
        if recorded is None or not np.array_equal(
            baseline_matrix, np.asarray(recorded)
        ):
            raise HTTPException(
                status_code=503,
                detail="Tập kiểm tra tái tạo chưa khớp kết quả đã lưu; cần xác nhận lại cấu hình dữ liệu trước khi chạy thử nghiệm.",
            )

        runs = []
        for level, perturbed in zip(levels, noisy_values):
            # Mọi mô hình nhận cùng một bản sao số đo tại mức này.
            predicted = model.predict(perturbed)
            wrong = np.flatnonzero(predicted != truth)
            examples = []
            for i in wrong[:5]:
                examples.append(
                    {
                        "sample_id": int(test_indices[i]) + 1,
                        "actual": target_names[int(truth[i])],
                        "baseline_prediction": target_names[int(baseline[i])],
                        "prediction": target_names[int(predicted[i])],
                        "before": [round(float(v), 3) for v in values[i]],
                        "after": [round(float(v), 3) for v in perturbed[i]],
                    }
                )
            error_count = len(wrong)
            runs.append(
                {
                    "noise_pct": level,
                    "error_count": error_count,
                    "error_rate": round(error_count / test_count * 100, 2),
                    "accuracy": round((test_count - error_count) / test_count * 100, 2),
                    "changed_predictions": int(np.sum(predicted != baseline)),
                    "examples": examples,
                    "predictions": [target_names[int(label)] for label in predicted],
                }
            )
        results[key] = {"name": model_names.get(key, key), "runs": runs}
    return {
        "models": results,
        "noise_levels": levels,
        "samples": [
            {
                "sample_id": int(sample_id) + 1,
                "actual": target_names[int(label)],
                "before": row.tolist(),
            }
            for sample_id, label, row in zip(test_indices, truth, values)
        ],
        "measurements_by_level": [rows.tolist() for rows in noisy_values],
        "test_size": test_count,
        "split_seed": split_seed,
        "noise_seed": noise_seed,
        "feature_order": list(FILE_COLUMNS),
        "noise_method": "uniform_relative_bounded",
    }


# DỰ ĐOÁN FILE CSV/XLSX
@app.post("/predict/file")
async def predict_file(
    file: UploadFile = File(...),
    model_name: str = Form("svm_rbf"),
    current_user: User = Depends(get_current_user),
):
    if model_name not in models:
        raise HTTPException(status_code=400, detail="Tên mô hình không hợp lệ.")
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
                raise HTTPException(
                    status_code=400, detail="Tệp CSV cần được lưu dưới dạng UTF-8."
                )

            try:
                dialect = csv.Sniffer().sniff(data[:4096], delimiters=",;\t")
                delimiter = dialect.delimiter
            except csv.Error:
                delimiter = ","

            reader = csv.reader(io.StringIO(data, newline=""), delimiter=delimiter)
            headers = next(reader, [])
            source_rows = reader
        else:
            workbook = load_workbook(
                io.BytesIO(content), read_only=True, data_only=True
            )
            source_rows = workbook.active.iter_rows(values_only=True)
            headers = next(source_rows, [])

        headers = [str(value).strip() if value is not None else "" for value in headers]
        normalized = [header.lower() for header in headers]

        if len(set(normalized)) != len(normalized) or any(
            not header for header in headers
        ):
            raise HTTPException(
                status_code=400,
                detail="Dòng tiêu đề không được trống hoặc trùng tên cột.",
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

        missing = [
            column for column in FILE_COLUMNS if measurement_columns[column] is None
        ]
        if missing:
            raise HTTPException(
                status_code=400, detail="Thiếu cột: " + ", ".join(missing)
            )

        results = []

        for row_number, row in enumerate(source_rows, start=2):
            if not any(value is not None and str(value).strip() for value in row):
                continue

            if len(results) >= MAX_FILE_ROWS:
                raise HTTPException(
                    status_code=400,
                    detail="Tệp chỉ được chứa tối đa 2000 dòng dữ liệu.",
                )

            original = {
                header: (
                    str(row[index])
                    if index < len(row) and row[index] is not None
                    else ""
                )
                for index, header in enumerate(headers)
            }
            result = {"row_number": row_number, "original": original}

            try:
                if len(row) > len(headers) and any(
                    str(value).strip()
                    for value in row[len(headers) :]
                    if value is not None
                ):
                    raise ValueError("Số cột vượt quá dòng tiêu đề.")

                features = []
                for column in FILE_COLUMNS:
                    raw = (
                        original[measurement_columns[column]].strip().replace(",", ".")
                    )
                    value = float(raw)

                    if not math.isfinite(value) or value < 0:
                        raise ValueError("Các số đo phải không âm và hữu hạn.")
                    features.append(value)

                prediction = run_prediction(model_name, [features])
                result.update(
                    {
                        "prediction": prediction["prediction"],
                        "confidence": prediction["confidence"],
                        "probabilities": prediction["probabilities"],
                        "error": None,
                        "warning": (
                            "Có số đo 0 cm; hãy kiểm tra dữ liệu gốc."
                            if 0 in features
                            else None
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
            raise HTTPException(
                status_code=400, detail="Tệp không có dòng dữ liệu nào."
            )
        return {
            "filename": filename,
            "model_name": model_name,
            "model_display_name": model_names.get(model_name, model_name),
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
