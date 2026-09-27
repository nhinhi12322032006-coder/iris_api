# IMPORT THƯ VIỆN
from contextlib import asynccontextmanager
from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Depends
)
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from fastapi.responses import (
    HTMLResponse,
    FileResponse
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
import joblib
import os
import runpy
import csv
import io
import math
from zipfile import BadZipFile
from openpyxl import load_workbook
from time import perf_counter

# DATABASE + AUTH
from database import Base, engine, get_db
from models import (
    User,
    Prediction
)
from auth import (
    SECRET_KEY,
    ALGORITHM,
    hash_password,
    verify_password,
    create_token
)
# ĐƯỜNG DẪN TỆP
BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)
MODEL_PATH = os.path.join(
    BASE_DIR,
    "iris_svm_model.pkl"
)
INDEX_PATH = os.path.join(
    BASE_DIR,
    "index.html"
)
STATIC_DIR = os.path.join(
    BASE_DIR,
    "static"
)
# ĐỌC MÔ HÌNH AI
if not os.path.exists(MODEL_PATH):

    raise FileNotFoundError(
        "Không tìm thấy iris_svm_model.pkl"
    )
model_bundle = joblib.load(
    MODEL_PATH
)
required_keys = [
    "models",
    "model_names",
    "model_types",
    "evaluations",
    "default_model",
    "target_names",
]
missing_keys = [
    key
    for key in required_keys
    if key not in model_bundle
]
if missing_keys:

    runpy.run_path(
        os.path.join(
            BASE_DIR,
            "train.py"
        ),
        run_name="__main__"
    )

    model_bundle = joblib.load(
        MODEL_PATH
    )
models = model_bundle["models"]
model_names = model_bundle["model_names"]
model_types = model_bundle["model_types"]
evaluations = model_bundle["evaluations"]
default_model = model_bundle["default_model"]
target_names = model_bundle["target_names"]

# KHỞI TẠO FASTAPI
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="IrisAI Studio API",
    description="API phân loại hoa Iris và lưu lịch sử dự đoán",
    version="3.0.0",
    lifespan=lifespan
)
# Xác thực người dùng

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/login"
)

# Lấy thông tin người dùng đang đăng nhập

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")


        user = (
            db.query(User)
            .filter(
                User.Username == username
            )
            .first()
        )


        if not user:

            raise HTTPException(
                status_code=401,
                detail="User not found"
            )


        return user


    except Exception as e:
        print("JWT ERROR:", e)

        raise HTTPException(
            status_code=401,
            detail=str(e)
        )
app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DỮ LIỆU ĐẦU VÀO
class IrisInput(BaseModel):
    sepal_length: float
    sepal_width: float
    petal_length: float
    petal_width: float
    model_name: str = "svm_rbf"
class RegisterInput(BaseModel):
    username: str
    email: str
    password: str
class LoginInput(BaseModel):
    username: str
    password: str
class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str
FILE_COLUMN_ALIASES = {
    "sepal_length": ("sepal_length", "sepallengthcm"),
    "sepal_width": ("sepal_width", "sepalwidthcm"),
    "petal_length": ("petal_length", "petallengthcm"),
    "petal_width": ("petal_width", "petalwidthcm"),
}
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_FILE_ROWS = 2000

# TRANG CHỦ
@app.get(
    "/",
    response_class=HTMLResponse
)
def home():
    if os.path.exists(INDEX_PATH):
        with open(
            INDEX_PATH,
            "r",
            encoding="utf-8"
        ) as page:
            return page.read()
    return """
    <h3>
    IrisAI Studio API đang hoạt động
    </h3>
    """

# HEALTH CHECK
@app.get("/health")
def health():
    return {
        "status": "healthy",
        "models_loaded": len(models),
        "default_model": default_model
    }

# ĐĂNG KÝ TÀI KHOẢN
@app.post("/register")
def register(
    data: RegisterInput,
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(User)
        .filter(
            User.Username == data.username
        )
        .first()
    )
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )
    new_user = User(
        Username=data.username,
        Email=data.email,
        Password=hash_password(
            data.password
        ),
        Role="user"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message":
        "Account created successfully"
    }

# ĐĂNG NHẬP
@app.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):

    user = (
        db.query(User)
        .filter(
            User.Username == form_data.username
        )
        .first()
    )


    if not user:

        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password"
        )


    if not verify_password(
        form_data.password,
        user.Password
    ):

        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password"
        )


    token = create_token(
        user.Username
    )


    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.Username,
        "role": user.Role

    }
@app.post("/account/change-password")
def change_password(
    data: ChangePasswordInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(data.current_password, current_user.Password):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng.")

    if verify_password(data.new_password, current_user.Password):
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải khác mật khẩu hiện tại.")

    current_user.Password = hash_password(data.new_password)
    db.commit()
    return {"message": "Đổi mật khẩu thành công."}
# HÀM DỰ ĐOÁN CHUNG
def run_prediction(
    model_key: str,
    features: list[list[float]]
):
    if model_key not in models:
        raise HTTPException(
            status_code=400,
            detail="Tên mô hình không hợp lệ"
        )
    selected_model = models[model_key]
    start_time = perf_counter()
    prediction_idx = int(
        selected_model.predict(features)[0]
    )
    predicted_name = target_names[prediction_idx]
    scores = selected_model.predict_proba(features)[0]
    prediction_time = (
        perf_counter() - start_time
    ) * 1000
    probabilities = {
        target_names[int(label)]:
        round(float(score) * 100, 2)
        for label, score
        in zip(
            selected_model.classes_,
            scores
        )
    }
    model_type = model_types.get(
        model_key,
        (
            "Không xác định",
            "Không xác định"
        )
    )
    return {
        "prediction": predicted_name,
        "confidence":
        probabilities[predicted_name],
        "probabilities": probabilities,
        "prediction_time_ms":
        round(prediction_time, 3),
        "model_name": model_key,
        "model_display_name":
        model_names.get(
            model_key,
            model_key
        ),
        "family": model_type[0],
        "boundary": model_type[1]
    }
# DỰ ĐOÁN VÀ LƯU LỊCH SỬ
@app.post("/predict")
def predict(
    data: IrisInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        features = [[
            data.sepal_length,
            data.sepal_width,
            data.petal_length,
            data.petal_width
        ]]
        result = run_prediction(
            data.model_name,
            features
        )
        # Lưu kết quả vào SQL Server
        new_prediction = Prediction(
            User_ID=current_user.User_ID,
            Sepal_Length=data.sepal_length,
            Sepal_Width=data.sepal_width,
            Petal_Length=data.petal_length,
            Petal_Width=data.petal_width,
            Prediction=result["prediction"],
            Confidence=result["confidence"]
        )
        db.add(new_prediction)
        db.commit()
        return result
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )
# Hoa
 
@app.get("/{image_name}.jpg")
def flower_image(image_name: str):
    if image_name not in {
        "setosa",
        "versicolor",
        "virginica"
    }:
        raise HTTPException(
            status_code=404,
            detail="Image not found"
        )

    image_path = os.path.join(
        BASE_DIR,
        f"{image_name}.jpg"
    )

    if not os.path.isfile(image_path):
        raise HTTPException(
            status_code=404,
            detail="Image not found"
        )

    return FileResponse(image_path)

# LẤY LỊCH SỬ DỰ ĐOÁN
@app.get("/history")
def history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    records = (
        db.query(Prediction)
        .filter(
            Prediction.User_ID ==
            current_user.User_ID
        )
        .all()

    )
    return records
# XÓA LỊCH SỬ DỰ ĐOÁN

@app.delete("/history")
def delete_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    deleted_count = (
        db.query(Prediction)
        .filter(
            Prediction.User_ID ==
            current_user.User_ID
        )
        .delete(
            synchronize_session=False
        )
    )

    db.commit()

    return {
        "message": "Prediction history deleted successfully",
        "deleted_count": deleted_count
    }
# ĐÁNH GIÁ MÔ HÌNH
@app.get("/models/evaluation")
def get_models_evaluation():
    if not evaluations:
        raise HTTPException(
            status_code=503,
            detail="Chưa có dữ liệu đánh giá"
        )
    return {
        "default_model": default_model,
        "models": evaluations
    }

# DỰ ĐOÁN FILE CSV/XLSX
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
@app.post("/predict/file")
async def predict_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()

    if extension not in {".csv", ".xlsx"}:
        raise HTTPException(
            status_code=400,
            detail="Chỉ hỗ trợ tệp .csv hoặc .xlsx."
        )

    content = await file.read(MAX_FILE_BYTES + 1)
    await file.close()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Tệp phải nhỏ hơn 5 MB."
        )
    if not content:
        raise HTTPException(
            status_code=400,
            detail="Tệp đang trống."
        )

    workbook = None
    try:
        if extension == ".csv":
            try:
                data = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="Tệp CSV cần được lưu dưới dạng UTF-8."
                )

            try:
                dialect = csv.Sniffer().sniff(
                    data[:4096],
                    delimiters=",;\t"
                )
                delimiter = dialect.delimiter
            except csv.Error:
                delimiter = ","

            reader = csv.reader(
                io.StringIO(data, newline=""),
                delimiter=delimiter
            )
            headers = next(reader, [])
            source_rows = reader
        else:
            workbook = load_workbook(
                io.BytesIO(content),
                read_only=True,
                data_only=True
            )
            source_rows = workbook.active.iter_rows(values_only=True)
            headers = next(source_rows, [])

        headers = [
            str(value).strip() if value is not None else ""
            for value in headers
        ]
        normalized = [header.lower() for header in headers]

        if len(set(normalized)) != len(normalized) or any(
            not header for header in headers
        ):
            raise HTTPException(
                status_code=400,
                detail="Dòng tiêu đề không được trống hoặc trùng tên cột."
            )

        measurement_columns = {
            column: next(
                (
                    headers[normalized.index(alias)]
                    for alias in FILE_COLUMN_ALIASES[column]
                    if alias in normalized
                ),
                None
            )
            for column in FILE_COLUMNS
        }

        missing = [
            column
            for column in FILE_COLUMNS
            if measurement_columns[column] is None
        ]
        if missing:
            raise HTTPException(
                status_code=400,
                detail="Thiếu cột: " + ", ".join(missing)
            )

        results = []

        for row_number, row in enumerate(source_rows, start=2):
            if not any(
                value is not None and str(value).strip()
                for value in row
            ):
                continue

            if len(results) >= MAX_FILE_ROWS:
                raise HTTPException(
                    status_code=400,
                    detail="Tệp chỉ được chứa tối đa 2000 dòng dữ liệu."
                )

            original = {
                header: (
                    str(row[index])
                    if index < len(row) and row[index] is not None
                    else ""
                )
                for index, header in enumerate(headers)
            }
            result = {
                "row_number": row_number,
                "original": original
            }

            try:
                if len(row) > len(headers) and any(
                    str(value).strip()
                    for value in row[len(headers):]
                    if value is not None
                ):
                    raise ValueError(
                        "Số cột vượt quá dòng tiêu đề."
                    )

                features = []
                for column in FILE_COLUMNS:
                    raw = original[
                        measurement_columns[column]
                    ].strip().replace(",", ".")
                    value = float(raw)

                    if not math.isfinite(value) or value < 0:
                        raise ValueError(
                            "Các số đo phải không âm và hữu hạn."
                        )
                    features.append(value)

                prediction = run_prediction(
                    default_model,
                    [features]
                )
                result.update({
                    "prediction": prediction["prediction"],
                    "confidence": prediction["confidence"],
                    "probabilities": prediction["probabilities"],
                    "error": None,
                    "warning": (
                        "Có số đo 0 cm; hãy kiểm tra dữ liệu gốc."
                        if 0 in features else None
                    )
                })
            except ValueError as error:
                result.update({
                    "prediction": None,
                    "confidence": None,
                    "probabilities": None,
                    "error": str(error),
                    "warning": None
                })

            results.append(result)

        if not results:
            raise HTTPException(
                status_code=400,
                detail="Tệp không có dòng dữ liệu nào."
            )

        return {
            "filename": filename,
            "model_name": default_model,
            "columns": headers,
            "measurement_columns": measurement_columns,
            "total": len(results),
            "success": sum(
                item["error"] is None for item in results
            ),
            "results": results
        }

    except HTTPException:
        raise
    except (
        ValueError, OSError, KeyError, EOFError, BadZipFile, csv.Error
    ) as error:
        raise HTTPException(
            status_code=400,
            detail=f"Không đọc được tệp: {error}"
        )
    finally:
        if workbook is not None:
            workbook.close()
# DỰ ĐOÁN TẤT CẢ MÔ HÌNH
@app.post("/predict/all")
def predict_all(
    data: IrisInput
):
    features = [[
        data.sepal_length,
        data.sepal_width,
        data.petal_length,
        data.petal_width
    ]]
    predictions = {
        model_key:
        run_prediction(
            model_key,
            features
        )
        for model_key in models
    }
    return {
        "default_model":
        default_model,
        "total_models":
        len(models),
        "predictions":
        predictions
    }
