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
} from '../../services/domain.service.js';
import {
  sendJson,
  notFound,
  readJsonBody,
  requireAdmin
} from '../helpers.js';

/**
 * Handles all /admin/* routes.
 * All routes require a valid Firebase Admin ID token.
 */
export const handleAdminRoutes = async ({ url, method, pathname, request, response }) => {
  if (!pathname.startsWith('/admin/')) return false;

  const decodedToken = await requireAdmin(request, response);
  if (!decodedToken) return true;

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
