
"""Tài khoản, xác thực và lịch sử dự đoán lưu trong SQL."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import ALGORITHM, SECRET_KEY, create_token, hash_password, verify_password
from database import Base, engine, get_db
from models import (
    User,
    Prediction,
    IrisMau,
    IrisSpeciesSoluoc,
    IrisSpeciesChitiet,
    SampleFile,
    IrisData,
)

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


# --- DỮ LIỆU TÀI KHOẢN ---
class RegisterInput(BaseModel):
    username: str
    email: str
    password: str


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


# --- CƠ SỞ DỮ LIỆU: BỔ SUNG CẤU TRÚC CHO LỊCH SỬ CŨ ---
def ensure_prediction_model_column():
    """Bổ sung tên mô hình, giữ nguyên các bản ghi cũ (NULL)."""
    dialect = engine.dialect.name
    with engine.begin() as connection:
        if dialect == "postgresql":
            statement = 'ALTER TABLE "Predictions" ADD COLUMN IF NOT EXISTS "Model_Name" VARCHAR(50) NULL'
        elif dialect == "mssql":
            statement = "IF COL_LENGTH('Predictions', 'Model_Name') IS NULL ALTER TABLE [Predictions] ADD [Model_Name] VARCHAR(50) NULL"
        elif dialect == "sqlite":
            columns = {
                column["name"]
                for column in inspect(connection).get_columns("Predictions")
            }
            if "Model_Name" in columns:
                return
            statement = (
                'ALTER TABLE "Predictions" ADD COLUMN "Model_Name" VARCHAR(50) NULL'
            )
        else:
            raise RuntimeError("Chưa hỗ trợ cập nhật lịch sử cho cơ sở dữ liệu này.")
        connection.execute(text(statement))


# --- CƠ SỞ DỮ LIỆU: KHỞI TẠO BẢNG VÀ CẬP NHẬT CẤU TRÚC ---
def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_prediction_model_column()


# --- XÁC THỰC: LẤY TÀI KHOẢN TỪ TOKEN ---
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ.")

    if not username:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ.")

    user = db.query(User).filter(User.Username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Không tìm thấy tài khoản.")
    return user


# --- TÀI KHOẢN: ĐĂNG KÝ VÀ ĐĂNG NHẬP ---
@router.post("/register")
def register(data: RegisterInput, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.Username == data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    existing_email = db.query(User).filter(User.Email == data.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email đã được sử dụng.")

    new_user = User(
        Username=data.username,
        Email=data.email,
        Password=hash_password(data.password),
        Role="user",
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Tên đăng nhập hoặc email đã được sử dụng.",
        )
    db.refresh(new_user)
    return {"message": "Account created successfully"}


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.Email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.Password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return {
        "access_token": create_token(user.Username),
        "token_type": "bearer",
        "username": user.Username,
        "role": user.Role,
    }


# --- TÀI KHOẢN: ĐỔI MẬT KHẨU ---
@router.post("/account/change-password")
def change_password(
    data: ChangePasswordInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.Password):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng.")

    if verify_password(data.new_password, current_user.Password):
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới phải khác mật khẩu hiện tại.",
        )

    current_user.Password = hash_password(data.new_password)
    db.commit()
    return {"message": "Đổi mật khẩu thành công."}


# --- LỊCH SỬ: LƯU KẾT QUẢ VÀ TÊN MÔ HÌNH ---
def save_prediction(db: Session, user: User, data, result: dict):
    """Lưu một dự đoán sau khi mô hình đã tính xong."""
    db.add(
        Prediction(
            User_ID=user.User_ID,
            Sepal_Length=data.sepal_length,
            Sepal_Width=data.sepal_width,
            Petal_Length=data.petal_length,
            Petal_Width=data.petal_width,
            Prediction=result["prediction"],
            Confidence=result["confidence"],
            Model_Name=result["model_name"],
        )
    )
    db.commit()


# --- LỊCH SỬ: ĐỌC VÀ XÓA THEO TÀI KHOẢN ---
@router.get("/history")
def history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = (
        db.query(Prediction).filter(Prediction.User_ID == current_user.User_ID).all()
    )
    result = jsonable_encoder(records)

    database_timezone = (
        timezone.utc
        if db.get_bind().dialect.name == "postgresql"
        else datetime.now().astimezone().tzinfo
    )
    for item, record in zip(result, records):
        created = record.Created_Time
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=database_timezone)
            item["Created_Time"] = created.isoformat()
    return result


@router.delete("/history")
def delete_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted_count = (
        db.query(Prediction)
        .filter(Prediction.User_ID == current_user.User_ID)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {
        "message": "Prediction history deleted successfully",
        "deleted_count": deleted_count,
    }


# --- DỮ LIỆU IRIS: MẪU, BIỂU ĐỒ, THÔNG TIN LOÀI VÀ TỆP MẪU ---
@router.get("/iris/sample")
def get_iris_sample(db: Session = Depends(get_db)):
    return db.query(IrisMau).all()


@router.get("/iris/data")
def get_iris_data(db: Session = Depends(get_db)):
    return db.query(IrisData).all()


@router.get("/iris/summary")
def get_iris_summary(db: Session = Depends(get_db)):
    return db.query(IrisSpeciesSoluoc).all()


@router.get("/iris/detail")
def get_iris_detail(db: Session = Depends(get_db)):
    return db.query(IrisSpeciesChitiet).all()


@router.get("/sample-files")
def get_sample_files(db: Session = Depends(get_db)):
    return db.query(SampleFile).all()
