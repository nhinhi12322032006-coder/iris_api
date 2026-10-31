"""Xuất giao diện tĩnh cho Render; không import API, mô hình hoặc database."""

import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "dist"
PUBLIC_EXTENSIONS = {
    ".html",
    ".css",
    ".js",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".svg",
    ".ico",
    ".gif",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".csv",
    ".xlsx",
}


def api_origin(value: str) -> str:
    """Chỉ nhận địa chỉ API công khai; không nhận mật khẩu hay đường dẫn SQL."""
    parts = urlsplit(value.strip())
    local = parts.hostname in {"localhost", "127.0.0.1"}
    if (
        not parts.hostname
        or any(c.isspace() for c in parts.netloc)
        or parts.username
        or parts.password
        or parts.query
        or parts.fragment
        or parts.path not in {"", "/"}
        or not (parts.scheme == "https" or (parts.scheme == "http" and local))
    ):
        raise ValueError(
            "IRIS_API_BASE_URL phải là URL HTTPS của API; HTTP chỉ dùng với localhost."
        )
    _ = parts.port  # Từ chối port không hợp lệ trước khi tạo file xuất.
    return f"{parts.scheme}://{parts.netloc}"


def build() -> None:
    configured = os.getenv("IRIS_API_BASE_URL", "")
    if not configured:
        raise ValueError(
            "Hãy đặt IRIS_API_BASE_URL bằng URL Web Service API trên Render."
        )
    origin = api_origin(configured)
    required = [
        BASE_DIR / "index.html",
        BASE_DIR / "static/login.html",
        BASE_DIR / "static/js/api.js",
    ]
    if not all(path.is_file() for path in required):
        raise FileNotFoundError(
            "Thiếu index.html, static/login.html hoặc static/js/api.js."
        )
    if OUTPUT_DIR.is_symlink():
        raise ValueError("Thư mục dist không được là symlink.")
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir()
    shutil.copy2(BASE_DIR / "index.html", OUTPUT_DIR / "index.html")
    for source in (BASE_DIR / "static").rglob("*"):
        relative = source.relative_to(BASE_DIR)
        if source.is_symlink() or not source.is_file():
            continue
        if any(
            part.startswith(".") or part == "__pycache__" for part in relative.parts
        ):
            continue
        if source.suffix.lower() not in PUBLIC_EXTENSIONS:
            continue
        target = OUTPUT_DIR / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for name in ["setosa.jpg", "versicolor.jpg", "virginica.jpg"]:
        shutil.copy2(BASE_DIR / name, OUTPUT_DIR / name)
    api_script = OUTPUT_DIR / "static/js/api.js"
    api_script.write_text(
        f"window.IRIS_API_BASE_URL = {json.dumps(origin)};\n"
        + api_script.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    print(
        "Đã xuất giao diện vào dist/. Mô hình, code Python và thông tin SQL không nằm trong bản xuất."
    )


if __name__ == "__main__":
    build()
