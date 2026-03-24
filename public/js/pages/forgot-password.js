import { $ } from '../core/dom.js';
import { ensureFirebaseAuth, loadFirebaseConfig } from '../core/firebase-client.js';
import { initI18n, t } from '../core/i18n.js';
import '../core/theme.js';
import {
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const elements = {
  alert: $('#forgot-alert'),
  authCard: $('.auth-card'),
  submitBtn: $('#forgot-btn'),
  emailInput: $('#forgot-email')
};

const showAlert = (message, type = 'error') => {
  if (!elements.alert) {
    return;
  }

  elements.alert.textContent = message;
  elements.alert.className = `alert ${type}`;
};

const clearAlert = () => {
  if (!elements.alert) {
    return;
  }

  elements.alert.className = 'alert';
  elements.alert.textContent = '';
};

const setLoading = (loading) => {
  if (!elements.submitBtn) {
    return;
  }

  if (loading) {
    elements.submitBtn.disabled = true;
    elements.submitBtn.dataset.originalText = elements.submitBtn.textContent;
    elements.submitBtn.innerHTML = '<span class="spin-loader"></span>';
    return;
  }

  elements.submitBtn.disabled = false;
  elements.submitBtn.textContent = elements.submitBtn.dataset.originalText || elements.submitBtn.textContent;
};

const renderFirebaseMissing = () => {
  const lang = document.documentElement.lang || 'en';
  const title = lang === 'vi' ? 'Chưa cấu hình Firebase' : 'Firebase is not configured';
  const desc =
    lang === 'vi'
      ? 'Vui lòng cấu hình FIREBASE_API_KEY và các biến môi trường liên quan.'
      : 'Configure FIREBASE_API_KEY and related environment variables first.';
  const back = lang === 'vi' ? 'Quay lại đăng nhập' : 'Back to login';

  if (elements.authCard) {
    elements.authCard.innerHTML = `
      <div class="firebase-missing">
        <div class="firebase-missing-icon">⚠️</div>
        <h2>${title}</h2>
        <p style="color:var(--text-muted);font-size:14px">${desc}</p>
        <a href="/login" style="color:var(--accent);text-decoration:none;margin-top:16px;display:inline-block">${back}</a>
      </div>
    `;
  }
};

const forgotPasswordErrorMessage = (code) => {
  if (code === 'auth/invalid-email') {
    return t('login.forgot.error.invalid_email');
  }

  if (code === 'auth/too-many-requests') {
    return t('login.forgot.error.too_many_requests');
  }

  return t('common.error.generic');
};

const handleSubmit = async (event, auth) => {
  event.preventDefault();
  clearAlert();
  setLoading(true);

  try {
    await sendPasswordResetEmail(auth, elements.emailInput?.value?.trim() || '');
    showAlert(t('login.forgot.success'), 'success');
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      showAlert(t('login.forgot.success'), 'success');
    } else {
      showAlert(forgotPasswordErrorMessage(error.code), 'error');
    }
  } finally {
    setLoading(false);
  }
};

const initPage = async () => {
  await initI18n(document);

  const payload = await loadFirebaseConfig().catch(() => ({ enabled: false, config: null }));
  if (!payload.enabled || !payload.config) {
    renderFirebaseMissing();
    return;
  }

  const auth = await ensureFirebaseAuth({ persist: true });
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = '/app';
    }
  });

  document.getElementById('forgot-password-form')?.addEventListener('submit', (event) => handleSubmit(event, auth));
};

void initPage();
