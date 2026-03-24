import { getActiveDomains } from '../../services/domain.service.js';
import {
  deleteInboxAllByEmail,
  deleteInboxById,
  deleteMailByEmail,
  fetchInboxMails,
  fetchMailById,
  generateInboxEmail,
  checkInboxOwnership
} from '../../services/inbox.service.js';
import { inboxExists } from '../../services/mail.service.js';
import { extractObjectKeyFromUrl, getObject } from '../../services/s3.js';
import { ENV } from '../../config/env.js';
import {
  sendJson,
  notFound,
  badRequest,
  serviceUnavailable,
  forbidden,
  extractOptionalUser,
  getClientIp
} from '../helpers.js';
import { checkRateLimit } from '../../services/rate-limit.service.js';

const checkOwnership = async (email, request, response) => {
  const user = await extractOptionalUser(request);
  const uid = user ? user.uid : null;
  const isOwner = await checkInboxOwnership(email, uid);
  if (!isOwner) {
    forbidden(response, `Access denied. (UID=${uid || 'null'}, owner=${isOwner === 'debug' ? '?' : 'miss'})`);
    return false;
  }
  return true;
};

const sendS3Object = async (response, key, fallbackType = 'application/octet-stream') => {
  const object = await getObject(key);
  response.writeHead(200, {
    'content-type': object.ContentType || fallbackType,
    'cache-control': 'private, max-age=60'
  });
  object.Body.pipe(response);
};

/**
 * Handles:
 *   GET  /generate
 *   GET  /inbox/{email}
 *   GET  /mail/{id}
 *   GET  /mail/{id}/html
 *   GET  /mail/{id}/attachments/{index}
 *   DELETE /inbox/{email}/{id}
 *   DELETE /inbox/{email}/mails
 *   DELETE /mail/{email}
 */
export const handleInboxRoutes = async ({ url, method, pathname, request, response }) => {
  // GET /generate
  if (method === 'GET' && pathname === '/generate') {
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(
      `rl:generate:${ip}`,
      ENV.GENERATE_RATE_LIMIT_MAX,
      ENV.GENERATE_RATE_LIMIT_WINDOW_SECONDS
    );
    if (!allowed) {
      sendJson(response, 429, { error: 'Too many requests. Please try again later.' });
      return true;
    }

    const requestedDomain = url.searchParams.get('domain') || '';
    let email;
    try {
      email = await generateInboxEmail(requestedDomain);
    } catch (error) {
      if (/Firebase domain management is not configured/i.test(error.message)) {
        serviceUnavailable(response, error.message);
        return true;
      }
      badRequest(response, error.message);
      return true;
    }
    sendJson(response, 200, { email });
    return true;
  }

  // GET /inbox/{email}
  if (method === 'GET' && pathname.startsWith('/inbox/')) {
    const rawEmail = decodeURIComponent(pathname.replace('/inbox/', '')).trim().toLowerCase();
    if (!rawEmail) {
      badRequest(response, 'email is required');
      return true;
    }

    if (!(await checkOwnership(rawEmail, request, response))) return true;

    const limitParam = url.searchParams.get('limit');
    const before = url.searchParams.get('before') || '';
    const limit = limitParam === null ? undefined : Number(limitParam);
    let inboxPage;

    try {
      inboxPage = await fetchInboxMails(rawEmail, { limit, before });
    } catch (error) {
      if (/before must be a valid inbox cursor/i.test(error.message)) {
        badRequest(response, error.message);
        return true;
      }
      throw error;
    }

    if (inboxPage === null) {
      sendJson(response, 404, { error: 'Inbox not found' });
      return true;
    }

    sendJson(response, 200, {
      email: rawEmail,
      mails: inboxPage.mails,
      next_cursor: inboxPage.nextCursor,
      total_count: inboxPage.totalCount,
      limit: limit ?? inboxPage.mails.length
    });
    return true;
  }

  // GET /mail/{id}/html  |  GET /mail/{id}/attachments/{index}  |  GET /mail/{id}
  if (method === 'GET' && pathname.startsWith('/mail/')) {
    const htmlMatch = pathname.match(/^\/mail\/([^/]+)\/html$/);
    if (htmlMatch) {
      const id = decodeURIComponent(htmlMatch[1]).trim();
      if (!id) { badRequest(response, 'mail id is required'); return true; }

      const mail = await fetchMailById(id);
      if (!mail) { sendJson(response, 404, { error: 'Mail not found' }); return true; }

      if (!(await checkOwnership(mail.to, request, response))) return true;

      const htmlKey = mail.html_key || extractObjectKeyFromUrl(mail.html_url);
      if (!htmlKey) { sendJson(response, 404, { error: 'Mail HTML not found' }); return true; }

      await sendS3Object(response, htmlKey, 'text/html; charset=utf-8');
      return true;
    }

    const attachmentMatch = pathname.match(/^\/mail\/([^/]+)\/attachments\/(\d+)$/);
    if (attachmentMatch) {
      const id = decodeURIComponent(attachmentMatch[1]).trim();
      const attachmentIndex = Number(attachmentMatch[2]);
      if (!id || Number.isNaN(attachmentIndex)) {
        badRequest(response, 'attachment request is invalid');
        return true;
      }

      const mail = await fetchMailById(id);
      if (!mail) { sendJson(response, 404, { error: 'Mail not found' }); return true; }

      if (!(await checkOwnership(mail.to, request, response))) return true;

      const attachment = mail.attachments?.[attachmentIndex];
      const attachmentKey = attachment?.key || extractObjectKeyFromUrl(attachment?.url);
      if (!attachment || !attachmentKey) {
        sendJson(response, 404, { error: 'Attachment not found' });
        return true;
      }

      await sendS3Object(response, attachmentKey, attachment.contentType);
      return true;
    }

    const id = decodeURIComponent(pathname.replace('/mail/', '')).trim();
    if (!id) { badRequest(response, 'mail id is required'); return true; }

    const mail = await fetchMailById(id);
    if (!mail) { sendJson(response, 404, { error: 'Mail not found' }); return true; }

    if (!(await checkOwnership(mail.to, request, response))) return true;

    sendJson(response, 200, mail);
    return true;
  }

  // DELETE /mail/{email}
  if (method === 'DELETE' && pathname.startsWith('/mail/')) {
    const rawEmail = decodeURIComponent(pathname.replace('/mail/', '')).trim().toLowerCase();
    if (!rawEmail) { badRequest(response, 'email is required'); return true; }

    if (!(await checkOwnership(rawEmail, request, response))) return true;

    const deletedCount = await deleteMailByEmail(rawEmail);
    if (deletedCount === null) {
      sendJson(response, 404, { error: 'Inbox not found' });
      return true;
    }

    sendJson(response, 200, { status: 'deleted', email: rawEmail, deleted: deletedCount });
    return true;
  }

  // DELETE /inbox/{email}/{id}  |  DELETE /inbox/{email}/mails
  if (method === 'DELETE' && pathname.startsWith('/inbox/')) {
    const deleteSingleMatch = pathname.match(/^\/inbox\/(.+)\/([^/]+)$/);
    if (deleteSingleMatch && deleteSingleMatch[2] !== 'mails') {
      const rawEmail = decodeURIComponent(deleteSingleMatch[1]).trim().toLowerCase();
      const id = decodeURIComponent(deleteSingleMatch[2]).trim();
      if (!rawEmail || !id) { badRequest(response, 'email and mail id are required'); return true; }

      if (!(await checkOwnership(rawEmail, request, response))) return true;

      const deleted = await deleteInboxById(rawEmail, id);
      if (deleted === null) { sendJson(response, 404, { error: 'Inbox not found' }); return true; }
      if (!deleted) { sendJson(response, 404, { error: 'Mail not found' }); return true; }

      sendJson(response, 200, { status: 'deleted', email: rawEmail, id });
      return true;
    }

    const deleteMailsMatch = pathname.match(/^\/inbox\/(.+)\/mails$/);
    if (deleteMailsMatch) {
      const rawEmail = decodeURIComponent(deleteMailsMatch[1]).trim().toLowerCase();
      if (!rawEmail) { badRequest(response, 'email is required'); return true; }

      if (!(await checkOwnership(rawEmail, request, response))) return true;

      const deletedCount = await deleteInboxAllByEmail(rawEmail);
      if (deletedCount === null) { sendJson(response, 404, { error: 'Inbox not found' }); return true; }

      sendJson(response, 200, { status: 'deleted', email: rawEmail, deleted: deletedCount });
      return true;
    }
  }

  return false;
};
