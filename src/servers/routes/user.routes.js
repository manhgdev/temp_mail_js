import {
  getOrCreateUserProfile,
  getUserInboxList,
  getUserInboxListPaginated,
  countUserInboxes,
  resetUserInboxUnreadCount,
  createUserOwnedInbox,
  removeUserInbox,
  removeAllUserInboxes
} from '../../services/user.service.js';
import {
  sendJson,
  badRequest,
  readJsonBody,
  requireUser,
  getClientIp
} from '../helpers.js';
import { checkRateLimit } from '../../services/rate-limit.service.js';

/**
 * Handles all /user/* routes.
 * All routes require a valid Firebase ID token (any authenticated user).
 *
 *   GET    /user/me              → get or create user profile
 *   GET    /user/inboxes         → list user's temp emails
 *   POST   /user/inboxes         → create a new temp email for user
 *   DELETE /user/inboxes/{email} → delete a specific temp email
 *   DELETE /user/inboxes         → delete all temp emails
 */
export const handleUserRoutes = async ({ url, method, pathname, request, response }) => {
  if (!pathname.startsWith('/user')) return false;

  const decodedToken = await requireUser(request, response);
  if (!decodedToken) return true;

  const uid = decodedToken.uid;

  // GET /user/me
  if (method === 'GET' && pathname === '/user/me') {
    const profile = await getOrCreateUserProfile(decodedToken);
    sendJson(response, 200, { user: profile });
    return true;
  }

  // GET /user/inboxes
  if (method === 'GET' && pathname === '/user/inboxes') {
    const limitParam = url.searchParams.get('limit');
    const before = url.searchParams.get('before') || '';
    const limit = limitParam === null ? 20 : Number(limitParam);

    const result = await getUserInboxListPaginated(uid, { limit, before });
    const total = await countUserInboxes(uid);
    sendJson(response, 200, { inboxes: result.inboxes, next_cursor: result.nextCursor, total });
    return true;
  }

  // POST /user/inboxes
  if (method === 'POST' && pathname === '/user/inboxes') {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`rl:user_inbox:${uid}:${ip}`, 5, 60); // 5 reqs / minute
    if (!allowed) {
      sendJson(response, 429, { error: 'Too many requests. Please try again later.' });
      return true;
    }

    const body = await readJsonBody(request);
    const domain = String(body.domain || '').trim() || undefined;
    let inbox;
    try {
      inbox = await createUserOwnedInbox(uid, domain);
    } catch (error) {
      if (
        /No active domains/i.test(error.message) ||
        /Firebase domain management is not configured/i.test(error.message)
      ) {
        sendJson(response, 503, { error: error.message });
        return true;
      }
      badRequest(response, error.message);
      return true;
    }
    sendJson(response, 201, { status: 'created', inbox });
    return true;
  }

  // POST /user/inboxes/{email}/read
  if (method === 'POST' && pathname.startsWith('/user/inboxes/') && pathname.endsWith('/read')) {
    const rawEmail = decodeURIComponent(pathname.replace('/user/inboxes/', '').replace('/read', '')).trim().toLowerCase();
    await resetUserInboxUnreadCount(uid, rawEmail);
    sendJson(response, 200, { success: true });
    return true;
  }

  // DELETE /user/inboxes/{email}
  const deleteOneMatch = pathname.match(/^\/user\/inboxes\/(.+)$/);
  if (method === 'DELETE' && deleteOneMatch) {
    const email = decodeURIComponent(deleteOneMatch[1]).trim().toLowerCase();
    if (!email) { badRequest(response, 'email is required'); return true; }

    const removed = await removeUserInbox(uid, email);
    if (!removed) {
      sendJson(response, 404, { error: 'Inbox not found in your account' });
      return true;
    }
    sendJson(response, 200, { status: 'deleted', email });
    return true;
  }

  // DELETE /user/inboxes
  if (method === 'DELETE' && pathname === '/user/inboxes') {
    const count = await removeAllUserInboxes(uid);
    sendJson(response, 200, { status: 'deleted', count });
    return true;
  }

  return false;
};
