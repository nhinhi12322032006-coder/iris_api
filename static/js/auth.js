// Đăng nhập chung qua Keycloak: Authorization Code + PKCE S256.
(() => {
    const loginPage = Boolean(document.getElementById('auth-form'));
    const root = location.origin + '/';
    ['irisai_token', 'irisai_username', 'irisai_role'].forEach(k => localStorage.removeItem(k));

    function showError(error) {
        document.documentElement.classList.remove('studio-pending');
        let box = document.getElementById('auth-message');
        if (!box) {
            const panel = document.createElement('div');
            panel.className = 'sso-error';
            box = document.createElement('p');
            box.setAttribute('role', 'alert');
            const retry = document.createElement('button');
            retry.textContent = 'Thử lại';
            retry.onclick = () => location.reload();
            const login = document.createElement('a');
            login.href = '/static/login.html';
            login.textContent = 'Về trang đăng nhập';
            panel.append(box, retry, login);
            document.body.replaceChildren(panel);
        }
        box.textContent = error.message || 'Không thể kết nối Identity Hub. Hãy thử lại.';
    }

    async function getJson(path, options = {}) {
        const response = await fetch(irisApiUrl(path), {...options, signal: AbortSignal.timeout(60000)});
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Không thể xác minh tài khoản.');
        return data;
    }

    window.irisAuthReady = (async () => {
        const [{default: Keycloak}, config] = await Promise.all([
            import('/static/js/vendor/keycloak.js'), getJson('/auth/config')
        ]);
        const kc = new Keycloak(config);
        window.irisKeycloak = kc;
        const options = {pkceMethod: 'S256', flow: 'standard', responseMode: 'query',
            checkLoginIframe: false, redirectUri: root, scope: 'openid profile email'};
        if (!loginPage) options.onLoad = 'login-required';
        const authenticated = await kc.init(options);

        if (loginPage) {
            const form = document.getElementById('auth-form');
            const submit = document.getElementById('auth-submit');
            submit.disabled = false;
            form.addEventListener('submit', event => {
                event.preventDefault();
                kc.login({redirectUri: root}).catch(showError);
            });
            document.getElementById('auth-switch').addEventListener('click', () => {
                kc.register({redirectUri: root}).catch(showError);
            });
            return;
        }
        if (!authenticated) throw new Error('Bạn cần đăng nhập để tiếp tục.');
        const me = await getJson('/auth/me', {headers: {Authorization: `Bearer ${kc.token}`}});
        document.getElementById('account-name').textContent = me.username;
        document.body.classList.add('is-authenticated');
        document.documentElement.classList.remove('studio-pending');
        return me;
    })();
    // Không chuyển lỗi kết nối thành vòng lặp đăng nhập.
    window.irisAuthReady.catch(showError);
    if (loginPage) return;

    const toggle = document.getElementById('account-menu-toggle');
    const menu = document.getElementById('account-menu');
    function closeMenu() { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    toggle.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.account-actions')) closeMenu();
    });
    document.getElementById('change-password-btn').addEventListener('click', async () => {
        try { await window.irisAuthReady; await window.irisKeycloak.accountManagement(); }
        catch (error) { showError(error); }
    });
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await window.irisAuthReady;
            localStorage.setItem('irisai_logout_at', String(Date.now()));
            await window.irisKeycloak.logout({redirectUri: root});
        } catch (error) { showError(error); }
    });
    window.addEventListener('storage', event => {
        if (event.key === 'irisai_logout_at') {
            window.irisKeycloak?.clearToken();
            location.replace('/static/login.html');
        }
    });
    window.addEventListener('irisai-logout', () => {
        window.irisKeycloak?.clearToken();
        location.replace('/static/login.html');
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMenu();
    });
})();
