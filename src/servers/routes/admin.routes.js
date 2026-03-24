import {
  getAdminOverview
} from '../../services/admin/admin-overview.service.js';
import {
  activateDomain,
  approveSubmission,
  createAdminDomain,
  deactivateDomain,
  deleteManagedDomain,
  extendDomain,
  listManagedDomains,
  listPendingSubmissions,
  rejectSubmission,
  updateManagedDomain
} from '../../services/admin/admin-domain.service.js';
import {
  deleteAdminUser,
  getAdminUser,
  listAdminUsers,
  updateAdminUser
} from '../../services/admin/admin-user.service.js';
import {
  deleteAdminUserEmail,
  deleteAllAdminUserEmails,
  listAdminUserEmails
} from '../../services/admin/admin-email.service.js';
import { getAdminMailDetail, listAdminEmailMails } from '../../services/admin/admin-mail.service.js';
import {
  sendJson,
  notFound,
  readJsonBody,
  requireAdmin,
  badRequest
} from '../helpers.js';

/**
 * Handles all /admin/* routes.
 * All routes require a valid Firebase Admin ID token.
 */
export const handleAdminRoutes = async ({ url, method, pathname, request, response }) => {
  if (!pathname.startsWith('/admin/')) return false;

  const decodedToken = await requireAdmin(request, response);
  if (!decodedToken) return true;

  if (method === 'GET' && pathname === '/admin/overview') {
    const overview = await getAdminOverview();
    sendJson(response, 200, { overview });
    return true;
  }

  if (method === 'GET' && pathname === '/admin/users') {
    const search = url.searchParams.get('search') || '';
    const limit = Number(url.searchParams.get('limit') || 100);
    const cursor = url.searchParams.get('cursor') || '';
    const result = await listAdminUsers({ search, limit, cursor });
    sendJson(response, 200, result);
    return true;
  }

  if (method === 'GET' && /^\/admin\/users\/[^/]+$/.test(pathname)) {
    const uid = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const user = await getAdminUser(uid);
    if (!user) {
      notFound(response);
      return true;
    }
    sendJson(response, 200, { user });
    return true;
  }

  if (method === 'POST' && /^\/admin\/users\/[^/]+\/update$/.test(pathname)) {
    const uid = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const body = await readJsonBody(request);
    const user = await updateAdminUser(uid, {
      email: body.email,
      display_name: body.display_name
    });
    sendJson(response, 200, { status: 'updated', user });
    return true;
  }

  if (method === 'POST' && /^\/admin\/users\/[^/]+\/delete$/.test(pathname)) {
    const uid = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const result = await deleteAdminUser(uid);
    sendJson(response, 200, { status: 'deleted', ...result });
    return true;
  }

  if (method === 'GET' && /^\/admin\/users\/[^/]+\/emails$/.test(pathname)) {
    const uid = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const user = await getAdminUser(uid);
    if (!user) {
      notFound(response);
      return true;
    }
    const limit = Number(url.searchParams.get('limit') || 20);
    const before = url.searchParams.get('before') || '';
    const result = await listAdminUserEmails(uid, { limit, before });
    sendJson(response, 200, {
      user,
      emails: result.emails,
      next_cursor: result.nextCursor,
      total: result.totalCount
    });
    return true;
  }

  if (method === 'POST' && /^\/admin\/users\/[^/]+\/emails\/delete$/.test(pathname)) {
    const uid = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const user = await getAdminUser(uid);
    if (!user) {
      notFound(response);
      return true;
    }
    const result = await deleteAllAdminUserEmails(uid);
    sendJson(response, 200, { status: 'deleted', uid, ...result });
    return true;
  }

  if (method === 'POST' && /^\/admin\/users\/[^/]+\/emails\/.+\/delete$/.test(pathname)) {
    const parts = pathname.split('/');
    const uid = decodeURIComponent(parts[3] || '').trim();
    const email = decodeURIComponent(parts.slice(5, -1).join('/')).trim().toLowerCase();
    const user = await getAdminUser(uid);
    if (!user) {
      notFound(response);
      return true;
    }
    if (!email) {
      badRequest(response, 'email is required');
      return true;
    }
    const result = await deleteAdminUserEmail(uid, email);
    if (!result.removed) {
      notFound(response);
      return true;
    }
    sendJson(response, 200, { status: 'deleted', uid, ...result });
    return true;
  }

  if (method === 'GET' && /^\/admin\/emails\/.+\/mails$/.test(pathname)) {
    const email = decodeURIComponent(pathname.replace(/^\/admin\/emails\//, '').replace(/\/mails$/, '')).trim().toLowerCase();
    if (!email) {
      badRequest(response, 'email is required');
      return true;
    }
    const limit = Number(url.searchParams.get('limit') || 20);
    const before = url.searchParams.get('before') || '';
    const result = await listAdminEmailMails(email, { limit, before });
    sendJson(response, 200, {
      email: result.email,
      mails: result.mails,
      next_cursor: result.nextCursor,
      total_count: result.totalCount
    });
    return true;
  }

  if (method === 'GET' && /^\/admin\/mails\/[^/]+$/.test(pathname)) {
    const id = decodeURIComponent(pathname.split('/')[3] || '').trim();
    if (!id) {
      badRequest(response, 'mail id is required');
      return true;
    }
    const mail = await getAdminMailDetail(id);
    if (!mail) {
      notFound(response);
      return true;
    }
    sendJson(response, 200, { mail });
    return true;
  }

  // GET /admin/submissions
  if (method === 'GET' && pathname === '/admin/submissions') {
    const status = url.searchParams.get('status') || 'pending';
    const submissions = await listPendingSubmissions(status);
    sendJson(response, 200, { submissions });
    return true;
  }

  // POST /admin/submissions/{id}/approve
  if (method === 'POST' && /^\/admin\/submissions\/[^/]+\/approve$/.test(pathname)) {
    const submissionId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const body = await readJsonBody(request);
    const domain = await approveSubmission({
      submissionId,
      expiresAt: body.expires_at,
      adminUid: decodedToken.uid
    });
    sendJson(response, 200, { status: 'approved', domain });
    return true;
  }

  // POST /admin/submissions/{id}/reject
  if (method === 'POST' && /^\/admin\/submissions\/[^/]+\/reject$/.test(pathname)) {
    const submissionId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const body = await readJsonBody(request);
    const submission = await rejectSubmission({
      submissionId,
      adminUid: decodedToken.uid,
      note: body.note
    });
    sendJson(response, 200, { status: 'rejected', submission });
    return true;
  }

  // GET /admin/domains
  if (method === 'GET' && pathname === '/admin/domains') {
    const domains = await listManagedDomains();
    sendJson(response, 200, { domains });
    return true;
  }

  // POST /admin/domains
  if (method === 'POST' && pathname === '/admin/domains') {
    const body = await readJsonBody(request);
    const domain = await createAdminDomain({
      domain: body.domain,
      expiresAt: body.expires_at,
      adminUid: decodedToken.uid,
      active: body.active !== false
    });
    sendJson(response, 201, { status: 'created', domain });
    return true;
  }

  // POST /admin/domains/{id}/activate
  if (method === 'POST' && /^\/admin\/domains\/[^/]+\/activate$/.test(pathname)) {
    const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const body = await readJsonBody(request);
    const domain = await activateDomain({ domainId, expiresAt: body.expires_at, adminUid: decodedToken.uid });
    sendJson(response, 200, { status: 'active', domain });
    return true;
  }

  // POST /admin/domains/{id}/deactivate
  if (method === 'POST' && /^\/admin\/domains\/[^/]+\/deactivate$/.test(pathname)) {
    const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const domain = await deactivateDomain({ domainId });
    sendJson(response, 200, { status: 'inactive', domain });
    return true;
  }

  // POST /admin/domains/{id}/delete
  if (method === 'POST' && /^\/admin\/domains\/[^/]+\/delete$/.test(pathname)) {
    const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const domain = await deleteManagedDomain({ domainId });
    sendJson(response, 200, { status: 'deleted', domain });
    return true;
  }

  // POST /admin/domains/{id}/update
  if (method === 'POST' && /^\/admin\/domains\/[^/]+\/update$/.test(pathname)) {
    const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const body = await readJsonBody(request);
    const domain = await updateManagedDomain({
      domainId,
      domain: body.domain,
      expiresAt: body.expires_at,
      active: body.active !== false,
      adminUid: decodedToken.uid
    });
    sendJson(response, 200, { status: 'updated', domain });
    return true;
  }

  // POST /admin/domains/{id}/extend
  if (method === 'POST' && /^\/admin\/domains\/[^/]+\/extend$/.test(pathname)) {
    const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
    const body = await readJsonBody(request);
    const domain = await extendDomain({ domainId, expiresAt: body.expires_at, adminUid: decodedToken.uid });
    sendJson(response, 200, { status: 'extended', domain });
    return true;
  }

  notFound(response);
  return true;
};
