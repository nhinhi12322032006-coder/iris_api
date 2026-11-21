// Tất cả yêu cầu API đi qua đây; token Keycloak chỉ nằm trong bộ nhớ.
(() => {
    const base = (window.IRIS_API_BASE_URL || 'https://iris-api-5jf3.onrender.com').replace(/\/+$/, '');
    window.irisApiUrl = path => new URL(path, base + '/').href;
    window.irisApiFetch = async function (path, options = {}) {
        if (window.irisAuthReady) await window.irisAuthReady;
        const headers = new Headers(options.headers);
        // Không nhận Bearer cũ từ localStorage hoặc từ mã gọi phía ngoài.
        headers.delete('Authorization');
        const kc = window.irisKeycloak;
        if (kc?.authenticated) {
            try {
                await kc.updateToken(30);
            } catch (_) {
                kc.clearToken();
                window.dispatchEvent(new Event('irisai-logout'));
                throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
            }
            headers.set('Authorization', `Bearer ${kc.token}`);
        }
        const response = await fetch(window.irisApiUrl(path), {...options, headers});
        if (response.status === 401) window.dispatchEvent(new Event('irisai-logout'));
        return response;
    };
    window.irisAccessToken = async function () {
        await window.irisAuthReady;
        return window.irisKeycloak?.token || null;
    };
})();
