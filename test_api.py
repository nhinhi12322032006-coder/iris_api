"""Kiểm tra API SSO theo lựa chọn; một lượt dự đoán sẽ được lưu vào lịch sử.
Đặt IRIS_TEST_ACCESS_TOKEN bằng access token của phiên người dùng trên máy cá nhân.
Không đặt client secret hay token quản trị vào biến này. Không gửi token cho người khác.
"""
import json
import os
from urllib.request import Request, urlopen


def main():
    base = os.getenv('IRIS_API_BASE_URL', 'https://iris-api-5jf3.onrender.com').rstrip('/')
    token = os.getenv('IRIS_TEST_ACCESS_TOKEN')
    if not token:
        raise SystemExit('Cần IRIS_TEST_ACCESS_TOKEN để chạy thử API SSO.')
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    with urlopen(Request(base + '/auth/me', headers=headers), timeout=60) as response:
        user = json.load(response)
    print('Đã xác thực:', user['username'])
    data = json.dumps({'sepal_length': 5.1, 'sepal_width': 3.5,
                       'petal_length': 1.4, 'petal_width': 0.2, 'model_name': 'svm_rbf'}).encode()
    with urlopen(Request(base + '/predict', data=data, headers=headers), timeout=60) as response:
        prediction = json.load(response)
    print('Dự đoán:', prediction['prediction'])


if __name__ == '__main__':
    main()
