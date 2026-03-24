import CONFIG from '../core/config.js';
import { ensureFirebaseAuth, loadFirebaseConfig } from '../core/firebase-client.js';
import { initI18n, t } from '../core/i18n.js';
import '../core/theme.js';
import {
  onAuthStateChanged,
  signOut,
  getRedirectResult
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

let selectedEmail = null;
let inboxes = [];
let currentMails = [];
let deleteTarget = null;
let refreshInterval = null;
let inboxCursor = null;
let isFetchingInboxes = false;
let mailCursor = null;
let isFetchingMails = false;
let activeMailId = null;
let appInboxPageSize = 20;
let isGuestMode = false;
let appPollTimer = null;

const api = async (method, path, body) => {
  const token = await window._getToken();
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return response.json();
};

const toast = (message, type = 'ok') => {
  const el = document.getElementById('toast');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.className = `toast ${type} show`;
  window.setTimeout(() => el.classList.remove('show'), 3000);
};

const relativeTime = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('app.time.just_now');
  if (minutes < 60) return t('app.time.minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('app.time.hours_ago', { count: hours });
  return t('app.time.days_ago', { count: Math.floor(hours / 24) });
};

const escHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const initVisitorBadge = () => {
  const badge = document.getElementById('visitor-badge');
  if (!badge) {
    return;
  }

  const params = new URLSearchParams({
    path: CONFIG.SITE_PATH,
    label: 'VISITORS',
    labelColor: '%23d9e3f0',
    countColor: '%23263759',
    style: 'plastic'
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

const navigateToLogin = (tab = 'login') => {
  window.location.href = `/login?tab=${encodeURIComponent(tab)}`;
};

const setGuestMode = (enabled) => {
  isGuestMode = enabled;
  document.body.classList.toggle('guest-mode', enabled);
  const mainPlaceholder = document.getElementById('main-placeholder');
  const inboxViewer = document.getElementById('inbox-viewer');
  const placeholderActions = document.getElementById('main-placeholder-actions');
  const searchInbox = document.getElementById('search-inbox');
  const searchMail = document.getElementById('search-mail');
  const domainSelect = document.getElementById('domain-select');
  const clearInboxesBtn = document.getElementById('btn-clear-inboxes');

  mainPlaceholder?.toggleAttribute('hidden', Boolean(selectedEmail));
  inboxViewer?.toggleAttribute('hidden', enabled || !selectedEmail);
  if (mainPlaceholder) {
    mainPlaceholder.style.display = selectedEmail ? 'none' : 'flex';
  }
  if (inboxViewer) {
    inboxViewer.style.display = enabled || !selectedEmail ? 'none' : 'flex';
  }
  placeholderActions?.toggleAttribute('hidden', !enabled);

  const userName = document.getElementById('user-name');
  const userAvatar = document.getElementById('user-avatar');
  const logoutButton = document.getElementById('logout-button');

  if (enabled) {
    clearInterval(refreshInterval);
    clearInterval(appPollTimer);
    refreshInterval = null;
    appPollTimer = null;
    closeMailModal();
    selectedEmail = null;
    currentMails = [];
    inboxes = [];

    if (userName) {
      userName.textContent = t('app.guest.user');
    }
    if (userAvatar) {
      userAvatar.textContent = 'G';
    }
    if (logoutButton) {
      logoutButton.textContent = t('app.action.login');
    }
    if (clearInboxesBtn) {
      clearInboxesBtn.style.display = 'none';
    }
    if (searchInbox) {
      searchInbox.value = '';
      searchInbox.disabled = true;
    }
    if (searchMail) {
      searchMail.value = '';
      searchMail.disabled = true;
    }
    if (domainSelect) {
      domainSelect.disabled = true;
    }
    renderInboxList();
    return;
  }

  if (logoutButton) {
    logoutButton.textContent = t('app.action.logout');
  }
  if (searchInbox) {
    searchInbox.disabled = false;
  }
  if (searchMail) {
    searchMail.disabled = false;
  }
  if (domainSelect) {
    domainSelect.disabled = false;
  }
  mainPlaceholder?.toggleAttribute('hidden', Boolean(selectedEmail));
  inboxViewer?.toggleAttribute('hidden', !selectedEmail);
  if (mainPlaceholder) {
    mainPlaceholder.style.display = selectedEmail ? 'none' : 'flex';
  }
  if (inboxViewer) {
    inboxViewer.style.display = selectedEmail ? 'flex' : 'none';
  }
};

const startAppPolling = () => {
  if (appPollTimer) {
    clearInterval(appPollTimer);
  }

  appPollTimer = window.setInterval(() => {
    if (isGuestMode) {
      return;
    }

    loadInboxList();
    if (selectedEmail) {
      loadMails(selectedEmail);
    }
  }, 20000);
};

const renderInboxList = () => {
  const el = document.getElementById('inbox-list');
  const query = (document.getElementById('search-inbox')?.value || '').toLowerCase().trim();
  const filtered = query ? inboxes.filter((item) => item.email.toLowerCase().includes(query)) : inboxes;

  const clearInboxesBtn = document.getElementById('btn-clear-inboxes');
  if (clearInboxesBtn) {
    clearInboxesBtn.style.display = inboxes.length >= 2 ? 'flex' : 'none';
  }

  if (!inboxes.length) {
    el.innerHTML = `
      <div class="inbox-empty">
        <div class="inbox-empty-icon">✉️</div>
        <div class="inbox-empty-title">${t(isGuestMode ? 'app.guest.inboxes_empty_title' : 'app.inboxes.empty_title')}</div>
        <div>${t(isGuestMode ? 'app.guest.inboxes_empty_body' : 'app.inboxes.empty_body')}</div>
      </div>
    `;
    return;
  }

  if (!filtered.length) {
    el.innerHTML = `
      <div class="inbox-empty">
        <div class="inbox-empty-icon">🔍</div>
        <div class="inbox-empty-title">${t('app.search.empty_title')}</div>
        <div>${t('app.search.empty_body')}</div>
      </div>
    `;
    return;
  }

  el.innerHTML = filtered
    .map(
      (inbox) => `
        <div class="inbox-card ${inbox.email === selectedEmail ? 'active' : ''} ${inbox.unread_count > 0 ? 'has-unread' : ''}" onclick="TempMailApp.selectInbox('${inbox.email}')">
          <div class="inbox-card-email">${inbox.email}</div>
          <div class="inbox-card-meta">
            <span class="inbox-card-domain">@${inbox.domain}</span>
            ${inbox.last_mail_at ? `<span class="inbox-card-time">${relativeTime(inbox.last_mail_at)}</span>` : ''}
          </div>
          ${inbox.unread_count > 0 ? `<div class="unread-badge">${inbox.unread_count > 99 ? '99+' : inbox.unread_count}</div>` : ''}
          <button class="inbox-card-delete" onclick="TempMailApp.promptDelete(event, '${inbox.email}')" title="${t('app.action.delete')}">🗑️</button>
        </div>
      `
    )
    .join('');
};

const renderMails = (mails, email) => {
  const listEl = document.getElementById('mail-list');
  const query = (document.getElementById('search-mail')?.value || '').trim();
  const clearAllMailsBtn = document.getElementById('btn-clear-all');
  const previousScrollTop = listEl?.scrollTop || 0;

  if (clearAllMailsBtn) {
    clearAllMailsBtn.style.display = mails.length >= 2 ? 'flex' : 'none';
  }

  if (!mails.length) {
    listEl.innerHTML = `
      <div class="no-mail">
        <div class="no-mail-icon">${query ? '🔍' : '📭'}</div>
        <div class="no-mail-text">${query ? t('app.mail.search_empty') : t('app.mail.empty')}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = mails
    .map(
      (mail, index) => `
        <div class="mail-card" id="mail-${index}" data-mail-id="${mail.id}" onclick="TempMailApp.toggleMail(${index}, '${mail.id}', '${email}')">
          <div class="mail-card-header">
            <div class="mail-card-copy">
              <div class="mail-card-from">${escHtml(mail.from || '(unknown)')}</div>
              <div class="mail-card-subject">${escHtml(mail.subject || '(no subject)')}</div>
              <div class="mail-card-preview">${escHtml(mail.preview || '')}</div>
            </div>
            <div class="mail-card-time">${relativeTime(mail.created_at)}</div>
          </div>
          <div class="mail-body" id="body-${index}"></div>
          <button class="mail-card-delete" onclick="TempMailApp.deleteMail(event, '${email}', '${mail.id}', ${index})">${t('app.action.delete_mail')}</button>
        </div>
      `
    )
    .join('');

  listEl.scrollTop = previousScrollTop;
};

const renderMailsFilter = () => {
  const query = (document.getElementById('search-mail')?.value || '').toLowerCase().trim();
  const filtered = query
    ? currentMails.filter(
        (item) =>
          (item.subject && item.subject.toLowerCase().includes(query)) ||
          (item.from && item.from.toLowerCase().includes(query)) ||
          (item.preview && item.preview.toLowerCase().includes(query))
      )
    : currentMails;

  renderMails(filtered, selectedEmail);
};

const hasHtmlDocument = (value = '') => /<(?:!doctype|html|body)\b/i.test(String(value));

const closeMailModal = () => {
  document.querySelector('.email-modal')?.remove();
  activeMailId = null;
};

const renderMailBody = async (container, mail) => {
  const tokenStr = window._currentUser ? `?token=${await window._getToken()}` : '';
  const htmlViewerUrl = `/mail/${encodeURIComponent(mail.id)}/html${tokenStr}`;
  const fallbackText = String(mail.body_text || mail.preview || t('mail.no_preview'));

  try {
    const response = await fetch(htmlViewerUrl, {
      headers: {
        Authorization: `Bearer ${await window._getToken()}`
      }
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const html = await response.text();
    if (hasHtmlDocument(html)) {
      container.innerHTML = `<iframe class="email-body-frame notranslate" translate="no" src="${htmlViewerUrl}" title="${escHtml(mail.subject || '(no subject)')}"></iframe>`;
      return;
    }

    container.innerHTML = `<div class="email-body-inline-html notranslate" translate="no">${html}</div>`;
    return;
  } catch {}

  container.innerHTML = `<pre class="email-body-text notranslate" translate="no">${escHtml(fallbackText)}</pre>`;
};

const renderMailModal = async (mail) => {
  closeMailModal();
  activeMailId = mail.id;

  const tokenStr = window._currentUser ? `?token=${await window._getToken()}` : '';
  const htmlViewerUrl = `/mail/${encodeURIComponent(mail.id)}/html${tokenStr}`;
  const attachmentItems = (mail.attachments || [])
    .map(
      (attachment, index) => `
        <a class="attachment-link" href="/mail/${encodeURIComponent(mail.id)}/attachments/${index}${tokenStr}" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-paperclip"></i>
          ${escHtml(attachment.filename)} (${attachment.size} bytes)
        </a>
      `
    )
    .join('');

  const modal = document.createElement('div');
  modal.className = 'email-modal';
  modal.innerHTML = `
    <div class="email-modal-content">
      <div class="modal-header">
        <h2>${escHtml(mail.subject || '(no subject)')}</h2>
        <div class="modal-header-actions">
          <a
            class="modal-header-link"
            href="${htmlViewerUrl}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="${escHtml(t('button.open_html'))}"
            title="${escHtml(t('button.open_html'))}"
          >
            <span class="modal-header-link-icon" aria-hidden="true">↗</span>
          </a>
          <button class="close-btn" aria-label="${escHtml(t('shortcut.close_button'))}" type="button">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
      <div class="email-meta">
        <p><strong>${escHtml(t('mail.meta.from'))}</strong> <span class="notranslate" translate="no">${escHtml(mail.from || '-')}</span></p>
        <p><strong>${escHtml(t('mail.meta.to'))}</strong> <span class="notranslate" translate="no">${escHtml(mail.to || '-')}</span></p>
        <p><strong>${escHtml(t('mail.meta.date'))}</strong> ${escHtml(formatDate(mail.created_at))}</p>
      </div>
      <div class="email-body" data-mail-body>
        <div class="email-body-loading">${escHtml(t('app.loading'))}</div>
      </div>
      <div class="attachments">
        <h3>${escHtml(t('mail.attachments'))}</h3>
        ${attachmentItems ? `<div class="attachment-list">${attachmentItems}</div>` : `<p>${escHtml(t('mail.no_attachments'))}</p>`}
      </div>
    </div>
  `;

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeMailModal();
    }
  });

  modal.querySelector('.close-btn')?.addEventListener('click', closeMailModal);
  document.body.appendChild(modal);
  await renderMailBody(modal.querySelector('[data-mail-body]'), mail);
};

const loadInboxList = async (isLoadMore = false) => {
  if (isFetchingInboxes || (isLoadMore && !inboxCursor)) {
    return;
  }
  isFetchingInboxes = true;

  try {
    let url = `/user/inboxes?limit=${appInboxPageSize}`;
    if (isLoadMore && inboxCursor) {
      url += `&before=${encodeURIComponent(inboxCursor)}`;
    }

    const data = await api('GET', url);
    if (isLoadMore) {
      const uniqueNew = (data.inboxes || []).filter((item) => !inboxes.find((existing) => existing.email === item.email));
      inboxes = [...inboxes, ...uniqueNew];
    } else {
      inboxes = data.inboxes || [];
    }

    const totalInboxes = typeof data.total === 'number' ? data.total : inboxes.length;
    document.getElementById('inboxes-count').textContent = `(${inboxes.length}/${totalInboxes})`;
    inboxCursor = data.next_cursor || null;
    renderInboxList();
  } catch (error) {
    if (!isLoadMore) {
      document.getElementById('inbox-list').innerHTML = `<div class="inbox-empty"><div class="inbox-empty-icon">⚠️</div><div>${error.message}</div></div>`;
    }
  } finally {
    isFetchingInboxes = false;
  }
};

const loadMails = async (email, silent = false, isLoadMore = false) => {
  if (isFetchingMails || (isLoadMore && !mailCursor)) {
    return;
  }
  isFetchingMails = true;

  const listEl = document.getElementById('mail-list');
  const refreshBtn = document.getElementById('btn-refresh');

  if (!silent && !isLoadMore) {
    listEl.innerHTML = '<div class="skeleton sk-mail"></div><div class="skeleton sk-mail"></div>';
    mailCursor = null;
  }
  refreshBtn?.classList.add('spinning');

  try {
    let url = `/inbox/${encodeURIComponent(email)}?limit=${appInboxPageSize}`;
    if (isLoadMore && mailCursor) {
      url += `&before=${encodeURIComponent(mailCursor)}`;
    }

    const data = await api('GET', url);
    if (isLoadMore) {
      const uniqueNew = (data.mails || []).filter((item) => !currentMails.find((existing) => existing.id === item.id));
      currentMails = [...currentMails, ...uniqueNew];
    } else if (silent && currentMails.length > 0) {
      const uniqueNew = (data.mails || []).filter((item) => !currentMails.find((existing) => existing.id === item.id));
      currentMails = [...uniqueNew, ...currentMails];
    } else {
      currentMails = data.mails || [];
    }

    const totalMails = typeof data.total_count === 'number' ? data.total_count : currentMails.length;
    document.getElementById('mails-count').textContent = `(${currentMails.length}/${totalMails} ${t('app.mail.count_suffix')})`;
    if (!silent || isLoadMore) {
      mailCursor = data.next_cursor || null;
    }
    renderMailsFilter();
  } catch (error) {
    if (!isLoadMore) {
      listEl.innerHTML = `<div class="no-mail"><div class="no-mail-icon">⚠️</div><div class="no-mail-text">${error.message}</div></div>`;
    }
  } finally {
    refreshBtn?.classList.remove('spinning');
    isFetchingMails = false;
  }
};

const selectInbox = async (email) => {
  selectedEmail = email;
  closeMailModal();
  const index = inboxes.findIndex((item) => item.email === email);
  if (index !== -1 && inboxes[index].unread_count > 0) {
    inboxes[index].unread_count = 0;
    api('POST', `/user/inboxes/${encodeURIComponent(email)}/read`).catch(console.error);
  }

  renderInboxList();
  document.getElementById('main-placeholder').style.display = 'none';
  document.getElementById('inbox-viewer').style.display = 'flex';
  document.getElementById('main-placeholder')?.setAttribute('hidden', '');
  document.getElementById('inbox-viewer')?.removeAttribute('hidden');
  document.getElementById('viewer-email').textContent = email;
  loadMails(email);

  clearInterval(refreshInterval);
  refreshInterval = window.setInterval(() => {
    if (selectedEmail === email) {
      loadMails(email, true);
    }
  }, 15000);
};

const toggleMail = async (index, mailId, email) => {
  try {
    const mail = await api('GET', `/mail/${encodeURIComponent(mailId)}`);
    await renderMailModal(mail, email);
  } catch (error) {
    toast(t('toast.open_failed', { message: error.message }), 'err');
  }
};

const autoResizeIframe = (frame) => {
  try {
    frame.style.height = `${frame.contentDocument.body.scrollHeight}px`;
  } catch {}
};

const loadDomainList = async () => {
  try {
    const response = await fetch('/domains');
    const data = await response.json();
    const select = document.getElementById('domain-select');
    if (!select) return;

    select.innerHTML = `<option value="">${t('app.domain.random')}</option>`;
    (data.domains || []).forEach((domain) => {
      const opt = document.createElement('option');
      opt.value = domain;
      opt.textContent = `@${domain}`;
      select.appendChild(opt);
    });
  } catch (error) {
    console.error('Failed to load domains:', error);
    toast(t('app.error.load_domains'), 'err');
  }
};

const createEmail = async () => {
  if (isGuestMode) {
    navigateToLogin('register');
    return;
  }

  const btn = document.getElementById('btn-new-email');
  const domain = document.getElementById('domain-select')?.value || null;
  const originalInner = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin-loader"></span> ${t('app.creating')}`;

  try {
    const data = await api('POST', '/user/inboxes', domain ? { domain } : {});
    const inbox = data.inbox || data;
    inboxes.unshift(inbox);
    renderInboxList();
    selectInbox(inbox.email);
    toast(t('app.toast.created', { email: inbox.email }));
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalInner;
  }
};

const sendTestMail = async () => {
  if (!selectedEmail) return;
  const btn = document.getElementById('btn-test');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = t('app.sending');
  btn.disabled = true;

  try {
    await api('POST', '/dev/send-test-mail', {
      to: selectedEmail,
      subject: `Test mail ${new Date().toLocaleTimeString()}`,
      body: `This is a test email sent to ${selectedEmail}`
    });
    toast(t('app.toast.test_sent'));
    window.setTimeout(() => loadMails(selectedEmail), 1000);
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
};

const deleteAllMails = async () => {
  if (!selectedEmail) return;
  if (!window.confirm(t('app.confirm.delete_all_mails', { email: selectedEmail }))) return;

  const btn = document.getElementById('btn-clear-all');
  const originalInner = btn.innerHTML;
  btn.innerHTML = '<span class="spin-loader" style="width:10px;height:10px"></span>...';
  btn.disabled = true;

  try {
    await api('DELETE', `/inbox/${encodeURIComponent(selectedEmail)}/mails`);
    currentMails = [];
    closeMailModal();
    renderMails([], selectedEmail);
    toast(t('app.toast.deleted_all_mails'));
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    btn.innerHTML = originalInner;
    btn.disabled = false;
  }
};

const deleteAllInboxes = async () => {
  if (!inboxes.length) return;
  if (!window.confirm(t('app.confirm.delete_all_inboxes', { count: inboxes.length }))) return;

  const btn = document.getElementById('btn-clear-inboxes');
  const originalLabel = btn.textContent;
  btn.textContent = t('app.deleting');
  btn.disabled = true;

  try {
    await api('DELETE', '/user/inboxes');
    inboxes = [];
    closeMailModal();
    renderInboxList();
    selectedEmail = null;
    clearInterval(refreshInterval);
    document.getElementById('inbox-viewer').style.display = 'none';
    document.getElementById('main-placeholder').style.display = 'flex';
    toast(t('app.toast.deleted_all_inboxes'));
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    btn.textContent = originalLabel;
    btn.disabled = false;
  }
};

const promptDelete = (event, email) => {
  event.stopPropagation();
  deleteTarget = email;
  document.getElementById('modal-email').textContent = email;
  document.getElementById('modal-bg').classList.add('open');
};

const closeModal = () => {
  document.getElementById('modal-bg').classList.remove('open');
  deleteTarget = null;
};

const confirmDelete = async () => {
  if (!deleteTarget) return;
  const email = deleteTarget;
  closeModal();

  try {
    await api('DELETE', `/user/inboxes/${encodeURIComponent(email)}`);
    inboxes = inboxes.filter((item) => item.email !== email);
    renderInboxList();
    if (selectedEmail === email) {
      selectedEmail = null;
      closeMailModal();
      clearInterval(refreshInterval);
      document.getElementById('inbox-viewer').style.display = 'none';
      document.getElementById('main-placeholder').style.display = 'flex';
    }
    toast(t('app.toast.deleted_inbox', { email }));
  } catch (error) {
    toast(error.message, 'err');
  }
};

const deleteMail = async (event, email, mailId, index) => {
  event.stopPropagation();
  try {
    await api('DELETE', `/inbox/${encodeURIComponent(email)}/${encodeURIComponent(mailId)}`);
    currentMails = currentMails.filter((item) => item.id !== mailId);
    if (activeMailId === mailId) {
      closeMailModal();
    }
    document.getElementById(`mail-${index}`)?.remove();
    if (!document.getElementById('mail-list')?.querySelector('.mail-card')) {
      renderMails([], email);
    }
    toast(t('app.toast.deleted_mail'));
  } catch (error) {
    toast(error.message, 'err');
  }
};

const refreshInbox = () => {
  if (selectedEmail) {
    loadMails(selectedEmail);
  }
};

const copyEmail = () => {
  if (!selectedEmail) return;
  navigator.clipboard.writeText(selectedEmail).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = t('app.copied');
    btn.classList.add('copied');
    window.setTimeout(() => {
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </svg>
        ${t('app.action.copy')}
      `;
      btn.classList.remove('copied');
    }, 2000);
  });
};

const handleLogout = async () => {
  if (isGuestMode) {
    navigateToLogin('login');
    return;
  }

  try {
    await signOut(window._auth);
    setGuestMode(true);
  } catch {}
};

const handleInboxScroll = (el) => {
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
    loadInboxList(true);
  }
};

const handleMailScroll = (el) => {
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
    loadMails(selectedEmail, false, true);
  }
};

const applyStaticTranslations = () => {
  document.getElementById('sidebar-title-text').textContent = t('app.sidebar.title');
  document.getElementById('btn-clear-inboxes-label').textContent = t('app.action.delete_all');
  document.getElementById('btn-new-email-label').textContent = t('app.action.create');
  document.getElementById('search-inbox').placeholder = t('app.search.address');
  document.getElementById('main-placeholder-title').textContent = t(isGuestMode ? 'app.guest.title' : 'app.placeholder.title');
  document.getElementById('main-placeholder-body').textContent = t(isGuestMode ? 'app.guest.body' : 'app.placeholder.body');
  document.getElementById('btn-test-label').textContent = t('app.action.test_mail');
  document.getElementById('btn-copy-label').textContent = t('app.action.copy');
  document.getElementById('btn-clear-all-label').textContent = t('app.action.delete_all');
  document.getElementById('search-mail').placeholder = t('search.placeholder');
  document.getElementById('modal-title').textContent = t('app.modal.title');
  document.getElementById('modal-msg-prefix').textContent = t('app.modal.body_prefix');
  document.getElementById('modal-msg-suffix').textContent = t('app.modal.body_suffix');
  document.getElementById('modal-cancel').textContent = t('app.action.cancel');
  document.getElementById('modal-confirm').textContent = t('app.action.delete');
  document.getElementById('theme-toggle-label').textContent = t('app.theme');
  document.getElementById('page-title').textContent = t('app.page.title');
  document.getElementById('user-loading').textContent = t('app.user.loading');
  document.getElementById('logout-button').textContent = t(isGuestMode ? 'app.action.login' : 'app.action.logout');
  document.getElementById('btn-new-email-label').textContent = t('app.action.create');
  document.getElementById('main-placeholder-create').textContent = t('app.action.create_account');
  document.getElementById('main-placeholder-login').textContent = t('app.action.login');
  if (isGuestMode) {
    document.getElementById('user-name').textContent = t('app.guest.user');
  }
  document.querySelector('[data-i18n="footer.local_ui"]')?.replaceChildren(document.createTextNode(t('footer.local_ui')));
  document.querySelector('[data-i18n="footer.version"]')?.replaceChildren(document.createTextNode(t('footer.version')));
  document.querySelector('[data-i18n="footer.inbox"]')?.replaceChildren(document.createTextNode(t('footer.inbox')));
  document.querySelector('[data-i18n="footer.submit_domain"]')?.replaceChildren(document.createTextNode(t('footer.submit_domain')));
  document.querySelector('[data-i18n="footer.privacy"]')?.replaceChildren(document.createTextNode(t('footer.privacy')));
};

const initPage = async () => {
  await initI18n(document);
  applyStaticTranslations();
  initVisitorBadge();
  window.addEventListener('tempmail:languagechange', () => {
    applyStaticTranslations();
    renderInboxList();
    renderMailsFilter();
  });
  const firebaseConfig = await loadFirebaseConfig().catch(() => null);
  appInboxPageSize = Math.max(1, Number(firebaseConfig?.app_inbox_page_size || 20));
  if (firebaseConfig?.is_production) {
    document.getElementById('btn-test')?.remove();
  }

  const auth = await ensureFirebaseAuth();
  try {
    await getRedirectResult(auth);
  } catch (error) {
    console.warn('[app] getRedirectResult error:', error.code || error.message);
  }

  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    setGuestMode(true);
    return;
  }

  setGuestMode(false);
  window._auth = auth;
  window._currentUser = user;
  window._getToken = async () => window._currentUser?.getIdToken() || null;

  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  nameEl.textContent = displayName;
  if (user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" />`;
  } else {
    avatarEl.textContent = displayName[0].toUpperCase();
  }

  onAuthStateChanged(auth, (currentUser) => {
    if (!currentUser) {
      window._currentUser = null;
      setGuestMode(true);
      return;
    }
    setGuestMode(false);
    window._currentUser = currentUser;
    loadDomainList();
    loadInboxList();
    startAppPolling();
  });

  loadDomainList();
  loadInboxList();
  startAppPolling();

  document.getElementById('modal-bg')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  });
};

window.TempMailApp = {
  autoResizeIframe,
  closeModal,
  confirmDelete,
  copyEmail,
  createEmail,
  deleteAllInboxes,
  deleteAllMails,
  deleteMail,
  handleInboxScroll,
  handleLogout,
  handleMailScroll,
  promptDelete,
  refreshInbox,
  renderInboxList,
  renderMailsFilter,
  selectInbox,
  sendTestMail,
  toggleMail
};

void initPage();
