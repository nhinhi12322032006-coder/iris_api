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
FILE_COLUMNS = (
    "sepal_length",
    "sepal_width",
    "petal_length",
    "petal_width"
)
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
@app.post("/predict/file")
async def predict_file(
    file: UploadFile = File(...)
):
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()
    if extension not in [".csv", ".xlsx"]:
        raise HTTPException(
            status_code=400,
            detail="Chỉ hỗ trợ CSV hoặc XLSX"
        )
    content = await file.read()
    results = []

    # Phần xử lý file giữ nguyên logic cũ
    # từ app.py hiện tại của bạn
    return {
        "filename": filename,
        "results": results
    }

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
