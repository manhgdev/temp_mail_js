import { applyTranslations, initI18n, t } from '../core/i18n.js';
import '../core/theme.js';

const form = document.getElementById('submit-domain-form');
const alertBox = document.getElementById('submit-domain-alert');
const resultBox = document.getElementById('submit-domain-result');
const publicIpNode = document.getElementById('submit-dns-a-text');
const noteField = form?.querySelector('textarea[name="note"]');
let publicIpValue = 'your-server-ip';

const showNotice = (content = '', state = 'error') => {
  if (!content) {
    alertBox.innerHTML = '';
    alertBox.classList.add('hidden');
    return;
  }

  alertBox.dataset.state = state;
  alertBox.innerHTML = content;
  alertBox.classList.remove('hidden');
};

const showAlert = (message = '', type = 'error') => {
  if (!message) {
    showNotice('');
    return;
  }

  const isPendingReview = /already pending review/i.test(message);
  const state = isPendingReview ? 'warning' : type;
  const icon = isPendingReview ? 'fa-hourglass-half' : 'fa-circle-exclamation';

  showNotice(
    `
      <div class="submit-alert-copy">
        <i class="fa-solid ${icon}"></i>
        <div>
          <strong>${isPendingReview ? t('submit.alert.pending_title') : t('submit.alert.error_title')}</strong>
          <p>${message}</p>
        </div>
      </div>
    `,
    state
  );
};

const showResult = (content = '') => {
  resultBox.innerHTML = '';
  resultBox.classList.add('hidden');
  showNotice(content, 'success');
};

const renderSubmitCopy = () => {
  if (publicIpNode) {
    publicIpNode.textContent = t('submit.dns.a_text', { ip: publicIpValue });
  }

  if (noteField) {
    noteField.placeholder = t('submit.form.note_placeholder', { ip: publicIpValue });
  }
};

const postJson = async (path, payload) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
};

const loadSubmitDomainConfig = async () => {
  try {
    const data = await fetch('/submit-domain/config');
    const payload = await data.json();
    if (!data.ok) {
      throw new Error(payload.error || 'Failed to load submit-domain config');
    }

    const publicIp = String(payload.public_ip || '').trim();
    if (!publicIp) {
      renderSubmitCopy();
      return;
    }

    publicIpValue = publicIp;
    renderSubmitCopy();
  } catch {
    publicIpValue = 'your-server-ip';
    renderSubmitCopy();
  }
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert('');
  showResult('');

  const formData = new FormData(form);
  const domain = String(formData.get('domain') || '').trim();
  const expiresAt = String(formData.get('expires_at') || '').trim() || null;
  const note = String(formData.get('note') || '').trim();

  try {
    await postJson('/domains/submit', {
      domain,
      expires_at: expiresAt,
      note
    });
    form.reset();
    showResult(`
      <div class="submit-result-copy">
        <i class="fa-solid fa-circle-check"></i>
        <div>
          <strong>${domain}</strong>
          <p>${t('submit.alert.success_body')}</p>
        </div>
      </div>
    `);
    renderSubmitCopy();
  } catch (error) {
    showAlert(error.message);
  }
});

const initPage = async () => {
  await initI18n(document, { ip: publicIpValue });
  renderSubmitCopy();
  await loadSubmitDomainConfig();
};

window.addEventListener('tempmail:languagechange', () => {
  applyTranslations(document, undefined, { ip: publicIpValue });
  renderSubmitCopy();
});

void initPage();
