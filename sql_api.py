
"""Tài khoản, xác thực và lịch sử dự đoán lưu trong SQL."""

from datetime import datetime, timezone
import hashlib
import secrets
import time
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (KEYCLOAK_ISSUER, decode_access_token, public_auth_config, verify_password)
from database import Base, engine, get_db
from models import (
    User,
    ExternalIdentity,
    Prediction,
    IrisMau,
    IrisSpeciesSoluoc,
    IrisSpeciesChitiet,
    SampleFile,
    IrisData,
)

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


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


# --- SSO: CẤU HÌNH CÔNG KHAI VÀ ĐỊNH DANH ---
@router.get("/auth/config")
def auth_config():
    return public_auth_config()


def get_claims(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Bạn cần đăng nhập.", headers={"WWW-Authenticate": "Bearer"})
    return decode_access_token(credentials.credentials)


def get_current_user(claims: dict = Depends(get_claims), db: Session = Depends(get_db)):
    def lookup():
        return db.query(ExternalIdentity).filter_by(
            Issuer=KEYCLOAK_ISSUER, Subject=claims["sub"]
        ).first()

    identity = lookup()
    if identity:
        user = db.get(User, identity.User_ID)
        if user is None:
            raise HTTPException(500, "Liên kết tài khoản không còn hợp lệ.")
        return user

    digest = hashlib.sha256((KEYCLOAK_ISSUER + "\0" + claims["sub"]).encode()).hexdigest()[:40]
    # Các trường tương thích bảng Users cũ. Không phải email đăng nhập Keycloak.
    user = User(Username="sso_" + digest, Email=digest + "@identity.invalid",
                Password="!sso:" + secrets.token_hex(32), Role="user")
    db.add(user)
    try:
        db.flush()
        db.add(ExternalIdentity(Issuer=KEYCLOAK_ISSUER, Subject=claims["sub"], User_ID=user.User_ID))
        db.commit()
    except IntegrityError:
        db.rollback()
        identity = lookup()  # Hai yêu cầu đầu tiên có thể đến cùng lúc.
        if not identity:
            raise HTTPException(409, "Chưa thể tạo liên kết tài khoản. Hãy thử lại.")
        user = db.get(User, identity.User_ID)
    return user


@router.get("/auth/me")
def auth_me(claims: dict = Depends(get_claims), user: User = Depends(get_current_user)):
    return {"username": claims.get("preferred_username") or claims.get("name") or "Tài khoản",
            "email": claims.get("email"), "role": user.Role,
            "can_link_legacy": user.Password.startswith("!sso:")}


class LinkAccountInput(BaseModel):
    email: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=1024)


_link_lock = Lock()
_link_failures = {}


@router.post("/auth/link-account")
def link_account(data: LinkAccountInput, claims: dict = Depends(get_claims),
                 current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Người dùng chứng minh quyền sở hữu cả phiên Keycloak và tài khoản Iris cũ.
    # Không tự động ghép theo email hoặc tên hiển thị.
    now = time.monotonic()
    with _link_lock:
        for subject in list(_link_failures):
            if now - _link_failures[subject][1] >= 900:
                del _link_failures[subject]
        count, since = _link_failures.get(claims["sub"], (0, now))
        if count >= 5:
            raise HTTPException(429, "Đã thử sai nhiều lần. Hãy thử lại sau 15 phút.")
        _link_failures[claims["sub"]] = (count + 1, since)

    old = db.query(User).filter(User.Email == data.email.strip()).first()
    if old is None or not verify_password(data.password, old.Password):
        raise HTTPException(400, "Email hoặc mật khẩu Iris cũ không đúng.")
    identity = db.query(ExternalIdentity).filter_by(
        Issuer=KEYCLOAK_ISSUER, Subject=claims["sub"]
    ).first()
    if old.User_ID == current.User_ID:
        return {"message": "Tài khoản đã được liên kết."}
    if not current.Password.startswith("!sso:"):
        raise HTTPException(409, "Tài khoản này đã liên kết với một tài khoản Iris cũ.")
    if db.query(ExternalIdentity).filter_by(User_ID=old.User_ID).first():
        raise HTTPException(409, "Tài khoản Iris cũ đã liên kết với một tài khoản Identity Hub khác.")
    if identity is None:
        raise HTTPException(409, "Không tìm thấy định danh. Hãy tải lại trang.")
    try:
        # Giữ lịch sử cũ và chuyển cả lượt vừa tạo trong phiên SSO sang cùng chủ sở hữu.
        db.query(Prediction).filter_by(User_ID=current.User_ID).update(
            {Prediction.User_ID: old.User_ID}, synchronize_session=False)
        identity.User_ID = old.User_ID
        db.flush()
        db.delete(current)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Tài khoản vừa được liên kết ở phiên khác. Hãy tải lại trang.")
    with _link_lock:
        _link_failures.pop(claims["sub"], None)
    return {"message": "Đã liên kết và giữ toàn bộ lịch sử dự đoán."}


# Mật khẩu mới, đăng ký và đăng nhập do Identity Hub quản lý.
@router.post("/login")
@router.post("/register")
@router.post("/account/change-password")
def old_auth_endpoint():
    raise HTTPException(410, "Hãy dùng đăng nhập hoặc quản lý tài khoản qua Identity Hub.")


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
