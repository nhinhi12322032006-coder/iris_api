"""Kiểm tra API dự đoán trên Render bằng một tài khoản thử nghiệm."""

import os

import requests


BASE_URL = os.getenv("IRIS_TEST_BASE_URL", "https://iris-api-5jf3.onrender.com").rstrip("/")
USERNAME = os.getenv("IRIS_TEST_USERNAME")
PASSWORD = os.getenv("IRIS_TEST_PASSWORD")


def main():
    if not USERNAME or not PASSWORD:
        raise SystemExit(
            "Hãy đặt IRIS_TEST_USERNAME và IRIS_TEST_PASSWORD của tài khoản thử "
            "trước khi chạy test_api.py."
        )

    data = {
        "sepal_length": 5.1,
        "sepal_width": 3.5,
        "petal_length": 1.4,
        "petal_width": 0.2,
    }

    with requests.Session() as session:
        # /login nhận dữ liệu biểu mẫu, không phải JSON.
        login_response = session.post(
            f"{BASE_URL}/login",
            data={"username": USERNAME, "password": PASSWORD},
            timeout=30,
        )
        login_response.raise_for_status()
        token = login_response.json()["access_token"]

        # /predict yêu cầu Bearer token và sẽ lưu một lượt vào lịch sử tài khoản.
        response = session.post(
            f"{BASE_URL}/predict",
            json=data,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()

    assert result["prediction"] in {"setosa", "versicolor", "virginica"}
    assert 0 <= result["confidence"] <= 100
    assert set(result["probabilities"]) == {"setosa", "versicolor", "virginica"}
    assert abs(sum(result["probabilities"].values()) - 100) < 0.05
    assert result["confidence"] == result["probabilities"][result["prediction"]]
    print("Kiểm tra API thành công:", result)


if __name__ == "__main__":
    main()
