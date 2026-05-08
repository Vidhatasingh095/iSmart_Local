const API_URL = 'https://ismart-bus.onrender.com/api/auth';

document.addEventListener('DOMContentLoaded', () => {
    // Containers
    const containers = {
        login: document.getElementById('login-container'),
        signup: document.getElementById('signup-container'),
        admin: document.getElementById('admin-login-container'),
        forgot: document.getElementById('forgot-password-container'),
        help: document.getElementById('help-container')
    };

    // Transition Functions
    const showContainer = (key) => {
        const currentContainer = Object.values(containers).find(c => {
            if (!c) return false;
            const style = window.getComputedStyle(c);
            return style.display !== 'none';
        });
        const nextContainer = containers[key];

        if (currentContainer === nextContainer) return;

        // Prevent multiple simultaneous transitions
        if (showContainer.isTransitioning) return;
        showContainer.isTransitioning = true;

        if (currentContainer) {
            currentContainer.classList.add('fade-out');
            setTimeout(() => {
                currentContainer.style.display = 'none';
                currentContainer.classList.remove('fade-out');
                
                if (nextContainer) {
                    // Reset scroll position when switching pages
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    
                    nextContainer.style.display = 'block';
                    nextContainer.classList.add('fade-in');
                    
                    // Re-render Google buttons to ensure correct width in new container
                    if (typeof window.renderGoogleButtons === 'function') {
                        setTimeout(window.renderGoogleButtons, 50);
                    }

                    setTimeout(() => {
                        nextContainer.classList.remove('fade-in');
                        showContainer.isTransitioning = false;
                    }, 300);
                } else {
                    showContainer.isTransitioning = false;
                }
            }, 300);
        } else if (nextContainer) {
            nextContainer.style.display = 'block';
            showContainer.isTransitioning = false;
        }

        // Set role based on container
        if (key === 'admin') localStorage.setItem('selectedRole', 'admin');
        else if (key === 'signup' || key === 'login') localStorage.setItem('selectedRole', 'user');
    };
    showContainer.isTransitioning = false;

    // Navigation Events
    const navActions = {
        'show-signup-from-login': () => showContainer('signup'),
        'show-login-from-signup': () => showContainer('login'),
        'show-admin-login': () => showContainer('admin'),
        'show-user-login': () => showContainer('login'),
        'forgot-password-link': () => showContainer('forgot'),
        'show-login-from-forgot': () => showContainer('login'),
        'show-login-from-help': () => showContainer('login')
    };

    Object.entries(navActions).forEach(([id, action]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => {
            e.preventDefault();
            action();
        });
    });

    // Password Toggle
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.password-toggle');
        if (!toggle) return;
        const targetId = toggle.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.classList.toggle('fa-eye', !isPassword);
        toggle.classList.toggle('fa-eye-slash', isPassword);
    });

    // Form Submissions
    const handleLogin = async (e, formId, errorId, emailId, passwordId) => {
        e.preventDefault();
        const email = document.getElementById(emailId).value.trim().toLowerCase();
        const password = document.getElementById(passwordId).value;
        const errorEl = document.getElementById(errorId);
        if (errorEl) errorEl.style.display = 'none';

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user || {}));
                
                // Determine role
                let role = data.role || (data.user && data.user.role) || 'user';
                role = role.toLowerCase();
                if (role.includes('admin')) role = 'admin';
                
                localStorage.setItem('isAdminAllowed', role === 'admin' ? 'true' : 'false');
                localStorage.setItem('userRole', role === 'user' ? 'Student' : role.charAt(0).toUpperCase() + role.slice(1));
                window.location.href = `/dashboard.html?role=${encodeURIComponent(role)}`;
            } else {
                if (errorEl) {
                    errorEl.textContent = data.msg || 'Incorrect email or password';
                    errorEl.style.display = 'block';
                }
            }
        } catch (err) {
            console.error('Login Error:', err);
            if (errorEl) {
                errorEl.textContent = 'Server error. Please try again.';
                errorEl.style.display = 'block';
            }
        }
    };

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', (e) => handleLogin(e, 'login-form', 'login-error', 'login-email', 'login-password'));

    const adminForm = document.getElementById('admin-login-form');
    if (adminForm) adminForm.addEventListener('submit', (e) => handleLogin(e, 'admin-login-form', 'admin-login-error', 'admin-email', 'admin-password'));

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-email').value.trim().toLowerCase();
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-password-confirm').value;

            if (password.length < 8) { alert('Password must be at least 8 characters.'); return; }
            if (password !== confirmPassword) { alert('Passwords do not match.'); return; }

            try {
                const res = await fetch(`${API_URL}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, role: 'user', mobile: '0000000000' })
                });
                const data = await res.json();

                if (res.ok) {
                    alert('Signup successful! Please log in.');
                    showContainer('login');
                } else {
                    alert(data.msg || 'Signup failed');
                }
            } catch (err) {
                console.error('Signup Error:', err);
                alert('Server error during signup');
            }
        });
    }

    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value.trim();
            try {
                const res = await fetch(`${API_URL}/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                alert(data.msg || 'If an account exists, a reset link has been sent.');
            } catch (err) {
                console.error(err);
                alert('Server error');
            }
        });
    }
});

// Google Sign-In
window.onload = function () {
    window.renderGoogleButtons = () => {
        const googleBtns = document.querySelectorAll(".google-signin-btn");
        googleBtns.forEach(btn => {
            const width = btn.parentElement ? btn.parentElement.offsetWidth : 400;
            if (width > 0) {
                google.accounts.id.renderButton(btn, {
                    theme: "outline",
                    size: "large",
                    text: "continue_with",
                    shape: "pill",
                    width: width,
                    logo_alignment: "center"
                });
            }
        });
    };

    try {
        google.accounts.id.initialize({
            client_id: "486216064813-qr8cflm6racj1pku2lqldfpogedp4h5d.apps.googleusercontent.com",
            callback: handleCredentialResponse
        });
        window.renderGoogleButtons();
        window.addEventListener('resize', window.renderGoogleButtons);
    } catch (e) {
        console.warn('Google Sign-In initialization failed', e);
    }
};

async function handleCredentialResponse(response) {
    try {
        const res = await fetch(`${API_URL}/google-signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential }),
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            const role = (data.user && data.user.role) || 'user';
            localStorage.setItem('isAdminAllowed', role === 'admin' ? 'true' : 'false');
            localStorage.setItem('userRole', role === 'user' ? 'Student' : role.charAt(0).toUpperCase() + role.slice(1));
            window.location.href = `/dashboard.html?role=${encodeURIComponent(role)}`;
        } else {
            alert(data.msg || 'Google Sign-In failed');
        }
    } catch (error) {
        console.error('Google Sign-In Error:', error);
    }
}
