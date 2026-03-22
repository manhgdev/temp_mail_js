import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const elements = {
  authCard: document.getElementById('admin-auth-card'),
  panel: document.getElementById('admin-panel'),
  loginForm: document.getElementById('admin-login-form'),
  alert: document.getElementById('admin-alert'),
  userLabel: document.getElementById('admin-user-label'),
  stats: document.getElementById('admin-stats'),
  pendingCount: document.getElementById('admin-pending-count'),
  activeCount: document.getElementById('admin-active-count'),
  inactiveCount: document.getElementById('admin-inactive-count'),
  openAddDomainBtn: document.getElementById('admin-open-add-domain'),
  refreshBtn: document.getElementById('admin-refresh'),
  logoutBtn: document.getElementById('admin-logout'),
  addDomainModal: document.getElementById('admin-add-domain-modal'),
  closeAddDomainBtn: document.getElementById('admin-close-add-domain'),
  cancelAddDomainBtn: document.getElementById('admin-cancel-add-domain'),
  addDomainForm: document.getElementById('admin-add-domain-form'),
  submitDomainLabel: document.getElementById('admin-submit-domain-label'),
  pendingCard: document.getElementById('pending-submissions-card'),
  pendingBody: document.getElementById('pending-submissions-body'),
  domainsCard: document.getElementById('managed-domains-card'),
  domainsBody: document.getElementById('managed-domains-body')
};

let auth = null;
let currentUser = null;
let domainModalMode = 'create';

const getAdminTableShells = () => Array.from(document.querySelectorAll('.admin-table-shell'));

const showAlert = (message = '', type = 'error') => {
  elements.alert.textContent = message;
  elements.alert.classList.toggle('hidden', !message);
  elements.alert.dataset.state = type;
};

const closeAddDomainModal = () => {
  elements.addDomainModal?.classList.add('hidden');
  domainModalMode = 'create';
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

const fetchJson = async (path, options = {}) => {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
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

const loadAdminData = async () => {
  if (!currentUser) {
    return;
  }

  const scrollPositions = getAdminTableShells().map((element) => element.scrollTop);

  const [submissionsData, domainsData] = await Promise.all([
    adminGet('/admin/submissions?status=pending'),
    adminGet('/admin/domains')
  ]);

  const submissions = submissionsData.submissions || [];
  const domains = domainsData.domains || [];

  elements.pendingCount.textContent = String(submissions.length);
  elements.activeCount.textContent = String(domains.filter((domain) => domain.active).length);
  elements.inactiveCount.textContent = String(domains.filter((domain) => !domain.active).length);

  renderPendingSubmissions(submissions);
  renderDomains(domains);

  getAdminTableShells().forEach((element, index) => {
    element.scrollTop = scrollPositions[index] ?? 0;
  });
};

const initFirebase = async () => {
  const payload = await fetchJson('/firebase/config');
  if (!payload.enabled || !payload.config) {
    throw new Error('Firebase client config is missing');
  }

  const app = initializeApp(payload.config);
  auth = getAuth(app);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      elements.authCard.classList.remove('hidden');
      elements.panel.classList.add('hidden');
      elements.stats.classList.add('hidden');
      elements.pendingCard.classList.add('hidden');
      elements.domainsCard.classList.add('hidden');
      elements.userLabel.textContent = 'Signed out';
      closeAddDomainModal();
      return;
    }

    const idTokenResult = await user.getIdTokenResult(true);
    if (!idTokenResult.claims.admin) {
      showAlert('This account is signed in but does not have admin=true custom claim.');
      await signOut(auth);
      return;
    }

    elements.authCard.classList.add('hidden');
    elements.panel.classList.remove('hidden');
    elements.stats.classList.remove('hidden');
    elements.pendingCard.classList.remove('hidden');
    elements.domainsCard.classList.remove('hidden');
    elements.userLabel.textContent = `${user.email} • admin`;
    showAlert('');
    await loadAdminData();
  });
};

elements.loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert('');
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showAlert(error.message);
  }
});

elements.logoutBtn?.addEventListener('click', async () => {
  if (!auth) {
    return;
  }

  await signOut(auth);
});

elements.openAddDomainBtn?.addEventListener('click', openAddDomainModal);
elements.closeAddDomainBtn?.addEventListener('click', closeAddDomainModal);
elements.cancelAddDomainBtn?.addEventListener('click', closeAddDomainModal);
elements.addDomainModal?.addEventListener('click', (event) => {
  if (event.target === elements.addDomainModal) {
    closeAddDomainModal();
  }
});

elements.refreshBtn?.addEventListener('click', async () => {
  try {
    showAlert('');
    await loadAdminData();
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

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || !currentUser) {
    return;
  }

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

    if (action === 'deactivate-domain') {
      await adminPost(`/admin/domains/${encodeURIComponent(id)}/deactivate`);
      await loadAdminData();
      return;
    }

    if (action === 'delete-domain') {
      const confirmed = window.confirm('Delete this domain permanently?');
      if (!confirmed) {
        return;
      }

      await adminPost(`/admin/domains/${encodeURIComponent(id)}/delete`);
      await loadAdminData();
    }
  } catch (error) {
    showAlert(error.message);
  }
});

initFirebase().catch((error) => {
  showAlert(error.message);
});
