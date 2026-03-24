import { ENV } from '../../config/env.js';
import { inboxExists } from '../../services/mail.service.js';
import { persistParsedMail } from '../../services/mail-processing.service.js';
import { getActiveDomains } from '../../services/domain.service.js';
import {
  sendJson,
  badRequest,
  readJsonBody,
  escapeHtml,
  looksLikeHtml
} from '../helpers.js';

/**
 * Handles: POST /dev/send-test-mail
 * Only active in non-production environments.
 */
export const handleDevRoutes = async ({ method, pathname, request, response }) => {
  if (method !== 'POST' || pathname !== '/dev/send-test-mail') return false;

  // Guard: only allow in development
  if (ENV.NODE_ENV === 'production') return false;

  const body = await readJsonBody(request, 1024 * 1024 * 8);
  const to = String(body.to || '').trim().toLowerCase();
  const activeDomains = await getActiveDomains().catch(() => ENV.DOMAINS);
  const from = String(body.from || `dev-sender@${activeDomains[0] ?? 'tempmail.local'}`)
    .trim()
    .toLowerCase();
  const subject = String(body.subject || 'UI test mail').trim();
  const text = String(body.body || 'This is a dev test mail from the UI.').replace(/\r\n/g, '\n');
  const html = looksLikeHtml(text)
    ? text
    : `<div style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</div>`;
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .map((attachment) => {
          const name = String(attachment?.filename || '').trim();
          const contentType = String(attachment?.contentType || 'application/octet-stream').trim();
          const content = String(attachment?.content || '');
          if (!name || !content) return null;
          return {
            filename: name,
            contentType,
            content: Buffer.from(content, 'base64'),
            size: Number(attachment?.size || 0)
          };
        })
        .filter(Boolean)
    : [];

  if (!to) {
    badRequest(response, 'recipient email is required');
    return true;
  }

  const exists = await inboxExists(to);
  if (!exists) {
    sendJson(response, 404, { error: 'Inbox not found' });
    return true;
  }

  const mail = await persistParsedMail({ to, from, subject, text, html, attachments });
  sendJson(response, 200, { status: 'sent', mail });
  return true;
};
