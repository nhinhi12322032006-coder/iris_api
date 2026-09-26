import os
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta


SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if os.getenv("DATABASE_URL"):
        raise RuntimeError("Hãy thiết lập SECRET_KEY trên Render.")
    SECRET_KEY = "iris_secret_key"  # Chỉ dùng khi chạy trên máy cá nhân.
ALGORITHM = "HS256"

# Mã hóa mật khẩu
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto"
)


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(
    plain_password,
    hashed_password
):
    return pwd_context.verify(
        plain_password,
        hashed_password
    )


def create_token(username: str):
    expire = datetime.utcnow() + timedelta(
        hours=24
    )

    data = {
        "sub": username,
        "exp": expire
    }

    return jwt.encode(
        data,
        SECRET_KEY,
        algorithm=ALGORITHM
    )