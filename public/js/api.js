import CONFIG from './config.js';
import { getLanguage, initI18n, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const elements = {
  emailInput: $('addr'),
  emailList: $('emails-list'),
  loadingSpinner: $('loading-spinner'),
  errorMessage: $('error-message'),
  autoRefreshCheckbox: $('auto-refresh'),
  refreshIntervalSelect: $('refresh-interval'),
  emailSearch: $('email-search'),
  statusLed: $('status-led'),
  statusText: $('status-text'),
  countBadge: $('email-count-badge'),
  deleteAllBtn: $('delete-all-btn'),
  countdown: $('countdown'),
  sessionTimer: $('session-timer'),
  sessionTimerText: $('session-timer-text'),
  countdownBarContainer: $('countdown-bar-container'),
  countdownBar: $('countdown-bar'),
  domainSelect: $('domain-select'),
  copyBtn: $('copy-btn'),
  copyIcon: $('copy-icon'),
  toastContainer: $('toast-container')
};

const toastIcons = {
  success: 'fa-check',
  error: 'fa-xmark',
  info: 'fa-info',
  warning: 'fa-exclamation'
};
const RANDOM_DOMAIN_VALUE = '__random__';

const getStored = (key) => localStorage.getItem(key);
const setStored = (key, value) => localStorage.setItem(key, value);
const removeStored = (key) => localStorage.removeItem(key);
const bootState = window.__TEMPMAIL_BOOT__ || {};
const initVisitorBadge = () => {
  const badge = document.getElementById('visitor-badge');
  if (!badge) {
    return;
  }

  const params = new URLSearchParams({
    path: CONFIG.SITE_ORIGIN,
    label: 'VISITORS',
    labelColor: '%23d9e3f0',
    countColor: '%23263759',
    style: 'plastic',
  });

  badge.addEventListener(
    'error',
    () => {
      badge.closest('.visitor-badge-wrap')?.remove();
    },
    { once: true }
  );
  badge.src = `https://api.visitorbadge.io/api/visitors?${params.toString()}`;
};

const setSessionTimerVisibility = (visible) => {
  elements.sessionTimer?.classList.toggle('is-hidden', !visible);
};

let currentEmail = getStored(CONFIG.EMAIL_KEY) || '';
let mails = [];
let filteredMails = [];
let selectedMail = null;
let autoRefreshTimer = null;
let countdownTimer = null;
let availableDomains = [];
let allowDevMail = false;
let currentStatus = 'OFFLINE';
let initialInboxPromise = bootState.initialInboxPromise || null;
let nextInboxCursor = null;
let isLoadingMore = false;
let totalInboxCount = 0;

function resetActiveInboxState() {
  mails = [];
  filteredMails = [];
  selectedMail = null;
  nextInboxCursor = null;
  isLoadingMore = false;
  totalInboxCount = 0;
  currentEmail = '';
  initialInboxPromise = null;
  closeModal();
  removeStored(CONFIG.EMAIL_KEY);
  removeStored(CONFIG.SESSION_START_KEY);
  if (elements.emailInput) {
    elements.emailInput.value = '';
  }
  stopSessionTimer();
  setSessionTimerVisibility(false);
  renderInbox();
}

function showError(message = '') {
  if (!elements.errorMessage) {
    return;
  }

  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.toggle('hidden', !message);
}

function toast(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
  if (!elements.toastContainer) {
    return;
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-icon"><i class="fa-solid ${toastIcons[type]}"></i></div>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close">&times;</button>
    <div class="toast-progress" style="animation-duration:${duration}ms"></div>
  `;

  const progress = el.querySelector('.toast-progress');
  let dismissTimer = null;
  let startedAt = Date.now();
  let remaining = duration;
  let closed = false;

  const removeToast = () => {
    if (closed) {
      return;
    }

    closed = true;
    clearTimeout(dismissTimer);
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 300);
  };

  const scheduleDismiss = () => {
    clearTimeout(dismissTimer);
    startedAt = Date.now();
    dismissTimer = setTimeout(removeToast, remaining);
  };

  el.querySelector('.toast-close')?.addEventListener('click', removeToast);
  elements.toastContainer.appendChild(el);

  scheduleDismiss();

  el.addEventListener('mouseenter', () => {
    clearTimeout(dismissTimer);
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
    if (progress) {
      progress.style.animationPlayState = 'paused';
    }
  });

  el.addEventListener('mouseleave', () => {
    if (closed) {
      return;
    }

    if (progress) {
      progress.style.animationPlayState = 'running';
    }

    scheduleDismiss();
  });
}

function updateSystemStatus(status) {
  currentStatus = status;
  elements.statusLed.classList.remove('online', 'offline', 'loading');
  elements.statusLed.classList.add(CONFIG.STATUS[status].class);
  const key =
    status === 'ONLINE' ? 'status.online' : status === 'LOADING' ? 'status.loading' : 'status.offline';
  elements.statusText.textContent = t(key);
}

const setOnline = () => updateSystemStatus('ONLINE');
const setOffline = () => updateSystemStatus('OFFLINE');
const setLoadingStatus = () => updateSystemStatus('LOADING');

function setLoading(isLoading) {
  if (!elements.loadingSpinner) {
    return;
  }

  elements.loadingSpinner.classList.toggle('hidden', !isLoading);
  elements.loadingSpinner.style.display = isLoading ? '' : 'none';
}

function updateEmailCount(count) {
  elements.countBadge.textContent = count;
  elements.deleteAllBtn.style.display = count > 0 ? '' : 'none';
  const baseTitle = t('page.home.title');
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
}

function formatSessionTime() {
  const start = Number(getStored(CONFIG.SESSION_START_KEY) || Date.now());
  const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function startSessionTimer() {
  if (!getStored(CONFIG.SESSION_START_KEY)) {
    setStored(CONFIG.SESSION_START_KEY, Date.now().toString());
  }

  setSessionTimerVisibility(true);
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    elements.sessionTimerText.textContent = formatSessionTime();
  }, 1000);
  elements.sessionTimerText.textContent = formatSessionTime();
}

function stopSessionTimer() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  setSessionTimerVisibility(false);
  elements.sessionTimerText.textContent = '00:00';
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
}

function getMailPreview(mail) {
  const source = mail.body_text || mail.preview || t('mail.no_preview');
  return stripHtml(source).replace(/\s+/g, ' ').trim() || t('mail.no_preview');
}

function truncateText(value, maxLength = 160) {
  const normalized = String(value || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function syncSelectedMailState() {
  if (!selectedMail) {
    return;
  }

  const nextSelectedMail = mails.find((mail) => mail.id === selectedMail.id) || null;
  selectedMail = nextSelectedMail;
}

function getSenderInitial(from = '') {
  const candidate = String(from || '').trim().charAt(0);
  return candidate ? candidate.toUpperCase() : '?';
}

function formatRelativeTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const secondsDiff = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(secondsDiff);
  const locale = getLanguage() === 'vi' ? 'vi' : 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absSeconds < 45) {
    return rtf.format(0, 'second');
  }

  const ranges = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400]
  ];

  for (const [unit, size] of ranges) {
    if (absSeconds < size * (unit === 'day' ? 7 : 24)) {
      return rtf.format(Math.round(secondsDiff / size), unit);
    }
  }

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric'
  });
}

function applyFilter() {
  const query = elements.emailSearch.value.trim().toLowerCase();
  filteredMails = mails.filter((mail) => {
    if (!query) {
      return true;
    }

    return [mail.from, mail.subject, getMailPreview(mail)].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(query)
    );
  });
}

function renderInboxList() {
  if (!elements.emailList) {
    return;
  }

  elements.emailList.innerHTML = '';
  const query = elements.emailSearch?.value.trim() || '';
  if (filteredMails.length === 0) {
    elements.emailList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-inbox"></i>
        <h2>${mails.length === 0 ? escapeHTML(t('mail.empty')) : escapeHTML(t('mail.search_empty'))}</h2>
        <p>${mails.length === 0 ? escapeHTML(t('mail.empty_hint')) : escapeHTML(t('mail.search_empty_hint'))}</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredMails.forEach((mail, index) => {
    const item = document.createElement('article');
    const preview = truncateText(getMailPreview(mail));
    const sender = mail.from || '-';
    const subject = mail.subject || t('mail.no_subject');
    const relativeTime = formatRelativeTime(mail.created_at);
    const fullDate = formatDate(mail.created_at);
    const isSelected = selectedMail?.id === mail.id;

    item.className = `mail-item${index === 0 ? ' row-new' : ''}${isSelected ? ' is-selected' : ''}`;
    item.dataset.openId = mail.id;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${sender} ${subject}`);
    item.innerHTML = `
      <div class="mail-item-accent" aria-hidden="true"></div>
      <div class="mail-item-avatar" aria-hidden="true">${escapeHTML(getSenderInitial(sender))}</div>
      <div class="mail-item-body">
        <div class="mail-item-topline">
          <p class="mail-item-sender notranslate" translate="no" title="${escapeHTML(sender)}">${escapeHTML(sender)}</p>
        </div>
        <h3 class="mail-item-subject notranslate" translate="no" title="${escapeHTML(subject)}">${escapeHTML(subject)}</h3>
        <p class="mail-item-preview notranslate" translate="no">${escapeHTML(preview)}</p>
      </div>
      <div class="mail-item-side">
        <div class="mail-item-time">
          <span class="mail-item-time-value" title="${escapeHTML(fullDate)}">${escapeHTML(relativeTime)}</span>
        </div>
        <p class="mail-item-selected-hint" aria-hidden="${isSelected ? 'false' : 'true'}">${escapeHTML(t('mail.selected_hint'))}</p>
        <button
          class="mail-item-delete"
          data-action="delete"
          data-id="${mail.id}"
          title="Remove from list"
          aria-label="Remove from list"
        >
          <span>${escapeHTML(t('mail.delete_hint'))}</span>
        </button>
      </div>
    `;
    fragment.appendChild(item);
  });

  elements.emailList.appendChild(fragment);

  if (!query && nextInboxCursor) {
    const loadMoreWrap = document.createElement('div');
    loadMoreWrap.className = 'mail-list-load-more';
    loadMoreWrap.innerHTML = `
      <button
        type="button"
        class="ghost-button load-more-button"
        data-action="load-more"
        ${isLoadingMore ? 'disabled' : ''}
      >
        ${escapeHTML(isLoadingMore ? t('button.loading_more') : t('button.load_more'))}
      </button>
    `;
    elements.emailList.appendChild(loadMoreWrap);
  }
}

function renderInbox() {
  syncSelectedMailState();
  applyFilter();
  updateEmailCount(totalInboxCount);
  renderInboxList();
}

const hasHtmlDocument = (value = '') => /<(?:!doctype|html|body)\b/i.test(String(value));

async function renderMailBody(container, mail) {
  const htmlViewerUrl = `/mail/${encodeURIComponent(mail.id)}/html`;
  const fallbackText = String(mail.body_text || mail.preview || t('mail.no_preview'));

  try {
    const response = await fetch(htmlViewerUrl);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const html = await response.text();
    if (hasHtmlDocument(html)) {
      container.innerHTML = `<iframe class="email-body-frame notranslate" translate="no" src="${htmlViewerUrl}" title="${escapeHTML(mail.subject || '(no subject)')}"></iframe>`;
      return;
    }

    container.innerHTML = `<div class="email-body-inline-html notranslate" translate="no">${html}</div>`;
    return;
  } catch {}

  container.innerHTML = `<pre class="email-body-text notranslate" translate="no">${escapeHTML(fallbackText)}</pre>`;
}

async function fileToAttachmentPayload(file) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    content: btoa(binary)
  };
}

function renderMailModal(mail) {
  const existing = document.querySelector('.email-modal');
  if (existing) {
    existing.remove();
  }

  const bodyText = String(mail.body_text || mail.preview || t('mail.no_preview'));
  const htmlViewerUrl = `/mail/${encodeURIComponent(mail.id)}/html`;
  const attachmentItems = (mail.attachments || [])
    .map(
      (file, index) => `
        <a class="attachment-link" href="/mail/${encodeURIComponent(mail.id)}/attachments/${index}" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-paperclip"></i>
          ${escapeHTML(file.filename)} (${file.size} bytes)
        </a>
      `
    )
    .join('');

  const modal = document.createElement('div');
  modal.className = 'email-modal';
  modal.innerHTML = `
    <div class="email-modal-content">
      <div class="modal-header">
        <h2>${escapeHTML(mail.subject || '(no subject)')}</h2>
        <div class="modal-header-actions">
          <a
            class="modal-header-link"
            href="${htmlViewerUrl}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="${escapeHTML(t('button.open_html'))}"
            title="${escapeHTML(t('button.open_html'))}"
          >
            <span class="modal-header-link-icon" aria-hidden="true">↗</span>
          </a>
          <button class="close-btn" aria-label="${escapeHTML(t('shortcut.close_button'))}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
      <div class="email-meta">
        <p><strong>${escapeHTML(t('mail.meta.from'))}</strong> <span class="notranslate" translate="no">${escapeHTML(mail.from || '-')}</span></p>
        <p><strong>${escapeHTML(t('mail.meta.to'))}</strong> <span class="notranslate" translate="no">${escapeHTML(mail.to || '-')}</span></p>
        <p><strong>${escapeHTML(t('mail.meta.date'))}</strong> ${escapeHTML(formatDate(mail.created_at))}</p>
      </div>
      <div class="email-body" data-mail-body>
        <div class="email-body-loading">${escapeHTML(t('status.loading'))}</div>
      </div>
      <div class="attachments">
        <h3>${escapeHTML(t('mail.attachments'))}</h3>
        ${attachmentItems ? `<div class="attachment-list">${attachmentItems}</div>` : `<p>${escapeHTML(t('mail.no_attachments'))}</p>`}
      </div>
    </div>
  `;

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });

  modal.querySelector('.close-btn')?.addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  renderMailBody(modal.querySelector('[data-mail-body]'), mail);
}

function closeModal() {
  document.querySelector('.email-modal')?.remove();
}

function renderSendTestMailModal() {
  if (!allowDevMail) {
    toast(t('toast.dev_only'), 'warning');
    return;
  }

  closeModal();
  const activeDomain =
    (currentEmail.includes('@') ? currentEmail.split('@')[1] : '') ||
    availableDomains[0] ||
    'tempmail.local';

  const modal = document.createElement('div');
  modal.className = 'email-modal';
  modal.innerHTML = `
    <div class="email-modal-content">
      <div class="modal-header">
        <h2>${escapeHTML(t('dev_modal.title'))}</h2>
        <button class="close-btn" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <form class="dev-mail-form" id="dev-mail-form">
        <label class="dev-mail-field">
          ${escapeHTML(t('dev_modal.from'))}
          <input name="from" type="email" value="dev-sender@${escapeHTML(activeDomain)}" required />
        </label>
        <label class="dev-mail-field">
          ${escapeHTML(t('dev_modal.to'))}
          <input name="to" type="email" value="${escapeHTML(currentEmail || '')}" required />
        </label>
        <label class="dev-mail-field dev-mail-field-span-2">
          ${escapeHTML(t('dev_modal.subject'))}
          <input name="subject" type="text" value="${escapeHTML(t('dev_modal.subject_default'))}" required />
        </label>
        <label class="dev-mail-field dev-mail-field-span-2">
          ${escapeHTML(t('dev_modal.message'))}
          <textarea name="body" required>${escapeHTML(t('dev_modal.body_default'))}</textarea>
        </label>
        <label class="dev-mail-field dev-mail-field-span-2">
          ${escapeHTML(t('dev_modal.attachments'))}
          <input name="attachments" type="file" multiple />
          <span class="dev-mail-help">${escapeHTML(t('dev_modal.attachments_help'))}</span>
        </label>
        <div class="modal-actions dev-mail-actions dev-mail-field dev-mail-field-span-2">
          <button class="ghost-button" type="button" id="dev-mail-cancel">${escapeHTML(t('dev_modal.cancel'))}</button>
          <button class="primary-button dev-button" type="submit">
            <i class="fa-solid fa-paper-plane"></i> ${escapeHTML(t('dev_modal.send'))}
          </button>
        </div>
      </form>
    </div>
  `;

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  modal.querySelector('.close-btn')?.addEventListener('click', closeModal);
  modal.querySelector('#dev-mail-cancel')?.addEventListener('click', closeModal);
  modal.querySelector('#dev-mail-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const files = Array.from(form.getAll('attachments')).filter((file) => file instanceof File && file.size > 0);

    try {
      setLoading(true);
      await postJson('/dev/send-test-mail', {
        from: form.get('from'),
        to: form.get('to'),
        subject: form.get('subject'),
        body: form.get('body'),
        attachments: await Promise.all(files.map(fileToAttachmentPayload))
      });
      closeModal();
      toast(t('toast.test_mail_sent'), 'success');
      await refreshMail();
    } catch (error) {
      toast(t('toast.test_mail_failed', { message: error.message }), 'error');
    } finally {
      setLoading(false);
    }
  });

  document.body.appendChild(modal);
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${CONFIG.API_BASE}${path}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${CONFIG.API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function deleteJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${CONFIG.API_BASE}${path}`, {
      method: 'DELETE',
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function genEmail() {
  try {
    setLoading(true);
    setLoadingStatus();
    if (!availableDomains.length) {
      throw new Error('No active domains configured');
    }

    const previousEmail = currentEmail;
    if (previousEmail) {
      await deleteJson(`/mail/${encodeURIComponent(previousEmail)}`);
      mails = [];
      selectedMail = null;
      currentEmail = '';
      closeModal();
      removeStored(CONFIG.EMAIL_KEY);
      removeStored(CONFIG.SESSION_START_KEY);
      elements.emailInput.value = '';
      stopSessionTimer();
      renderInbox();
    }

    const selectedDomain = elements.domainSelect?.value || getStored(CONFIG.DOMAIN_KEY) || '';
    const query =
      selectedDomain && selectedDomain !== RANDOM_DOMAIN_VALUE
        ? `?domain=${encodeURIComponent(selectedDomain)}`
        : '';
    const data = await fetchJson(`/generate${query}`);
    currentEmail = data.email;
    setStored(CONFIG.EMAIL_KEY, currentEmail);
    const currentDomain = currentEmail.split('@')[1] || selectedDomain;
    if (selectedDomain === RANDOM_DOMAIN_VALUE) {
      setStored(CONFIG.DOMAIN_KEY, RANDOM_DOMAIN_VALUE);
      elements.domainSelect.value = RANDOM_DOMAIN_VALUE;
    } else if (currentDomain && availableDomains.includes(currentDomain)) {
      setStored(CONFIG.DOMAIN_KEY, currentDomain);
      elements.domainSelect.value = currentDomain;
    }
    setStored(CONFIG.SESSION_START_KEY, Date.now().toString());
    elements.emailInput.value = currentEmail;
    showError('');
    startSessionTimer();
    setOnline();
    toast(t('toast.new_email'), 'success');
    await refreshMail();
  } catch (error) {
    setOffline();
    showError(t('error.generate_failed', { message: error.message }));
    toast(t('toast.generate_failed', { message: error.message }), 'error');
  } finally {
    setLoading(false);
  }
}

async function copyEmail() {
  if (!currentEmail) {
    toast(t('toast.no_email_copy'), 'warning');
    return;
  }

  await navigator.clipboard.writeText(currentEmail);
  if (elements.copyBtn && elements.copyIcon) {
    elements.copyBtn.classList.add('copied');
    elements.copyIcon.className = 'fa-solid fa-check';
    setTimeout(() => {
      elements.copyBtn.classList.remove('copied');
      elements.copyIcon.className = 'fa-solid fa-copy';
    }, 1200);
  }
  toast(t('toast.email_copied'), 'success');
}

async function refreshMail() {
  if (!currentEmail) {
    showError(t('error.no_active_inbox'));
    toast(t('toast.no_active_inbox'), 'warning');
    return;
  }

  try {
    setLoading(true);
    setLoadingStatus();
    const data =
      initialInboxPromise && currentEmail === bootState.email
        ? await initialInboxPromise.finally(() => {
            initialInboxPromise = null;
          })
        : await fetchJson(`/inbox/${encodeURIComponent(currentEmail)}`);
    mails = Array.isArray(data.mails) ? data.mails : [];
    nextInboxCursor = data.next_cursor || null;
    totalInboxCount = Number.isFinite(Number(data.total_count)) ? Number(data.total_count) : mails.length;
    isLoadingMore = false;
    showError('');
    setOnline();
    renderInbox();
  } catch (error) {
    if (/not found/i.test(error.message)) {
      resetActiveInboxState();
      showError(t('error.inbox_not_found'));
      toast(t('toast.inbox_not_found'), 'warning', CONFIG.TOAST_DURATION_LONG);
      return;
    }

    setOffline();
    showError(t('error.refresh_failed', { message: error.message }));
    toast(t('toast.refresh_failed', { message: error.message }), 'error');
  } finally {
    setLoading(false);
  }
}

async function loadMoreMails() {
  if (!currentEmail || !nextInboxCursor || isLoadingMore) {
    return;
  }

  try {
    isLoadingMore = true;
    renderInbox();
    const data = await fetchJson(
      `/inbox/${encodeURIComponent(currentEmail)}?before=${encodeURIComponent(nextInboxCursor)}`
    );
    const nextMails = Array.isArray(data.mails) ? data.mails : [];
    const existingIds = new Set(mails.map((mail) => mail.id));
    mails = [...mails, ...nextMails.filter((mail) => !existingIds.has(mail.id))];
    nextInboxCursor = data.next_cursor || null;
    totalInboxCount = Number.isFinite(Number(data.total_count)) ? Number(data.total_count) : totalInboxCount;
  } catch (error) {
    toast(t('toast.load_more_failed', { message: error.message }), 'error');
  } finally {
    isLoadingMore = false;
    renderInbox();
  }
}

async function openMail(id) {
  try {
    const mail = await fetchJson(`/mail/${encodeURIComponent(id)}`);
    selectedMail = mail;
    renderInbox();
    renderMailModal(mail);
  } catch (error) {
    toast(t('toast.open_failed', { message: error.message }), 'error');
  }
}

async function removeMailFromView(id) {
  try {
    await deleteJson(`/inbox/${encodeURIComponent(currentEmail)}/${encodeURIComponent(id)}`);
    mails = mails.filter((mail) => mail.id !== id);
    totalInboxCount = Math.max(0, totalInboxCount - 1);
    if (selectedMail?.id === id) {
      selectedMail = null;
      closeModal();
    }
    renderInbox();
    toast(t('toast.email_deleted'), 'success');
  } catch (error) {
    if (/inbox not found/i.test(error.message)) {
      resetActiveInboxState();
      showError(t('error.inbox_not_found'));
      toast(t('toast.inbox_not_found'), 'warning', CONFIG.TOAST_DURATION_LONG);
      return;
    }

    toast(t('toast.delete_email_failed', { message: error.message }), 'error');
  }
}

async function deleteAllEmails() {
  if (!currentEmail) {
    toast(t('toast.no_inbox_clear'), 'warning');
    return;
  }

  try {
    await deleteJson(`/inbox/${encodeURIComponent(currentEmail)}/mails`);
    mails = [];
    totalInboxCount = 0;
    selectedMail = null;
    closeModal();
    renderInbox();
    showError('');
    toast(t('toast.inbox_cleared'), 'success');
  } catch (error) {
    if (/inbox not found/i.test(error.message)) {
      resetActiveInboxState();
      showError(t('error.inbox_not_found'));
      toast(t('toast.inbox_not_found'), 'warning', CONFIG.TOAST_DURATION_LONG);
      return;
    }

    toast(t('toast.clear_failed', { message: error.message }), 'error');
  }
}

function setupAutoRefresh() {
  const renderCountdownValue = (seconds) => {
    elements.countdown.textContent = `${seconds}s`;
  };

  const apply = () => {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;

    const seconds = Number(elements.refreshIntervalSelect.value || 30);

    if (!elements.autoRefreshCheckbox.checked) {
      renderCountdownValue(seconds);
      elements.countdownBarContainer.classList.remove('active');
      return;
    }

    let remaining = seconds;
    renderCountdownValue(remaining);
    elements.countdownBarContainer.classList.add('active');
    elements.countdownBar.style.transition = 'none';
    elements.countdownBar.style.width = '100%';

    autoRefreshTimer = window.setInterval(() => {
      remaining -= 1;
      renderCountdownValue(Math.max(remaining, 0));
      elements.countdownBar.style.transition = 'width 1s linear';
      elements.countdownBar.style.width = `${(Math.max(remaining, 0) / seconds) * 100}%`;

      if (remaining <= 0) {
        remaining = seconds;
        renderCountdownValue(remaining);
        elements.countdownBar.style.transition = 'none';
        elements.countdownBar.style.width = '100%';
        refreshMail();
      }
    }, 1000);
  };

  const storedAutoRefresh = getStored(CONFIG.AUTO_REFRESH_KEY);
  elements.autoRefreshCheckbox.checked = storedAutoRefresh === null ? true : storedAutoRefresh === 'true';
  elements.refreshIntervalSelect.value = getStored(CONFIG.REFRESH_INTERVAL_KEY) || '30';

  elements.autoRefreshCheckbox.addEventListener('change', () => {
    setStored(CONFIG.AUTO_REFRESH_KEY, String(elements.autoRefreshCheckbox.checked));
    toast(
      elements.autoRefreshCheckbox.checked
        ? t('toast.auto_enabled', { seconds: elements.refreshIntervalSelect.value })
        : t('toast.auto_disabled'),
      elements.autoRefreshCheckbox.checked ? 'success' : 'info'
    );
    apply();
  });

  elements.refreshIntervalSelect.addEventListener('change', () => {
    setStored(CONFIG.REFRESH_INTERVAL_KEY, elements.refreshIntervalSelect.value);
    if (elements.autoRefreshCheckbox.checked) {
      toast(t('toast.auto_interval', { seconds: elements.refreshIntervalSelect.value }), 'info');
    }
    apply();
  });

  apply();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function setupSearch() {
  const handler = debounce(() => renderInbox(), CONFIG.SEARCH_DEBOUNCE);
  elements.emailSearch.addEventListener('input', handler);
}

function setupDomainSelector() {
  elements.domainSelect.innerHTML = '';
  elements.domainSelect.disabled = true;
}

async function loadDomains() {
  const data = await fetchJson('/domains');
  availableDomains = Array.isArray(data.domains) ? data.domains : [];
  allowDevMail = data.source !== 'firestore';
  document.getElementById('send-test-mail-trigger')?.classList.toggle('hidden', !allowDevMail);
  const storedDomain = getStored(CONFIG.DOMAIN_KEY) || '';
  const activeDomain =
    (storedDomain === RANDOM_DOMAIN_VALUE ? RANDOM_DOMAIN_VALUE : '') ||
    (availableDomains.includes(storedDomain) ? storedDomain : '') ||
    (currentEmail.includes('@') ? currentEmail.split('@')[1] : '') ||
    RANDOM_DOMAIN_VALUE;

  elements.domainSelect.innerHTML = '';
  if (availableDomains.length) {
    const randomOption = document.createElement('option');
    randomOption.value = RANDOM_DOMAIN_VALUE;
    randomOption.textContent = t('domain.random');
    randomOption.selected = activeDomain === RANDOM_DOMAIN_VALUE;
    elements.domainSelect.appendChild(randomOption);
  }

  for (const domain of availableDomains) {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    option.selected = domain === activeDomain;
    elements.domainSelect.appendChild(option);
  }

  elements.domainSelect.disabled = availableDomains.length === 0;

  if (activeDomain === RANDOM_DOMAIN_VALUE) {
    setStored(CONFIG.DOMAIN_KEY, RANDOM_DOMAIN_VALUE);
  } else if (activeDomain) {
    setStored(CONFIG.DOMAIN_KEY, activeDomain);
  }

  elements.domainSelect.addEventListener('change', () => {
    if (elements.domainSelect.value === RANDOM_DOMAIN_VALUE) {
      setStored(CONFIG.DOMAIN_KEY, RANDOM_DOMAIN_VALUE);
      return;
    }

    setStored(CONFIG.DOMAIN_KEY, elements.domainSelect.value);
  });
}

function setupInboxActions() {
  const clickHandler = (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.stopPropagation();
      const { action, id } = actionButton.dataset;
      if (action === 'open') {
        openMail(id);
      }

      if (action === 'delete') {
        removeMailFromView(id);
      }

      if (action === 'load-more') {
        loadMoreMails();
      }

      return;
    }

    const item = event.target.closest('[data-open-id]');
    if (item) {
      openMail(item.dataset.openId);
    }
  };

  const keyHandler = (event) => {
    if (event.target.closest('[data-action]')) {
      return;
    }

    const item = event.target.closest('[data-open-id]');
    if (!item) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMail(item.dataset.openId);
    }
  };

  elements.emailList?.addEventListener('click', clickHandler);
  elements.emailList?.addEventListener('keydown', keyHandler);
}

function hideShortcuts() {
  document.querySelector('.shortcuts-overlay')?.remove();
}

function showShortcuts() {
  hideShortcuts();

  const overlay = document.createElement('div');
  overlay.className = 'shortcuts-overlay';
  overlay.innerHTML = `
    <div class="shortcuts-content" role="dialog" aria-modal="true" aria-label="${escapeHTML(t('shortcut.title'))}">
      <h2><i class="fa-solid fa-keyboard"></i> ${escapeHTML(t('shortcut.title'))}</h2>
      <div class="shortcut-list">
        <div class="shortcut-item"><span>${escapeHTML(t('shortcut.generate'))}</span><kbd>N</kbd></div>
        <div class="shortcut-item"><span>${escapeHTML(t('shortcut.refresh'))}</span><kbd>R</kbd></div>
        <div class="shortcut-item"><span>${escapeHTML(t('shortcut.search'))}</span><kbd>/</kbd></div>
        <div class="shortcut-item"><span>${escapeHTML(t('shortcut.copy'))}</span><kbd>C</kbd></div>
        <div class="shortcut-item"><span>${escapeHTML(t('shortcut.show'))}</span><kbd>?</kbd></div>
        <div class="shortcut-item"><span>${escapeHTML(t('shortcut.close'))}</span><kbd>Esc</kbd></div>
      </div>
      <button class="primary-button shortcut-close" type="button">${escapeHTML(t('shortcut.close_button'))}</button>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      hideShortcuts();
    }
  });

  overlay.querySelector('.shortcut-close')?.addEventListener('click', hideShortcuts);
  document.body.appendChild(overlay);
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (event.key === 'Escape') {
      hideShortcuts();
      return;
    }

    if (event.key === '?' && !isTyping) {
      event.preventDefault();
      showShortcuts();
      return;
    }

    if (isTyping) {
      return;
    }

    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      genEmail();
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      refreshMail();
      return;
    }

    if (event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copyEmail();
      return;
    }

    if (event.key === '/') {
      event.preventDefault();
      elements.emailSearch?.focus();
    }
  });
}

function scheduleNonCritical(task) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 1200 });
    return;
  }

  window.setTimeout(task, 250);
}

async function init() {
  await initI18n(document);
  initVisitorBadge();
  setSessionTimerVisibility(Boolean(currentEmail));
  setupDomainSelector();
  setupAutoRefresh();
  setupSearch();
  setupInboxActions();
  setupKeyboardShortcuts();
  elements.emailInput.value = currentEmail;

  if (currentEmail) {
    startSessionTimer();
    refreshMail();
  }

  const loadDomainsTask = () => {
    loadDomains()
      .then(() => {
        if (currentEmail && availableDomains.length) {
          const currentDomain = currentEmail.split('@')[1] || '';
          const storedDomain = getStored(CONFIG.DOMAIN_KEY) || '';
          if (storedDomain === RANDOM_DOMAIN_VALUE) {
            elements.domainSelect.value = RANDOM_DOMAIN_VALUE;
          } else if (currentDomain && availableDomains.includes(currentDomain)) {
            elements.domainSelect.value = currentDomain;
            setStored(CONFIG.DOMAIN_KEY, currentDomain);
          } else {
            elements.domainSelect.value = RANDOM_DOMAIN_VALUE;
          }
        } else if (availableDomains.length) {
          genEmail();
        } else {
          showError(t('error.no_domains'));
          toast(t('toast.no_domains'), 'error');
        }
      })
      .catch((error) => {
        showError(t('error.load_domains', { message: error.message }));
        toast(t('toast.load_domains', { message: error.message }), 'error');
      });
  };

  if (currentEmail) {
    if (document.readyState === 'complete') {
      scheduleNonCritical(loadDomainsTask);
    } else {
      window.addEventListener(
        'load',
        () => {
          scheduleNonCritical(loadDomainsTask);
        },
        { once: true }
      );
    }
  } else {
    loadDomainsTask();
  }

  window.addEventListener('tempmail:languagechange', () => {
    updateSystemStatus(currentStatus);
    updateEmailCount(mails.length);
    if (availableDomains.length && elements.domainSelect.value === RANDOM_DOMAIN_VALUE) {
      const randomOption = elements.domainSelect.querySelector(`option[value="${RANDOM_DOMAIN_VALUE}"]`);
      if (randomOption) {
        randomOption.textContent = t('domain.random');
      }
    }
    renderInbox();
  });

  window.addEventListener('storage', (event) => {
    if (![CONFIG.EMAIL_KEY, CONFIG.SESSION_START_KEY, CONFIG.DOMAIN_KEY].includes(event.key)) {
      return;
    }

    currentEmail = getStored(CONFIG.EMAIL_KEY) || '';
    elements.emailInput.value = currentEmail;

    const nextDomain =
      getStored(CONFIG.DOMAIN_KEY) ||
      (currentEmail.includes('@') ? currentEmail.split('@')[1] : '') ||
      '';

    if (nextDomain === RANDOM_DOMAIN_VALUE) {
      elements.domainSelect.value = RANDOM_DOMAIN_VALUE;
    } else if (nextDomain && availableDomains.includes(nextDomain)) {
      elements.domainSelect.value = nextDomain;
    } else if (availableDomains.length) {
      elements.domainSelect.value = RANDOM_DOMAIN_VALUE;
    }

    if (currentEmail) {
      startSessionTimer();
      refreshMail();
      return;
    }

    mails = [];
    selectedMail = null;
    renderInbox();
  });
}

window.genEmail = genEmail;
window.refreshMail = refreshMail;
window.copyEmail = copyEmail;
window.deleteAllEmails = deleteAllEmails;
window.showEmail = openMail;
window.showShortcuts = showShortcuts;
window.showSendTestMailModal = renderSendTestMailModal;

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
