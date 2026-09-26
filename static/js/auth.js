// Dùng chung cho trang đăng nhập riêng và trang Iris Studio.
const TOKEN_KEY = 'irisai_token';
const LOGIN_PAGE = '/static/login.html';

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('irisai_username');
    localStorage.removeItem('irisai_role');
}

function errorText(data, fallback) {
    if (typeof data?.detail === 'string') {
        return data.detail;
    }

    if (Array.isArray(data?.detail)) {
        return data.detail.map(item => item.msg).join('; ');
    }

    return fallback;
}

const authForm = document.getElementById('auth-form');

if (authForm) {
    // Phần này chỉ chạy trên login.html.
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const submit = document.getElementById('auth-submit');
    const switchButton = document.getElementById('auth-switch');
    const message = document.getElementById('auth-message');
    const registerFields = document.getElementById('register-fields');
    const username = document.getElementById('auth-username');
    const email = document.getElementById('auth-email');
    const password = document.getElementById('auth-password');

    let mode = 'login';

    function setMode(nextMode) {
        mode = nextMode;
        const registering = mode === 'register';

        title.textContent = registering
            ? 'Tạo tài khoản'
            : 'Đăng nhập';

        subtitle.textContent = registering
            ? 'Tạo tài khoản để lưu lịch sử dự đoán của bạn.'
            : 'Đăng nhập để bắt đầu sử dụng Iris Studio.';

        submit.textContent = registering
            ? 'Tạo tài khoản'
            : 'Đăng nhập';

        switchButton.textContent = registering
            ? 'Đã có tài khoản? Đăng nhập'
            : 'Chưa có tài khoản? Đăng ký';

        registerFields.hidden = !registering;
        email.required = registering;
        password.autocomplete = registering
            ? 'new-password'
            : 'current-password';

        password.value = '';
        message.textContent = '';
    }

    switchButton.addEventListener('click', () => {
        setMode(mode === 'login' ? 'register' : 'login');
        username.focus();
    });

    authForm.addEventListener('submit', async event => {
        event.preventDefault();
        submit.disabled = true;
        message.textContent = 'Đang xử lý…';

        try {
            if (mode === 'register') {
                const response = await fetchWithTimeout('/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: username.value.trim(),
                        email: email.value.trim(),
                        password: password.value
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        errorText(data, 'Đăng ký không thành công.')
                    );
                }

                setMode('login');
                message.textContent =
                    'Tạo tài khoản thành công. Hãy đăng nhập.';
                username.focus();

            } else {
                const formData = new URLSearchParams();
                formData.set('username', username.value.trim());
                formData.set('password', password.value);

                const response = await fetchWithTimeout('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/x-www-form-urlencoded'
                    },
                    body: formData
                });

                const data = await response.json();

                if (!response.ok || !data.access_token) {
                    throw new Error(
                        errorText(
                            data,
                            'Tên đăng nhập hoặc mật khẩu không đúng.'
                        )
                    );
                }

                localStorage.setItem(
                    TOKEN_KEY,
                    data.access_token
                );

                localStorage.setItem(
                    'irisai_username',
                    data.username || username.value.trim()
                );

                localStorage.setItem(
                    'irisai_role',
                    data.role || 'user'
                );

                window.location.replace('/');
            }

        } catch (error) {
            message.textContent = error.name === 'AbortError'
                ? 'Máy chủ phản hồi quá lâu. Hãy thử lại.'
                : error.message ||
                  'Không thể kết nối. Hãy thử lại.';
        } finally {
            submit.disabled = false;
        }
    });

    const notice = sessionStorage.getItem(
        'irisai_auth_notice'
    );

    if (notice) {
        message.textContent = notice;
        sessionStorage.removeItem('irisai_auth_notice');
    }

} else {
    // Phần này chỉ chạy trên trang Iris Studio.
    const logoutButton = document.getElementById('logout-btn');
    const accountToggle = document.getElementById('account-menu-toggle');
    const accountMenu = document.getElementById('account-menu');
    const accountName = document.getElementById('account-name');
    const token = localStorage.getItem(TOKEN_KEY);

    function goToLogin(notice) {
        clearSession();

        if (notice) {
            sessionStorage.setItem(
                'irisai_auth_notice',
                notice
            );
        }

        window.location.replace(LOGIN_PAGE);
    }

    function closeAccountMenu() {
        accountMenu.hidden = true;
        accountToggle.setAttribute('aria-expanded', 'false');
    }
    
    accountToggle.addEventListener('click', () => {
        const opening = accountMenu.hidden;
    
        accountMenu.hidden = !opening;
        accountToggle.setAttribute('aria-expanded', String(opening));
    
        if (opening) {
            document.getElementById('change-password-btn').focus();
        }
    });
    
    document.addEventListener('click', event => {
        if (!event.target.closest('.account-actions')) {
            closeAccountMenu();
        }
    });

    logoutButton.addEventListener('click', () => {
        window.dispatchEvent(new Event('irisai-logout'));
        goToLogin();
    });

    const passwordButton = document.getElementById('change-password-btn');
    const passwordDialog = document.getElementById('password-dialog');
    const passwordClose = document.getElementById('password-dialog-close');
    const passwordForm = document.getElementById('change-password-form');
    const passwordMessage = document.getElementById('password-message');
    const passwordSubmit = document.getElementById('change-password-submit');

    if (passwordButton && passwordDialog && passwordForm) {
        const closePasswordDialog = () => {
            passwordDialog.hidden = true;
            passwordForm.reset();
            passwordMessage.textContent = '';
            passwordMessage.classList.remove('is-success');
            accountToggle.focus();
        };

        passwordButton.addEventListener('click', () => {
            closeAccountMenu();
            passwordDialog.hidden = false;
            document.getElementById('current-password').focus();
        });

        passwordClose.addEventListener('click', closePasswordDialog);

        passwordDialog
            .querySelector('[data-close-password]')
            .addEventListener('click', closePasswordDialog);

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            
            if (!passwordDialog.hidden) {
                closePasswordDialog();
            } else if (!accountMenu.hidden) {
                closeAccountMenu();
                accountToggle.focus();
            }
        });

        
        passwordForm.addEventListener('submit', async event => {
            event.preventDefault();

            const currentPassword =
                document.getElementById('current-password').value;
            const newPassword =
                document.getElementById('new-password').value;
            const confirmPassword =
                document.getElementById('confirm-password').value;

            passwordMessage.classList.remove('is-success');

            if (newPassword !== confirmPassword) {
                passwordMessage.textContent =
                    'Hai lần nhập mật khẩu mới chưa khớp.';
                return;
            }

            passwordSubmit.disabled = true;
            passwordMessage.textContent = 'Đang cập nhật…';

            try {
                const response = await fetchWithTimeout(
                    '/account/change-password',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization:
                                `Bearer ${localStorage.getItem(TOKEN_KEY)}`
                        },
                        body: JSON.stringify({
                            current_password: currentPassword,
                            new_password: newPassword
                        })
                    }
                );

                const data = await response.json();

                if (response.status === 401) {
                    return goToLogin(
                        'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
                    );
                }

                if (!response.ok) {
                    throw new Error(
                        errorText(data, 'Không thể đổi mật khẩu.')
                    );
                }

                passwordForm.reset();
                passwordMessage.classList.add('is-success');
                passwordMessage.textContent =
                    'Đổi mật khẩu thành công.';
            } catch (error) {
                passwordMessage.textContent =
                    error.name === 'AbortError'
                        ? 'Máy chủ phản hồi quá lâu. Hãy thử lại.'
                        : error.message ||
                          'Không thể kết nối. Hãy thử lại.';
            } finally {
                passwordSubmit.disabled = false;
            }
        });
    }

    window.addEventListener('storage', event => {
        if (event.key === TOKEN_KEY && !event.newValue) {
            goToLogin();
        }
    });

    (async () => {
        if (!token) {
            goToLogin();
            return;
        }

        try {
            const response = await fetchWithTimeout('/history', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }, 8000);

            if (!response.ok) {
                goToLogin(
                    'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
                );
                return;
            }

            accountName.textContent =
                localStorage.getItem('irisai_username') ||
                'Tài khoản';

            document.body.classList.add('is-authenticated');
            document.documentElement.classList.remove(
                'studio-pending'
            );

        } catch (error) {
            goToLogin(
                'Không thể xác minh phiên đăng nhập. Hãy thử lại.'
            );
        }
    })();
}