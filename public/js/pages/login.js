import { $ } from '../core/dom.js';
import { ensureFirebaseAuth, loadFirebaseConfig } from '../core/firebase-client.js';
import { initI18n, t } from '../core/i18n.js';
import '../core/theme.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const elements = {
  authCard: $('.auth-card'),
  googleAlert: $('#google-alert'),
  loginAlert: $('#login-alert'),
  registerAlert: $('#register-alert'),
  loginBtn: $('#login-btn'),
  registerBtn: $('#register-btn')
};

const switchTab = (tab) => {
  document.querySelectorAll('.auth-tab').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((item) => item.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById(`panel-${tab}`)?.classList.add('active');
};

const showAlert = (id, message, type = 'error') => {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }

  el.textContent = message;
  el.className = `alert ${type}`;
};

const clearAlert = (id) => {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }

  el.className = 'alert';
  el.textContent = '';
};

const setLoading = (button, loading) => {
  if (!button) {
    return;
  }

  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<span class="spin-loader"></span>';
    return;
  }

  button.disabled = false;
  button.textContent = button.dataset.originalText || button.textContent;
};

const showGoogleAlert = (message) => {
  const el = elements.googleAlert;
  if (!el) {
    return;
  }

  el.textContent = message;
  el.style.display = 'block';
  window.setTimeout(() => {
    el.style.display = 'none';
  }, 6000);
};

const renderFirebaseMissing = async () => {
  const lang = document.documentElement.lang || 'en';
  const title = lang === 'vi' ? 'Chưa cấu hình Firebase' : 'Firebase is not configured';
  const desc =
    lang === 'vi'
      ? 'Vui lòng cấu hình FIREBASE_API_KEY và các biến môi trường liên quan.'
      : 'Configure FIREBASE_API_KEY and related environment variables first.';
  const back = lang === 'vi' ? '← Về trang ẩn danh' : '← Back to anonymous inbox';

  if (elements.authCard) {
    elements.authCard.innerHTML = `
      <div class="firebase-missing">
        <div class="firebase-missing-icon">⚠️</div>
        <h2>${title}</h2>
        <p style="color:var(--text-muted);font-size:14px">${desc}</p>
        <a href="/" style="color:var(--accent);text-decoration:none;margin-top:16px;display:inline-block">${back}</a>
      </div>
    `;
  }
};

const authErrorMessage = (code, type = 'login') => {
  const messages = {
    login: {
      'auth/user-not-found': t('login.error.user_not_found'),
      'auth/wrong-password': t('login.error.wrong_password'),
      'auth/invalid-credential': t('login.error.invalid_credential'),
      'auth/too-many-requests': t('login.error.too_many_requests')
    },
    register: {
      'auth/email-already-in-use': t('register.error.email_in_use'),
      'auth/weak-password': t('register.error.weak_password'),
      'auth/invalid-email': t('register.error.invalid_email')
    }
  };

  return messages[type]?.[code] || t('common.error.generic');
};

const handleLogin = async (event, auth) => {
  event.preventDefault();
  clearAlert('login-alert');
  setLoading(elements.loginBtn, true);

  const email = document.getElementById('login-email')?.value || '';
  const password = document.getElementById('login-password')?.value || '';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = '/app';
  } catch (error) {
    showAlert('login-alert', authErrorMessage(error.code, 'login'));
    setLoading(elements.loginBtn, false);
  }
};

const handleRegister = async (event, auth) => {
  event.preventDefault();
  clearAlert('register-alert');
  setLoading(elements.registerBtn, true);

  const name = document.getElementById('reg-name')?.value.trim() || '';
  const email = document.getElementById('reg-email')?.value || '';
  const password = document.getElementById('reg-password')?.value || '';

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(credential.user, { displayName: name });
    }
    window.location.href = '/app';
  } catch (error) {
    showAlert('register-alert', authErrorMessage(error.code, 'register'));
    setLoading(elements.registerBtn, false);
  }
};

const handleGoogleLogin = async (auth) => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
      showGoogleAlert(`${t('login.google_failed')}: ${error.message || error.code}`);
    }
  }
};

const initPage = async () => {
  await initI18n(document);

  const payload = await loadFirebaseConfig().catch(() => ({ enabled: false, config: null }));
  if (!payload.enabled || !payload.config) {
    await renderFirebaseMissing();
    return;
  }

  const auth = await ensureFirebaseAuth({ persist: true });
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = '/app';
    }
  });

  document.getElementById('login-form')?.addEventListener('submit', (event) => handleLogin(event, auth));
  document.getElementById('register-form')?.addEventListener('submit', (event) => handleRegister(event, auth));
  document.querySelectorAll('[data-google-login]').forEach((button) => {
    button.addEventListener('click', () => handleGoogleLogin(auth));
  });
  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.authTab));
  });
};

window.TempMailLogin = { switchTab };

void initPage();
