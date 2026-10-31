// URL công khai của Web Service API. Chỉ cần sửa tại đây nếu API đổi địa chỉ.
(() => {
    const base = (
        window.IRIS_API_BASE_URL ||
        "https://iris-api-5jf3.onrender.com"
    ).replace(/\/+$/, "");

    window.irisApiUrl = function (path) {
        return new URL(path, base + "/").href;
    };

    window.irisApiFetch = function (path, options) {
        return fetch(window.irisApiUrl(path), options);
    };
})();