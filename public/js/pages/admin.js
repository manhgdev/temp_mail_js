import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { fetchJson } from '../core/api-client.js';
import { ensureFirebaseAuth } from '../core/firebase-client.js';
import CONFIG from '../core/config.js';

const SIDEBAR_STORAGE_KEY = 'admin_sidebar_collapsed';
const MOBILE_SIDEBAR_MEDIA_QUERY = '(max-width: 920px)';
const SECTION_HASHES = new Set(['overview', 'domains', 'users', 'mails']);

const elements = {
  authCard: document.getElementById('admin-auth-view'),
  dashboard: document.getElementById('admin-dashboard'),
  alert: document.getElementById('admin-alert'),
  authKicker: document.getElementById('admin-auth-kicker'),
  authTitle: document.getElementById('admin-auth-title'),
  authBody: document.getElementById('admin-auth-body'),
  authLogin: document.getElementById('admin-auth-login'),
  authRegister: document.getElementById('admin-auth-register'),
  userLabel: document.getElementById('admin-user-label'),
  userAvatar: document.getElementById('admin-user-avatar'),
  pendingCount: document.getElementById('admin-pending-count'),
  activeCount: document.getElementById('admin-active-count'),
  inactiveCount: document.getElementById('admin-inactive-count'),
  totalUsersCount: document.getElementById('admin-total-users-count'),
  openAddDomainBtn: document.getElementById('admin-open-add-domain'),
  refreshBtn: document.getElementById('admin-refresh'),
  logoutBtn: document.getElementById('admin-logout'),
  addDomainModal: document.getElementById('admin-add-domain-modal'),
  closeAddDomainBtn: document.getElementById('admin-close-add-domain'),
  cancelAddDomainBtn: document.getElementById('admin-cancel-add-domain'),
  addDomainForm: document.getElementById('admin-add-domain-form'),
  submitDomainLabel: document.getElementById('admin-submit-domain-label'),
  editUserModal: document.getElementById('admin-edit-user-modal'),
  closeEditUserBtn: document.getElementById('admin-close-edit-user'),
  cancelEditUserBtn: document.getElementById('admin-cancel-edit-user'),
  editUserForm: document.getElementById('admin-edit-user-form'),
  pendingBody: document.getElementById('pending-submissions-body'),
  domainsBody: document.getElementById('managed-domains-body'),
  usersBody: document.getElementById('admin-users-body'),
  userSearch: document.getElementById('admin-user-search'),
  usersRefreshBtn: document.getElementById('admin-users-refresh'),
  usersLoadMoreBtn: document.getElementById('admin-users-load-more'),
  userEmailsTitle: document.getElementById('admin-user-emails-title'),
  userEmailsSubtitle: document.getElementById('admin-user-emails-subtitle'),
  userEmailsBody: document.getElementById('admin-user-emails-body'),
  userEmailsDeleteAllBtn: document.getElementById('admin-user-emails-delete-all'),
  userEmailsLoadMoreBtn: document.getElementById('admin-user-emails-load-more'),
  emailMailsTitle: document.getElementById('admin-email-mails-title'),
  emailMailsSubtitle: document.getElementById('admin-email-mails-subtitle'),
  emailMailsBody: document.getElementById('admin-email-mails-body'),
  emailMailsLoadMoreBtn: document.getElementById('admin-email-mails-load-more'),
  mailDetailMeta: document.getElementById('admin-mail-detail-meta'),
  mailDetail: document.getElementById('admin-mail-detail'),
  sidebarToggle: document.getElementById('admin-sidebar-toggle'),
  mobileMenuButton: document.getElementById('admin-mobile-menu-button'),
  sidebarBackdrop: document.getElementById('admin-sidebar-backdrop'),
  navItems: Array.from(document.querySelectorAll('[data-section]')),
  panels: Array.from(document.querySelectorAll('[data-panel]')),
  sectionLinks: Array.from(document.querySelectorAll('[data-open-section]'))
};

let auth = null;
let currentUser = null;
let domainModalMode = 'create';
let activeSection = 'overview';
let adminUsers = [];
let adminUserEmails = [];
let adminEmailMails = [];
let selectedAdminUser = null;
let selectedAdminEmail = '';
let adminUsersCursor = null;
let adminUserEmailsCursor = null;
let adminEmailMailsCursor = null;
let userSearchDebounceTimer = null;
const mobileSidebarMedia = window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY);

const getAdminTableShells = () => Array.from(document.querySelectorAll('.admin-table-shell'));

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

const showAlert = (message = '', type = 'error') => {
  elements.alert.textContent = message;
  elements.alert.classList.toggle('hidden', !message);
  elements.alert.dataset.state = type;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getAuthViewCopy = (mode) => {
  const dataset = elements.authCard?.dataset || {};
  const prefix = mode === 'unauthorized' ? 'unauthorized' : 'unauth';

  return {
    kicker: dataset[`${prefix}Kicker`] || '',
    title: dataset[`${prefix}Title`] || '',
    body: dataset[`${prefix}Body`] || '',
    loginLabel: dataset[`${prefix}LoginLabel`] || '',
    registerLabel: dataset[`${prefix}RegisterLabel`] || '',
    loginHref: dataset[`${prefix}LoginHref`] || '/login?tab=login&redirect=%2Fadmin',
    registerHref: dataset[`${prefix}RegisterHref`] || '/login?tab=register&redirect=%2Fadmin'
  };
};

const setSidebarCollapsed = (collapsed) => {
  document.body.classList.toggle('admin-sidebar-collapsed', collapsed);
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
};

const setMobileSidebarOpen = (open) => {
  document.body.classList.toggle('admin-sidebar-mobile-open', open);
  elements.sidebarBackdrop?.classList.toggle('hidden', !open);
  elements.mobileMenuButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
};

const closeMobileSidebar = () => {
  if (!mobileSidebarMedia.matches) {
    return;
  }
  setMobileSidebarOpen(false);
};

const applyStoredSidebarState = () => {
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1');
  setMobileSidebarOpen(false);
};

const getSectionFromHash = () => {
  const section = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  return SECTION_HASHES.has(section) ? section : 'overview';
};

const syncHashWithSection = (section) => {
  const nextHash = `#${section}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', nextHash);
  }
};

const setActiveSection = (section, options = {}) => {
  const { updateHash = true } = options;
  const requestedSection = SECTION_HASHES.has(section) ? section : 'overview';
  const nextSection = requestedSection === 'mails' && !selectedAdminEmail ? 'users' : requestedSection;
  activeSection = nextSection;
  elements.navItems.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.section === nextSection);
  });
  elements.panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === nextSection);
  });
  if (updateHash) {
    syncHashWithSection(nextSection);
  }
};

const syncMailsNavState = () => {
  const mailsNavItem = elements.navItems.find((item) => item.dataset.section === 'mails');
  if (!mailsNavItem) {
    return;
  }

  const disabled = !selectedAdminEmail;
  mailsNavItem.classList.toggle('is-disabled', disabled);
  mailsNavItem.disabled = disabled;
  mailsNavItem.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  mailsNavItem.title = disabled ? 'Select an email in Users first' : 'Open mails';
};

const setAuthenticatedView = (authenticated) => {
  elements.authCard.classList.toggle('hidden', authenticated);
  elements.dashboard.classList.toggle('hidden', !authenticated);
  elements.logoutBtn.classList.toggle('hidden', !authenticated);
};

const resetAdminUserState = () => {
  adminUsers = [];
  adminUserEmails = [];
  adminEmailMails = [];
  selectedAdminUser = null;
  selectedAdminEmail = '';
  adminUsersCursor = null;
  adminUserEmailsCursor = null;
  adminEmailMailsCursor = null;
  syncMailsNavState();
  renderUsers(adminUsers);
  renderUserEmails(adminUserEmails);
  renderEmailMails(selectedAdminEmail, adminEmailMails);
  renderMailDetail(null);
};

const getAdminDisplayName = (user) => {
  if (!user) {
    return 'Signed out';
  }

  return user.displayName || user.email?.split('@')[0] || user.email || 'Admin';
};

const resolveAdminAccess = async (user) => {
  const cachedTokenResult = await user.getIdTokenResult();
  if (cachedTokenResult.claims.admin) {
    return true;
  }

  const refreshedTokenResult = await user.getIdTokenResult(true);
  return Boolean(refreshedTokenResult.claims.admin);
};

const setAuthCardMode = (mode) => {
  const copy = getAuthViewCopy(mode);
  elements.authKicker.textContent = copy.kicker;
  elements.authTitle.textContent = copy.title;
  elements.authBody.textContent = copy.body;
  elements.authLogin.querySelector('span').textContent = copy.loginLabel;
  elements.authRegister.querySelector('span').textContent = copy.registerLabel;
  elements.authLogin.href = copy.loginHref;
  elements.authRegister.href = copy.registerHref;
  elements.authRegister.classList.remove('hidden');
};

const closeAddDomainModal = () => {
  elements.addDomainModal?.classList.add('hidden');
  domainModalMode = 'create';
};

const closeEditUserModal = () => {
  elements.editUserModal?.classList.add('hidden');
  elements.editUserForm?.reset();
};

const openAddDomainModal = () => {
  if (!elements.addDomainModal) {
    return;
  }

  domainModalMode = 'create';
  elements.addDomainForm?.reset();
  if (elements.submitDomainLabel) {
    elements.submitDomainLabel.textContent = 'Add domain';
  }
  elements.addDomainModal.classList.remove('hidden');
  elements.addDomainForm?.elements?.domain?.focus();
};

const openEditDomainModal = (domain) => {
  if (!elements.addDomainModal || !elements.addDomainForm) {
    return;
  }

  domainModalMode = 'edit';
  elements.addDomainForm.reset();
  elements.addDomainForm.elements.domain_id.value = domain.id;
  elements.addDomainForm.elements.domain.value = domain.domain;
  elements.addDomainForm.elements.expires_at.value = domain.expires_at
    ? domain.expires_at.slice(0, 16)
    : '';
  elements.addDomainForm.elements.active.checked = Boolean(domain.active);
  if (elements.submitDomainLabel) {
    elements.submitDomainLabel.textContent = 'Save changes';
  }
  elements.addDomainModal.classList.remove('hidden');
  elements.addDomainForm.elements.domain.focus();
};

const openEditUserModal = (user) => {
  if (!elements.editUserModal || !elements.editUserForm) {
    return;
  }

  elements.editUserForm.reset();
  elements.editUserForm.elements.uid.value = user.uid;
  elements.editUserForm.elements.display_name.value = user.display_name || '';
  elements.editUserForm.elements.email.value = user.email || '';
  elements.editUserModal.classList.remove('hidden');
  elements.editUserForm.elements.display_name.focus();
};

const getAdminHeaders = async () => {
  if (!currentUser) {
    throw new Error('You must sign in first');
  }

  const token = await currentUser.getIdToken();
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`
  };
};

const adminPost = async (path, payload = {}) =>
  fetchJson(path, {
    method: 'POST',
    headers: await getAdminHeaders(),
    body: JSON.stringify(payload)
  });

const adminGet = async (path) =>
  fetchJson(path, {
    headers: {
      authorization: `Bearer ${await currentUser.getIdToken()}`
    }
  });

const renderPendingSubmissions = (submissions) => {
  elements.pendingBody.innerHTML = '';

  if (!submissions.length) {
    elements.pendingBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-check"></i>
            <h3>No pending submissions</h3>
            <p>Public submissions will appear here for approval.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  submissions.forEach((submission, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${submission.domain}</td>
      <td>${new Date(submission.created_at).toLocaleString()}</td>
      <td>${submission.submitted_by_ip || '-'}</td>
      <td>${submission.note || '-'}</td>
      <td>
        <input
          class="select-input admin-date-input"
          type="datetime-local"
          value="${submission.requested_expires_at ? submission.requested_expires_at.slice(0, 16) : ''}"
          data-expiry-for="${submission.id}"
        />
      </td>
      <td>
        <div class="table-actions">
          <button class="icon-button" data-action="approve-submission" data-id="${submission.id}" title="Approve">
            <i class="fa-solid fa-check"></i>
          </button>
          <button class="icon-button danger" data-action="reject-submission" data-id="${submission.id}" title="Reject">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </td>
    `;
    elements.pendingBody.appendChild(row);
  });
};

const renderDomains = (domains) => {
  elements.domainsBody.innerHTML = '';

  if (!domains.length) {
    elements.domainsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-globe"></i>
            <h3>No managed domains</h3>
            <p>Approved domains will appear here.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  domains.forEach((domain, index) => {
    const statusLabel = domain.active ? 'active' : 'inactive';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${domain.domain}</td>
      <td><span class="status-pill ${statusLabel}">${statusLabel}</span></td>
      <td>
        <input
          class="select-input admin-date-input"
          type="datetime-local"
          value="${domain.expires_at ? domain.expires_at.slice(0, 16) : ''}"
          data-domain-expiry="${domain.id}"
        />
      </td>
      <td>
        <div class="table-actions">
          <button class="icon-button edit" data-action="edit-domain" data-id="${domain.id}" title="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="icon-button domain-toggle ${domain.active ? 'is-active' : 'is-inactive'}" data-action="${domain.active ? 'deactivate-domain' : 'activate-domain'}" data-id="${domain.id}" title="${domain.active ? 'Deactivate' : 'Activate'}">
            <i class="fa-solid ${domain.active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
          </button>
          <button class="icon-button danger" data-action="delete-domain" data-id="${domain.id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    elements.domainsBody.appendChild(row);
  });
};

const renderUsers = (users) => {
  if (!elements.usersBody) {
    return;
  }

  elements.usersLoadMoreBtn?.classList.toggle('hidden', !adminUsersCursor);
  elements.usersBody.innerHTML = '';

  if (!users.length) {
    elements.usersBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-users"></i>
            <h3>No registered users</h3>
            <p>Users created through login will appear here.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  users.forEach((user, index) => {
    const row = document.createElement('tr');
    row.className = `is-clickable${selectedAdminUser?.uid === user.uid ? ' is-selected' : ''}`;
    row.dataset.adminUser = user.uid;
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${user.email || '-'}</td>
      <td>${formatDateTime(user.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="icon-button edit" data-action="edit-user" data-id="${user.uid}" title="Edit user">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="icon-button danger" data-action="delete-user" data-id="${user.uid}" title="Delete user">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    elements.usersBody.appendChild(row);
  });
};

const renderUserEmails = (emails) => {
  if (!elements.userEmailsBody) {
    return;
  }

  elements.userEmailsBody.innerHTML = '';
  elements.userEmailsTitle.textContent = selectedAdminUser
    ? `${selectedAdminUser.display_name || selectedAdminUser.email || selectedAdminUser.uid} emails`
    : 'User emails';
  elements.userEmailsSubtitle.textContent = selectedAdminUser
    ? `Email addresses owned by ${selectedAdminUser.email || selectedAdminUser.uid}.`
    : 'Select a user to inspect their managed email addresses.';

  if (!selectedAdminUser) {
    elements.userEmailsDeleteAllBtn?.classList.add('hidden');
    elements.userEmailsLoadMoreBtn?.classList.add('hidden');
    elements.userEmailsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-inbox"></i>
            <h3>No user selected</h3>
            <p>Choose a user from the left table to load their emails.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  elements.userEmailsDeleteAllBtn?.classList.toggle('hidden', !emails.length);
  elements.userEmailsLoadMoreBtn?.classList.toggle('hidden', !adminUserEmailsCursor);
  syncMailsNavState();

  if (!emails.length) {
    elements.userEmailsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-envelope"></i>
            <h3>No emails for this user</h3>
            <p>This account has not created any managed email addresses yet.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  emails.forEach((emailItem) => {
    const row = document.createElement('tr');
    row.className = `is-clickable${selectedAdminEmail === emailItem.email ? ' is-selected' : ''}`;
    row.dataset.adminEmail = emailItem.email;
    row.innerHTML = `
      <td><strong>${emailItem.email}</strong></td>
      <td>${emailItem.domain || '-'}</td>
      <td>${formatDateTime(emailItem.last_mail_at)}</td>
      <td>${emailItem.total_mail_count || 0}</td>
      <td>
        <div class="table-actions">
          <button class="icon-button danger" data-action="delete-user-email" data-id="${encodeURIComponent(emailItem.email)}" title="Delete email">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    elements.userEmailsBody.appendChild(row);
  });
};

const renderEmailMails = (email, mails) => {
  if (!elements.emailMailsBody) {
    return;
  }

  syncMailsNavState();
  elements.emailMailsLoadMoreBtn?.classList.toggle('hidden', !adminEmailMailsCursor);
  elements.emailMailsTitle.textContent = email ? `Mails for ${email}` : 'Email mails';
  elements.emailMailsSubtitle.textContent = email
    ? 'Latest messages stored for the selected email address.'
    : 'Open a user email from the Users section to inspect its messages here.';
  elements.emailMailsBody.innerHTML = '';

  if (!email) {
    elements.emailMailsBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-envelope-open-text"></i>
            <h3>No email selected</h3>
            <p>Open a user email from the Users section first.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  if (!mails.length) {
    elements.emailMailsBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty-inbox">
          <div class="empty-state">
            <i class="fa-solid fa-inbox"></i>
            <h3>No mails in this email</h3>
            <p>Incoming messages will appear here.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  mails.forEach((mail) => {
    const row = document.createElement('tr');
    row.className = 'is-clickable';
    row.dataset.adminMail = mail.id;
    row.innerHTML = `
      <td><strong>${mail.from || '-'}</strong></td>
      <td>${mail.subject || '(no subject)'}</td>
      <td>${formatDateTime(mail.created_at)}</td>
    `;
    elements.emailMailsBody.appendChild(row);
  });
};

const renderMailDetail = (mail) => {
  if (!elements.mailDetail) {
    return;
  }

  if (!mail) {
    elements.mailDetailMeta.textContent = 'Select a message to view preview and body text.';
    elements.mailDetail.innerHTML = `
      <i class="fa-solid fa-envelope-open-text"></i>
      <h3>No mail selected</h3>
      <p>Choose a message from the table above to inspect its details.</p>
    `;
    return;
  }

  elements.mailDetailMeta.textContent = `${mail.from || '-'} -> ${mail.to || '-'} • ${formatDateTime(mail.created_at)}`;
  elements.mailDetail.innerHTML = `
    <h3>${escapeHtml(mail.subject || '(no subject)')}</h3>
    <p>${escapeHtml(mail.preview || '')}</p>
    <h4>Body</h4>
    <pre>${escapeHtml(mail.body_text || '(empty body)')}</pre>
  `;
};

const loadAdminData = async () => {
  if (!currentUser) {
    return;
  }

  const scrollPositions = getAdminTableShells().map((element) => element.scrollTop);

  const [overviewData, submissionsData, domainsData] = await Promise.all([
    adminGet('/admin/overview'),
    adminGet('/admin/submissions?status=pending'),
    adminGet('/admin/domains')
  ]);

  const overview = overviewData.overview || {};
  const submissions = submissionsData.submissions || [];
  const domains = domainsData.domains || [];

  elements.pendingCount.textContent = String(overview.pending_count ?? submissions.length);
  elements.activeCount.textContent = String(
    overview.active_count ?? domains.filter((domain) => domain.active).length
  );
  elements.inactiveCount.textContent = String(
    overview.inactive_count ?? domains.filter((domain) => !domain.active).length
  );
  if (elements.totalUsersCount) {
    elements.totalUsersCount.textContent = String(overview.total_users ?? adminUsers.length);
  }

  renderPendingSubmissions(submissions);
  renderDomains(domains);

  getAdminTableShells().forEach((element, index) => {
    element.scrollTop = scrollPositions[index] ?? 0;
  });
};

const loadAdminUsers = async ({ append = false } = {}) => {
  if (!currentUser) {
    return;
  }

  const search = String(elements.userSearch?.value || '').trim();
  const params = new URLSearchParams({
    search,
    limit: '20'
  });
  if (append && adminUsersCursor) {
    params.set('cursor', adminUsersCursor);
  }
  const result = await adminGet(`/admin/users?${params.toString()}`);
  const nextUsers = result.users || [];
  adminUsers = append
    ? [...adminUsers, ...nextUsers.filter((item) => !adminUsers.some((existing) => existing.uid === item.uid))]
    : nextUsers;
  adminUsersCursor = result.nextCursor || null;

  if (selectedAdminUser?.uid) {
    const stillExists = adminUsers.find((user) => user.uid === selectedAdminUser.uid) || null;
    selectedAdminUser = stillExists;
    if (!stillExists) {
      adminUserEmails = [];
      selectedAdminEmail = '';
      adminEmailMails = [];
      adminUserEmailsCursor = null;
      adminEmailMailsCursor = null;
      renderUserEmails(adminUserEmails);
      renderEmailMails(selectedAdminEmail, adminEmailMails);
      renderMailDetail(null);
    } else if (activeSection === 'users' || activeSection === 'mails') {
      await loadAdminUserEmails(stillExists.uid);
      if (selectedAdminEmail && activeSection === 'mails') {
        await loadAdminEmailMails(selectedAdminEmail);
      }
    }
  }
  renderUsers(adminUsers);
};

const loadAdminUserEmails = async (uid, { append = false } = {}) => {
  if (!currentUser) {
    return null;
  }

  const params = new URLSearchParams({ limit: '20' });
  if (append && adminUserEmailsCursor) {
    params.set('before', adminUserEmailsCursor);
  }
  const payload = await adminGet(`/admin/users/${encodeURIComponent(uid)}/emails?${params.toString()}`);
  selectedAdminUser = payload.user || selectedAdminUser;
  const nextEmails = payload.emails || [];
  adminUserEmails = append
    ? [...adminUserEmails, ...nextEmails.filter((item) => !adminUserEmails.some((existing) => existing.email === item.email))]
    : nextEmails;
  adminUserEmailsCursor = payload.next_cursor || null;
  const selectedEmailStillExists = adminUserEmails.some((item) => item.email === selectedAdminEmail);
  if (!selectedEmailStillExists) {
    selectedAdminEmail = '';
    adminEmailMails = [];
    adminEmailMailsCursor = null;
    renderMailDetail(null);
  }
  renderUsers(adminUsers);
  renderUserEmails(adminUserEmails);
  renderEmailMails(selectedAdminEmail, adminEmailMails);
  return payload;
};

const loadAdminEmailMails = async (email, { append = false } = {}) => {
  if (!currentUser) {
    return null;
  }

  const params = new URLSearchParams({ limit: '20' });
  if (append && adminEmailMailsCursor) {
    params.set('before', adminEmailMailsCursor);
  }
  const payload = await adminGet(`/admin/emails/${encodeURIComponent(email)}/mails?${params.toString()}`);
  selectedAdminEmail = payload.email || email;
  const nextMails = payload.mails || [];
  adminEmailMails = append
    ? [...adminEmailMails, ...nextMails.filter((item) => !adminEmailMails.some((existing) => existing.id === item.id))]
    : nextMails;
  adminEmailMailsCursor = payload.next_cursor || null;
  renderUserEmails(adminUserEmails);
  renderEmailMails(selectedAdminEmail, adminEmailMails);
  renderMailDetail(null);
  return payload;
};

const loadAdminMailDetail = async (id) => {
  if (!currentUser) {
    return;
  }

  const payload = await adminGet(`/admin/mails/${encodeURIComponent(id)}`);
  renderMailDetail(payload.mail || null);
};

const ensureAdminSectionData = async (section) => {
  if (!currentUser) {
    return;
  }

  if (section === 'users' && !adminUsers.length) {
    await loadAdminUsers();
    renderUserEmails(adminUserEmails);
    return;
  }

  if (section === 'mails') {
    if (!adminUsers.length) {
      await loadAdminUsers();
    }
    renderEmailMails(selectedAdminEmail, adminEmailMails);
    return;
  }
};

const handleSectionChange = async (section, options = {}) => {
  setActiveSection(section, options);
  if (currentUser) {
    try {
      await ensureAdminSectionData(section);
    } catch (error) {
      showAlert(error.message);
    }
  }
  closeMobileSidebar();
};

const initFirebase = async () => {
  auth = await ensureFirebaseAuth();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      setAuthCardMode('unauthenticated');
      setAuthenticatedView(false);
      elements.userLabel.textContent = 'Signed out';
      elements.userAvatar.textContent = 'A';
      closeAddDomainModal();
      resetAdminUserState();
      return;
    }

    const displayName = getAdminDisplayName(user);
    elements.userLabel.textContent = displayName;
    elements.userAvatar.textContent = displayName[0]?.toUpperCase() || 'A';

    try {
      const hasAdminAccess = await resolveAdminAccess(user);
      if (!hasAdminAccess) {
        showAlert('');
        setAuthCardMode('unauthorized');
        setAuthenticatedView(false);
        resetAdminUserState();
        return;
      }

      showAlert('');
      setAuthenticatedView(true);
      await loadAdminData();
      await ensureAdminSectionData(activeSection);
    } catch (error) {
      setAuthenticatedView(false);
      resetAdminUserState();
      showAlert(error.message);
    }
  });
};

elements.logoutBtn?.addEventListener('click', async () => {
  if (!auth) {
    return;
  }
  await signOut(auth);
});

elements.sidebarToggle?.addEventListener('click', () => {
  setSidebarCollapsed(!document.body.classList.contains('admin-sidebar-collapsed'));
});

elements.mobileMenuButton?.addEventListener('click', () => {
  setMobileSidebarOpen(!document.body.classList.contains('admin-sidebar-mobile-open'));
});

elements.sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

elements.navItems.forEach((item) => {
  item.addEventListener('click', async () => {
    if (item.classList.contains('is-disabled')) {
      return;
    }
    await handleSectionChange(item.dataset.section);
  });
});

elements.sectionLinks.forEach((item) => {
  item.addEventListener('click', async () => {
    await handleSectionChange(item.dataset.openSection);
  });
});

mobileSidebarMedia.addEventListener('change', (event) => {
  if (!event.matches) {
    setMobileSidebarOpen(false);
  }
});

window.addEventListener('hashchange', async () => {
  await handleSectionChange(getSectionFromHash(), { updateHash: false });
});

elements.openAddDomainBtn?.addEventListener('click', openAddDomainModal);
elements.closeAddDomainBtn?.addEventListener('click', closeAddDomainModal);
elements.cancelAddDomainBtn?.addEventListener('click', closeAddDomainModal);
elements.addDomainModal?.addEventListener('click', (event) => {
  if (event.target === elements.addDomainModal) {
    closeAddDomainModal();
  }
});
elements.closeEditUserBtn?.addEventListener('click', closeEditUserModal);
elements.cancelEditUserBtn?.addEventListener('click', closeEditUserModal);
elements.editUserModal?.addEventListener('click', (event) => {
  if (event.target === elements.editUserModal) {
    closeEditUserModal();
  }
});

elements.refreshBtn?.addEventListener('click', async () => {
  try {
    showAlert('');
    await loadAdminData();
    await ensureAdminSectionData(activeSection);
  } catch (error) {
    showAlert(error.message);
  }
});

elements.usersRefreshBtn?.addEventListener('click', async () => {
  try {
    showAlert('');
    adminUsersCursor = null;
    await loadAdminUsers();
  } catch (error) {
    showAlert(error.message);
  }
});

elements.usersLoadMoreBtn?.addEventListener('click', async () => {
  if (!adminUsersCursor) {
    return;
  }

  try {
    showAlert('');
    await loadAdminUsers({ append: true });
  } catch (error) {
    showAlert(error.message);
  }
});

elements.userEmailsDeleteAllBtn?.addEventListener('click', async () => {
  if (!currentUser || !selectedAdminUser?.uid) {
    return;
  }

  const confirmed = window.confirm(
    `Delete all emails for ${selectedAdminUser.email || selectedAdminUser.uid}? This will remove all mails too.`
  );
  if (!confirmed) {
    return;
  }

  try {
    showAlert('');
    await adminPost(`/admin/users/${encodeURIComponent(selectedAdminUser.uid)}/emails/delete`);
    selectedAdminEmail = '';
    adminUserEmails = [];
    adminEmailMails = [];
    adminUserEmailsCursor = null;
    adminEmailMailsCursor = null;
    renderUserEmails(adminUserEmails);
    renderEmailMails(selectedAdminEmail, adminEmailMails);
    renderMailDetail(null);
    await loadAdminUsers();
    await loadAdminUserEmails(selectedAdminUser.uid);
  } catch (error) {
    showAlert(error.message);
  }
});

elements.userSearch?.addEventListener('input', () => {
  window.clearTimeout(userSearchDebounceTimer);
  userSearchDebounceTimer = window.setTimeout(async () => {
    if (!currentUser) {
      return;
    }
    try {
      showAlert('');
      adminUsersCursor = null;
      await loadAdminUsers();
    } catch (error) {
      showAlert(error.message);
    }
  }, 250);
});

elements.userEmailsLoadMoreBtn?.addEventListener('click', async () => {
  if (!selectedAdminUser?.uid || !adminUserEmailsCursor) {
    return;
  }

  try {
    showAlert('');
    await loadAdminUserEmails(selectedAdminUser.uid, { append: true });
  } catch (error) {
    showAlert(error.message);
  }
});

elements.emailMailsLoadMoreBtn?.addEventListener('click', async () => {
  if (!selectedAdminEmail || !adminEmailMailsCursor) {
    return;
  }

  try {
    showAlert('');
    await loadAdminEmailMails(selectedAdminEmail, { append: true });
  } catch (error) {
    showAlert(error.message);
  }
});

document.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-domain-expiry]');
  if (!input || !currentUser) {
    return;
  }

  try {
    showAlert('');
    await adminPost(`/admin/domains/${encodeURIComponent(input.dataset.domainExpiry)}/extend`, {
      expires_at: input.value
    });
    await loadAdminData();
  } catch (error) {
    showAlert(error.message);
  }
});

elements.addDomainForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    showAlert('');
    const formData = new FormData(form);
    const payload = {
      domain: formData.get('domain'),
      expires_at: String(formData.get('expires_at') || '').trim() || null,
      active: formData.get('active') === 'on'
    };
    const domainId = String(formData.get('domain_id') || '').trim();

    if (domainModalMode === 'edit' && domainId) {
      await adminPost(`/admin/domains/${encodeURIComponent(domainId)}/update`, payload);
    } else {
      await adminPost('/admin/domains', payload);
    }

    form.reset();
    closeAddDomainModal();
    await loadAdminData();
  } catch (error) {
    showAlert(error.message);
  }
});

elements.editUserForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    showAlert('');
    const formData = new FormData(form);
    const uid = String(formData.get('uid') || '').trim();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const displayName = String(formData.get('display_name') || '').trim();

    if (!uid) {
      throw new Error('User not found');
    }

    if (!email) {
      throw new Error('Email is required');
    }

    await adminPost(`/admin/users/${encodeURIComponent(uid)}/update`, {
      email,
      display_name: displayName
    });
    closeEditUserModal();
    await loadAdminUsers();
  } catch (error) {
    showAlert(error.message);
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (button && currentUser) {
    const { action, id } = button.dataset;

    try {
      showAlert('');

      if (action === 'approve-submission') {
        const input = document.querySelector(`[data-expiry-for="${id}"]`);
        await adminPost(`/admin/submissions/${encodeURIComponent(id)}/approve`, {
          expires_at: input?.value
        });
        await loadAdminData();
        return;
      }

      if (action === 'reject-submission') {
        const note = window.prompt('Optional rejection note', '') ?? '';
        await adminPost(`/admin/submissions/${encodeURIComponent(id)}/reject`, { note });
        await loadAdminData();
        return;
      }

      if (action === 'activate-domain') {
        const input = document.querySelector(`[data-domain-expiry="${id}"]`);
        await adminPost(`/admin/domains/${encodeURIComponent(id)}/activate`, {
          expires_at: input?.value
        });
        await loadAdminData();
        return;
      }

      if (action === 'edit-domain') {
        const domainsData = await adminGet('/admin/domains');
        const domain = (domainsData.domains || []).find((item) => item.id === id);
        if (!domain) {
          throw new Error('Domain not found');
        }
        openEditDomainModal(domain);
        return;
      }

      if (action === 'edit-user') {
        const user = adminUsers.find((item) => item.uid === id);
        if (!user) {
          throw new Error('User not found');
        }
        openEditUserModal(user);
        return;
      }

      if (action === 'delete-user') {
        const user = adminUsers.find((item) => item.uid === id);
        if (!user) {
          throw new Error('User not found');
        }

        const confirmed = window.confirm(
          `Delete user ${user.email || user.uid}? This will also remove all owned emails and mails.`
        );
        if (!confirmed) {
          return;
        }

        await adminPost(`/admin/users/${encodeURIComponent(id)}/delete`);
        if (selectedAdminUser?.uid === id) {
          selectedAdminUser = null;
          selectedAdminEmail = '';
          adminUserEmails = [];
          adminEmailMails = [];
          renderUserEmails(adminUserEmails);
          renderEmailMails(selectedAdminEmail, adminEmailMails);
          renderMailDetail(null);
        }
        await loadAdminUsers();
        return;
      }

      if (action === 'delete-user-email') {
        if (!selectedAdminUser?.uid) {
          throw new Error('Select a user first');
        }

        const email = decodeURIComponent(id || '').trim().toLowerCase();
        if (!email) {
          throw new Error('Email not found');
        }

        const confirmed = window.confirm(`Delete email ${email}? This will remove all mails in it.`);
        if (!confirmed) {
          return;
        }

        await adminPost(
          `/admin/users/${encodeURIComponent(selectedAdminUser.uid)}/emails/${encodeURIComponent(email)}/delete`
        );

        if (selectedAdminEmail === email) {
          selectedAdminEmail = '';
          adminEmailMails = [];
          adminEmailMailsCursor = null;
          renderEmailMails(selectedAdminEmail, adminEmailMails);
          renderMailDetail(null);
        }

        await loadAdminUsers();
        await loadAdminUserEmails(selectedAdminUser.uid);
        return;
      }

      if (action === 'deactivate-domain') {
        await adminPost(`/admin/domains/${encodeURIComponent(id)}/deactivate`);
        await loadAdminData();
        return;
      }

      if (action === 'delete-domain') {
        if (!window.confirm('Delete this domain permanently?')) {
          return;
        }
        await adminPost(`/admin/domains/${encodeURIComponent(id)}/delete`);
        await loadAdminData();
      }
    } catch (error) {
      showAlert(error.message);
    }
    return;
  }

  const userRow = event.target.closest('[data-admin-user]');
  if (userRow && currentUser) {
    try {
      showAlert('');
      await loadAdminUserEmails(userRow.dataset.adminUser);
    } catch (error) {
      showAlert(error.message);
    }
    return;
  }

  const emailRow = event.target.closest('[data-admin-email]');
  if (emailRow && currentUser) {
    try {
      showAlert('');
      await loadAdminEmailMails(emailRow.dataset.adminEmail);
      await handleSectionChange('mails');
    } catch (error) {
      showAlert(error.message);
    }
    return;
  }

  const mailRow = event.target.closest('[data-admin-mail]');
  if (mailRow && currentUser) {
    try {
      showAlert('');
      await loadAdminMailDetail(mailRow.dataset.adminMail);
    } catch (error) {
      showAlert(error.message);
    }
    return;
  }

});

applyStoredSidebarState();
syncMailsNavState();
setActiveSection(getSectionFromHash(), { updateHash: false });
setAuthCardMode('unauthenticated');
setAuthenticatedView(false);
resetAdminUserState();
initVisitorBadge();

initFirebase().catch((error) => {
  showAlert(error.message);
});
