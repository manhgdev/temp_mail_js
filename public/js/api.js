import CONFIG from './config.js';

const $ = (id) => document.getElementById(id);
const elements = {
  emailInput: $('addr'),
  emailTable: $('emails')?.querySelector('tbody'),
  emailTableContainer: $('emails')?.closest('.table-container'),
  emailResponsive: $('emails-responsive'),
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

let currentEmail = getStored(CONFIG.EMAIL_KEY) || '';
let mails = [];
let filteredMails = [];
let selectedMail = null;
let autoRefreshTimer = null;
let countdownTimer = null;
let availableDomains = [];
let allowDevMail = false;

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

  el.querySelector('.toast-close')?.addEventListener('click', () => el.remove());
  elements.toastContainer.appendChild(el);

  const timer = setTimeout(() => {
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 300);
  }, duration);

  el.addEventListener('mouseenter', () => clearTimeout(timer));
}

function updateSystemStatus(status) {
  elements.statusLed.classList.remove('online', 'offline', 'loading');
  elements.statusLed.classList.add(CONFIG.STATUS[status].class);
  elements.statusText.textContent = CONFIG.STATUS[status].text;
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
  document.title = count > 0 ? `(${count}) TempMail — Disposable Email` : 'TempMail — Disposable Email';
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

  elements.sessionTimer.style.display = '';
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    elements.sessionTimerText.textContent = formatSessionTime();
  }, 1000);
  elements.sessionTimerText.textContent = formatSessionTime();
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

function applyFilter() {
  const query = elements.emailSearch.value.trim().toLowerCase();
  filteredMails = mails.filter((mail) => {
    if (!query) {
      return true;
    }

    return [mail.from, mail.subject, mail.preview].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(query)
    );
  });
}

function renderResponsiveCards() {
  if (!elements.emailResponsive) {
    return;
  }

  elements.emailResponsive.innerHTML = '';
  if (filteredMails.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredMails.forEach((mail, index) => {
    const card = document.createElement('article');
    card.className = 'email-card';
    card.innerHTML = `
      <div class="email-card-row"><strong>#</strong><span>${index + 1}</span></div>
      <div class="email-card-row"><strong>From</strong><span>${escapeHTML(mail.from || '-')}</span></div>
      <div class="email-card-row"><strong>Subject</strong><span>${escapeHTML(mail.subject || '(no subject)')}</span></div>
      <div class="email-card-row"><strong>Date</strong><span>${escapeHTML(formatDate(mail.created_at))}</span></div>
      <div class="email-card-actions">
        <button class="ghost-button" data-action="open" data-id="${mail.id}"><i class="fa-solid fa-eye"></i></button>
        <button class="ghost-button" data-action="delete" data-id="${mail.id}"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    fragment.appendChild(card);
  });

  elements.emailResponsive.appendChild(fragment);
}

function alignInboxTableForMobile() {
  const container = elements.emailTableContainer;
  if (!container || window.innerWidth > 820) {
    return;
  }

  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  if (maxScrollLeft <= 0) {
    container.scrollLeft = 0;
    return;
  }

  container.scrollLeft = Math.round(maxScrollLeft / 2);
}

function renderTable() {
  applyFilter();
  updateEmailCount(mails.length);
  elements.emailTable.innerHTML = '';

  if (filteredMails.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="5" class="empty-inbox">
        <div class="empty-state">
          <i class="fa-solid fa-inbox"></i>
          <h3>${mails.length === 0 ? 'Inbox is empty' : 'No matching emails'}</h3>
          <p>${mails.length === 0 ? 'Generate an address or wait for a new email.' : 'Try another search term.'}</p>
        </div>
      </td>
    `;
    elements.emailTable.appendChild(row);
    renderResponsiveCards();
    alignInboxTableForMobile();
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredMails.forEach((mail, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td data-open-id="${mail.id}">${escapeHTML(mail.from || '-')}</td>
      <td data-open-id="${mail.id}">${escapeHTML(mail.subject || '(no subject)')}</td>
      <td title="${escapeHTML(formatDate(mail.created_at))}">${escapeHTML(formatDate(mail.created_at))}</td>
      <td>
        <div class="table-actions">
          <button class="icon-button" data-action="open" data-id="${mail.id}" title="Open">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="icon-button danger" data-action="delete" data-id="${mail.id}" title="Remove from list">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    fragment.appendChild(row);
  });

  elements.emailTable.appendChild(fragment);
  renderResponsiveCards();
  alignInboxTableForMobile();
}

function renderMailModal(mail) {
  const existing = document.querySelector('.email-modal');
  if (existing) {
    existing.remove();
  }

  const bodyText = String(mail.body_text || mail.preview || 'No preview available.');
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
        <button class="close-btn" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="email-meta">
        <p><strong>From:</strong> ${escapeHTML(mail.from || '-')}</p>
        <p><strong>To:</strong> ${escapeHTML(mail.to || '-')}</p>
        <p><strong>Date:</strong> ${escapeHTML(formatDate(mail.created_at))}</p>
      </div>
      <div class="email-body">
        <pre class="email-body-text">${escapeHTML(bodyText)}</pre>
      </div>
      <div class="modal-actions mail-modal-actions">
        <a class="primary-button" href="${htmlViewerUrl}" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-up-right-from-square"></i> Open HTML
        </a>
      </div>
      <div class="attachments">
        <h3>Attachments</h3>
        ${attachmentItems ? `<div class="attachment-list">${attachmentItems}</div>` : '<p>No attachments.</p>'}
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
}

function closeModal() {
  document.querySelector('.email-modal')?.remove();
}

function renderSendTestMailModal() {
  if (!allowDevMail) {
    toast('Send Test Mail is available in development only.', 'warning');
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
        <h2>Send Test Mail</h2>
        <button class="close-btn" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <form class="dev-mail-form" id="dev-mail-form">
        <label>
          From
          <input name="from" type="email" value="dev-sender@${escapeHTML(activeDomain)}" required />
        </label>
        <label>
          To
          <input name="to" type="email" value="${escapeHTML(currentEmail || '')}" required />
        </label>
        <label>
          Subject
          <input name="subject" type="text" value="UI test mail" required />
        </label>
        <label>
          Message
          <textarea name="body" required>This is a dev test mail from the UI.</textarea>
        </label>
        <div class="modal-actions dev-mail-actions">
          <button class="ghost-button" type="button" id="dev-mail-cancel">Cancel</button>
          <button class="primary-button dev-button" type="submit">
            <i class="fa-solid fa-paper-plane"></i> Send
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

    try {
      setLoading(true);
      await postJson('/dev/send-test-mail', {
        from: form.get('from'),
        to: form.get('to'),
        subject: form.get('subject'),
        body: form.get('body')
      });
      closeModal();
      toast('Test mail sent to inbox.', 'success');
      await refreshMail();
    } catch (error) {
      toast(`Failed to send test mail: ${error.message}`, 'error');
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
    toast('New email address generated!', 'success');
    await refreshMail();
  } catch (error) {
    setOffline();
    showError(`Generate failed: ${error.message}`);
    toast(`Failed to generate email: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function copyEmail() {
  if (!currentEmail) {
    toast('No email address to copy', 'warning');
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
  toast('Email copied to clipboard!', 'success');
}

async function refreshMail() {
  if (!currentEmail) {
    showError('No active inbox. Click New Address to create one.');
    toast('No active inbox. Click New Address first.', 'warning');
    return;
  }

  try {
    setLoading(true);
    setLoadingStatus();
    const data = await fetchJson(`/inbox/${encodeURIComponent(currentEmail)}`);
    mails = Array.isArray(data.mails) ? data.mails : [];
    showError('');
    setOnline();
    renderTable();
  } catch (error) {
    if (/not found/i.test(error.message)) {
      mails = [];
      selectedMail = null;
      currentEmail = '';
      removeStored(CONFIG.EMAIL_KEY);
      removeStored(CONFIG.SESSION_START_KEY);
      elements.emailInput.value = '';
      renderTable();
      showError('Inbox not found. Click New Address to create another one.');
      toast('Inbox not found. Click New Address to create another one.', 'warning', CONFIG.TOAST_DURATION_LONG);
      return;
    }

    setOffline();
    showError(`Refresh failed: ${error.message}`);
    toast(`Failed to refresh inbox: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function openMail(id) {
  try {
    const mail = await fetchJson(`/mail/${encodeURIComponent(id)}`);
    selectedMail = mail;
    renderMailModal(mail);
  } catch (error) {
    toast(`Failed to open email: ${error.message}`, 'error');
  }
}

async function removeMailFromView(id) {
  try {
    await deleteJson(`/mail/${encodeURIComponent(id)}`);
    mails = mails.filter((mail) => mail.id !== id);
    if (selectedMail?.id === id) {
      selectedMail = null;
      closeModal();
    }
    renderTable();
    toast('Email deleted.', 'success');
  } catch (error) {
    toast(`Failed to delete email: ${error.message}`, 'error');
  }
}

async function deleteAllEmails() {
  if (!currentEmail) {
    toast('No inbox to clear.', 'warning');
    return;
  }

  try {
    await deleteJson(`/inbox/${encodeURIComponent(currentEmail)}`);
    mails = [];
    selectedMail = null;
    closeModal();
    removeStored(CONFIG.EMAIL_KEY);
    removeStored(CONFIG.SESSION_START_KEY);
    currentEmail = '';
    elements.emailInput.value = '';
    renderTable();
    showError('Inbox deleted. Click New Address to create another one.');
    toast('Inbox deleted.', 'success');
  } catch (error) {
    toast(`Failed to clear inbox: ${error.message}`, 'error');
  }
}

function setupAutoRefresh() {
  const apply = () => {
    clearInterval(autoRefreshTimer);

    if (!elements.autoRefreshCheckbox.checked) {
      elements.countdown.textContent = '';
      elements.countdownBarContainer.classList.remove('active');
      return;
    }

    const seconds = Number(elements.refreshIntervalSelect.value || 30);
    let remaining = seconds;
    elements.countdown.textContent = `${remaining}s`;
    elements.countdownBarContainer.classList.add('active');
    elements.countdownBar.style.transition = 'none';
    elements.countdownBar.style.width = '100%';

    autoRefreshTimer = window.setInterval(() => {
      remaining -= 1;
      elements.countdown.textContent = `${Math.max(remaining, 0)}s`;
      elements.countdownBar.style.transition = 'width 1s linear';
      elements.countdownBar.style.width = `${(Math.max(remaining, 0) / seconds) * 100}%`;

      if (remaining <= 0) {
        remaining = seconds;
        elements.countdown.textContent = `${remaining}s`;
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
        ? `Auto-refresh enabled (${elements.refreshIntervalSelect.value}s)`
        : 'Auto-refresh disabled',
      elements.autoRefreshCheckbox.checked ? 'success' : 'info'
    );
    apply();
  });

  elements.refreshIntervalSelect.addEventListener('change', () => {
    setStored(CONFIG.REFRESH_INTERVAL_KEY, elements.refreshIntervalSelect.value);
    if (elements.autoRefreshCheckbox.checked) {
      toast(`Auto-refresh interval set to ${elements.refreshIntervalSelect.value}s`, 'info');
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
  const handler = debounce(() => renderTable(), CONFIG.SEARCH_DEBOUNCE);
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
    randomOption.textContent = 'random';
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

function setupTableActions() {
  const clickHandler = (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const { action, id } = actionButton.dataset;
      if (action === 'open') {
        openMail(id);
      }

      if (action === 'delete') {
        removeMailFromView(id);
      }

      return;
    }

    const openCell = event.target.closest('td[data-open-id]');
    if (openCell) {
      openMail(openCell.dataset.openId);
    }
  };

  elements.emailTable.addEventListener('click', clickHandler);
  elements.emailResponsive?.addEventListener('click', clickHandler);
}

function hideShortcuts() {
  document.querySelector('.shortcuts-overlay')?.remove();
}

function showShortcuts() {
  hideShortcuts();

  const overlay = document.createElement('div');
  overlay.className = 'shortcuts-overlay';
  overlay.innerHTML = `
    <div class="shortcuts-content" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <h3><i class="fa-solid fa-keyboard"></i> Keyboard shortcuts</h3>
      <div class="shortcut-list">
        <div class="shortcut-item"><span>Generate new address</span><kbd>N</kbd></div>
        <div class="shortcut-item"><span>Refresh inbox</span><kbd>R</kbd></div>
        <div class="shortcut-item"><span>Focus search</span><kbd>/</kbd></div>
        <div class="shortcut-item"><span>Copy current email</span><kbd>C</kbd></div>
        <div class="shortcut-item"><span>Show shortcuts</span><kbd>?</kbd></div>
        <div class="shortcut-item"><span>Close dialog</span><kbd>Esc</kbd></div>
      </div>
      <button class="primary-button shortcut-close" type="button">Close</button>
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

function init() {
  setupDomainSelector();
  setupAutoRefresh();
  setupSearch();
  setupTableActions();
  setupKeyboardShortcuts();

  loadDomains()
    .then(() => {
      elements.emailInput.value = currentEmail;
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
        startSessionTimer();
        refreshMail();
      } else if (availableDomains.length) {
        genEmail();
      } else {
        showError('No active domains available. Add active domains in Firebase for production or DOMAINS in .env for local development.');
        toast('No active domains available.', 'error');
      }
    })
    .catch((error) => {
      showError(`Failed to load domains: ${error.message}`);
      toast(`Failed to load domains: ${error.message}`, 'error');
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
    renderTable();
  });
}

window.genEmail = genEmail;
window.refreshMail = refreshMail;
window.copyEmail = copyEmail;
window.deleteAllEmails = deleteAllEmails;
window.showEmail = openMail;
window.showShortcuts = showShortcuts;
window.showSendTestMailModal = renderSendTestMailModal;

document.addEventListener('DOMContentLoaded', init);
