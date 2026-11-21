"""Xác minh access token Keycloak; mật khẩu Iris cũ chỉ dùng để liên kết lịch sử."""
import json
import os
import time
from threading import Lock
from urllib.parse import urlsplit
from urllib.request import urlopen

from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

KEYCLOAK_ISSUER = os.getenv(
    "KEYCLOAK_ISSUER", "https://identity-hub-idp.onrender.com/realms/identity-hub"
).rstrip("/")
KEYCLOAK_AUDIENCE = os.getenv("KEYCLOAK_AUDIENCE", "iris-api")
KEYCLOAK_WEB_CLIENT_ID = os.getenv("KEYCLOAK_WEB_CLIENT_ID", "iris-studio-web")
_parts = urlsplit(KEYCLOAK_ISSUER)
_base, _separator, _realm = KEYCLOAK_ISSUER.rpartition("/realms/")
if (not _separator or not _realm or "/" in _realm or not _parts.hostname
        or _parts.username or _parts.password or _parts.query or _parts.fragment
        or not (_parts.scheme == "https" or
                (_parts.scheme == "http" and _parts.hostname in {"localhost", "127.0.0.1"}))):
    raise RuntimeError("KEYCLOAK_ISSUER phải là URL HTTPS đầy đủ của realm Keycloak.")

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, TypeError):
        return False


def public_auth_config():
    return {"url": _base, "realm": _realm, "clientId": KEYCLOAK_WEB_CLIENT_ID}


_jwks_lock = Lock()
_jwks = []
_jwks_expiry = 0.0
_last_fetch = 0.0


def _fetch_jwks():
    # URL chỉ lấy từ cấu hình tin cậy; không dùng jku/x5u từ token.
    with urlopen(KEYCLOAK_ISSUER + "/protocol/openid-connect/certs", timeout=15) as response:
        data = json.loads(response.read(1024 * 1024))
    return [k for k in data["keys"] if k.get("kty") == "RSA"
            and k.get("use", "sig") == "sig" and k.get("alg", "RS256") == "RS256"]


def _signing_key(kid):
    global _jwks, _jwks_expiry, _last_fetch
    with _jwks_lock:
        now = time.monotonic()
        key = next((k for k in _jwks if k.get("kid") == kid), None)
        if now >= _jwks_expiry or (key is None and now - _last_fetch >= 10):
            _last_fetch = now
            try:
                _jwks = _fetch_jwks()
            except Exception as exc:
                raise HTTPException(503, "Chưa thể kết nối Identity Hub. Hãy thử lại.") from exc
            _jwks_expiry = now + 300
            key = next((k for k in _jwks if k.get("kid") == kid), None)
        return key


def invalid_token():
    return HTTPException(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
                         headers={"WWW-Authenticate": "Bearer"})


def decode_access_token(token):
    try:
        if len(token) > 32768:
            raise invalid_token()
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise invalid_token()
        key = _signing_key(header["kid"])
        if key is None:
            raise invalid_token()
        claims = jwt.decode(
            token, key, algorithms=["RS256"], audience=KEYCLOAK_AUDIENCE,
            issuer=KEYCLOAK_ISSUER,
            options={"require_exp": True, "require_sub": True,
                     "require_iss": True, "require_aud": True},
        )
        if (claims.get("typ") != "Bearer" or not claims.get("sub")
                or len(claims["sub"]) > 255
                or claims.get("azp") != KEYCLOAK_WEB_CLIENT_ID):
            raise invalid_token()
        return claims
    except (JWTError, ValueError, TypeError, KeyError) as exc:
        raise invalid_token() from exc
