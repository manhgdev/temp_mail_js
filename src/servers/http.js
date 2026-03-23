import http from 'node:http';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, createGzip } from 'node:zlib';
import {
  extractObjectKeyFromUrl,
  getObject,
} from '../services/s3.js';
import {
  deleteInboxAllByEmail,
  deleteInboxById,
  deleteMailByEmail,
  fetchInboxMails,
  fetchMailById,
  generateInboxEmail
} from '../services/inbox.service.js';
import {
  activateDomain,
  approveSubmission,
  createAdminDomain,
  createPublicDomainSubmission,
  deactivateDomain,
  deleteManagedDomain,
  extendDomain,
  getActiveDomains,
  listManagedDomains,
  listPendingSubmissions,
  rejectSubmission
} from '../services/domain.service.js';
import { updateManagedDomain } from '../services/domain.service.js';
import {
  getFirebaseClientConfig,
  isFirebaseAdminConfigured,
  isFirebaseClientConfigured,
  verifyAdminIdToken
} from '../services/firebase-admin.js';
import { inboxExists } from '../services/mail.service.js';
import { persistParsedMail } from '../services/mail-processing.service.js';
import redis from '../services/redis.js';
import { ENV } from '../config/env.js';

const API_PORT = ENV.API_PORT;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const publicDir = path.join(rootDir, 'public');
let publicIpCache = {
  value: '',
  expiresAt: 0
};

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2']
]);

const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.svg',
  '.txt',
  '.xml'
]);

const getStaticCacheControl = (filePath, extension) => {
  if (extension === '.html') {
    return 'no-cache';
  }

  if (
    filePath.includes(`${path.sep}vendor${path.sep}fontawesome${path.sep}`) ||
    extension === '.woff2' ||
    extension === '.css' ||
    extension === '.js'
  ) {
    return 'public, max-age=31536000, immutable';
  }

  if (compressibleExtensions.has(extension)) {
    return 'public, max-age=2592000, stale-while-revalidate=86400';
  }

  return 'public, max-age=86400';
};

const getAcceptedEncoding = (request, extension) => {
  if (!compressibleExtensions.has(extension)) {
    return '';
  }

  const acceptEncoding = String(request.headers['accept-encoding'] || '');
  if (acceptEncoding.includes('br')) {
    return 'br';
  }
  if (acceptEncoding.includes('gzip')) {
    return 'gzip';
  }

  return '';
};

const sendJson = (response, status, data) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(data));
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const looksLikeHtml = (value = '') => /<[a-z][\s\S]*>/i.test(String(value));

const readJsonBody = (request, maxBytes = 1024 * 32) =>
  new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });

const serveFile = async (request, response, filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  const stats = await fs.stat(filePath);
  const etag = `W/"${stats.size}-${stats.mtimeMs}"`;
  const lastModified = stats.mtime.toUTCString();

  if (
    request.headers['if-none-match'] === etag ||
    request.headers['if-modified-since'] === lastModified
  ) {
    response.writeHead(304, {
      etag,
      'last-modified': lastModified,
      'cache-control': getStaticCacheControl(filePath, extension)
    });
    response.end();
    return;
  }

  const contentEncoding = getAcceptedEncoding(request, extension);
  const headers = {
    'content-type': contentTypes.get(extension) ?? 'application/octet-stream',
    'cache-control': getStaticCacheControl(filePath, extension),
    etag,
    'last-modified': lastModified,
    vary: 'Accept-Encoding'
  };

  if (contentEncoding) {
    headers['content-encoding'] = contentEncoding;
  } else {
    headers['content-length'] = stats.size;
  }

  response.writeHead(200, headers);

  const stream = createReadStream(filePath);
  if (contentEncoding === 'br') {
    stream.pipe(createBrotliCompress()).pipe(response);
    return;
  }

  if (contentEncoding === 'gzip') {
    stream.pipe(createGzip()).pipe(response);
    return;
  }

  stream.pipe(response);
};

const notFound = (response) => sendJson(response, 404, { error: 'Not found' });
const badRequest = (response, message) => sendJson(response, 400, { error: message });
const unauthorized = (response, message = 'Authentication is required') =>
  sendJson(response, 401, { error: message });
const forbidden = (response, message = 'Admin privileges are required') =>
  sendJson(response, 403, { error: message });
const serviceUnavailable = (response, message) => sendJson(response, 503, { error: message });
const sendS3Object = async (response, key, fallbackType = 'application/octet-stream') => {
  const object = await getObject(key);
  response.writeHead(200, {
    'content-type': object.ContentType || fallbackType,
    'cache-control': 'private, max-age=60'
  });
  object.Body.pipe(response);
};

const getPublicIpAddress = async () => {
  const now = Date.now();
  if (publicIpCache.value && publicIpCache.expiresAt > now) {
    return publicIpCache.value;
  }

  const response = await fetch('https://api.ipify.org?format=json');
  if (!response.ok) {
    throw new Error('Failed to resolve public IP');
  }

  const payload = await response.json();
  const publicIp = String(payload.ip || '').trim();
  if (!publicIp) {
    throw new Error('Public IP is unavailable');
  }

  publicIpCache = {
    value: publicIp,
    expiresAt: now + 5 * 60 * 1000
  };

  return publicIp;
};

const getClientIp = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || request.socket.remoteAddress || '';
};

const parseAdminToken = (request) => {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
};

const requireAdmin = async (request, response) => {
  if (!isFirebaseAdminConfigured()) {
    serviceUnavailable(response, 'Firebase admin is not configured');
    return null;
  }

  const token = parseAdminToken(request);
  if (!token) {
    unauthorized(response);
    return null;
  }

  try {
    return await verifyAdminIdToken(token);
  } catch (error) {
    if (/Admin privileges/i.test(error.message)) {
      forbidden(response, error.message);
      return null;
    }

    unauthorized(response, 'Invalid Firebase ID token');
    return null;
  }
};

export const createHttpServer = () =>
  http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        notFound(response);
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
      const pathname = url.pathname;

      if (request.method === 'POST' && pathname === '/domains/submit') {
        if (!isFirebaseAdminConfigured()) {
          serviceUnavailable(response, 'Firebase domain management is not configured');
          return;
        }

        const body = await readJsonBody(request);
        const submission = await createPublicDomainSubmission({
          domain: body.domain,
          expiresAt: body.expires_at,
          note: body.note,
          submittedByIp: getClientIp(request)
        });

        sendJson(response, 201, {
          status: 'pending',
          submission
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/submit-domain/config') {
        try {
          const publicIp = await getPublicIpAddress();
          sendJson(response, 200, { public_ip: publicIp });
        } catch {
          sendJson(response, 200, { public_ip: '' });
        }
        return;
      }

      if (pathname.startsWith('/admin/')) {
        const decodedToken = await requireAdmin(request, response);
        if (!decodedToken) {
          return;
        }

        if (request.method === 'GET' && pathname === '/admin/submissions') {
          const status = url.searchParams.get('status') || 'pending';
          const submissions = await listPendingSubmissions(status);
          sendJson(response, 200, { submissions });
          return;
        }

        if (request.method === 'POST' && /^\/admin\/submissions\/[^/]+\/approve$/.test(pathname)) {
          const submissionId = decodeURIComponent(pathname.split('/')[3] || '').trim();
          const body = await readJsonBody(request);
          const domain = await approveSubmission({
            submissionId,
            expiresAt: body.expires_at,
            adminUid: decodedToken.uid
          });
          sendJson(response, 200, { status: 'approved', domain });
          return;
        }

        if (request.method === 'POST' && /^\/admin\/submissions\/[^/]+\/reject$/.test(pathname)) {
          const submissionId = decodeURIComponent(pathname.split('/')[3] || '').trim();
          const body = await readJsonBody(request);
          const submission = await rejectSubmission({
            submissionId,
            adminUid: decodedToken.uid,
            note: body.note
          });
          sendJson(response, 200, { status: 'rejected', submission });
          return;
        }

        if (request.method === 'GET' && pathname === '/admin/domains') {
          const domains = await listManagedDomains();
          sendJson(response, 200, { domains });
          return;
        }

        if (request.method === 'POST' && pathname === '/admin/domains') {
          const body = await readJsonBody(request);
          const domain = await createAdminDomain({
            domain: body.domain,
            expiresAt: body.expires_at,
            adminUid: decodedToken.uid,
            active: body.active !== false
          });
          sendJson(response, 201, { status: 'created', domain });
          return;
        }

        if (request.method === 'POST' && /^\/admin\/domains\/[^/]+\/activate$/.test(pathname)) {
          const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
          const body = await readJsonBody(request);
          const domain = await activateDomain({
            domainId,
            expiresAt: body.expires_at,
            adminUid: decodedToken.uid
          });
          sendJson(response, 200, { status: 'active', domain });
          return;
        }

        if (request.method === 'POST' && /^\/admin\/domains\/[^/]+\/deactivate$/.test(pathname)) {
          const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
          const domain = await deactivateDomain({
            domainId
          });
          sendJson(response, 200, { status: 'inactive', domain });
          return;
        }

        if (request.method === 'POST' && /^\/admin\/domains\/[^/]+\/delete$/.test(pathname)) {
          const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
          const domain = await deleteManagedDomain({
            domainId
          });
          sendJson(response, 200, { status: 'deleted', domain });
          return;
        }

        if (request.method === 'POST' && /^\/admin\/domains\/[^/]+\/update$/.test(pathname)) {
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
          return;
        }

        if (request.method === 'POST' && /^\/admin\/domains\/[^/]+\/extend$/.test(pathname)) {
          const domainId = decodeURIComponent(pathname.split('/')[3] || '').trim();
          const body = await readJsonBody(request);
          const domain = await extendDomain({
            domainId,
            expiresAt: body.expires_at,
            adminUid: decodedToken.uid
          });
          sendJson(response, 200, { status: 'extended', domain });
          return;
        }

        notFound(response);
        return;
      }

      if (request.method === 'POST' && pathname === '/dev/send-test-mail') {
        const body = await readJsonBody(request, 1024 * 1024 * 8);
        const to = String(body.to || '')
          .trim()
          .toLowerCase();
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
                if (!name || !content) {
                  return null;
                }

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
          return;
        }

        const exists = await inboxExists(to);
        if (!exists) {
          sendJson(response, 404, { error: 'Inbox not found' });
          return;
        }

        const mail = await persistParsedMail({
          to,
          from,
          subject,
          text,
          html,
          attachments
        });

        sendJson(response, 200, {
          status: 'sent',
          mail
        });
        return;
      }

      if (request.method === 'DELETE' && pathname.startsWith('/mail/')) {
        const rawEmail = decodeURIComponent(pathname.replace('/mail/', '')).trim().toLowerCase();
        if (!rawEmail) {
          badRequest(response, 'email is required');
          return;
        }

        const deletedCount = await deleteMailByEmail(rawEmail);
        if (deletedCount === null) {
          sendJson(response, 404, { error: 'Inbox not found' });
          return;
        }

        sendJson(response, 200, { status: 'deleted', email: rawEmail, deleted: deletedCount });
        return;
      }

      if (request.method === 'DELETE' && pathname.startsWith('/inbox/')) {
        const deleteSingleMatch = pathname.match(/^\/inbox\/(.+)\/([^/]+)$/);
        if (deleteSingleMatch && deleteSingleMatch[2] !== 'mails') {
          const rawEmail = decodeURIComponent(deleteSingleMatch[1]).trim().toLowerCase();
          const id = decodeURIComponent(deleteSingleMatch[2]).trim();
          if (!rawEmail || !id) {
            badRequest(response, 'email and mail id are required');
            return;
          }

          const deleted = await deleteInboxById(rawEmail, id);
          if (deleted === null) {
            sendJson(response, 404, { error: 'Inbox not found' });
            return;
          }

          if (!deleted) {
            sendJson(response, 404, { error: 'Mail not found' });
            return;
          }

          sendJson(response, 200, { status: 'deleted', email: rawEmail, id });
          return;
        }

        const deleteMailsMatch = pathname.match(/^\/inbox\/(.+)\/mails$/);
        if (deleteMailsMatch) {
          const rawEmail = decodeURIComponent(deleteMailsMatch[1]).trim().toLowerCase();
          if (!rawEmail) {
            badRequest(response, 'email is required');
            return;
          }

          const deletedCount = await deleteInboxAllByEmail(rawEmail);
          if (deletedCount === null) {
            sendJson(response, 404, { error: 'Inbox not found' });
            return;
          }

          sendJson(response, 200, { status: 'deleted', email: rawEmail, deleted: deletedCount });
          return;
        }

        notFound(response);
        return;
      }

      if (request.method !== 'GET') {
        notFound(response);
        return;
      }

      if (pathname === '/') {
        await serveFile(request, response, path.join(publicDir, 'index.html'));
        return;
      }

      if (pathname === '/submit-domain') {
        await serveFile(request, response, path.join(publicDir, 'submit-domain.html'));
        return;
      }

      if (pathname === '/admin') {
        await serveFile(request, response, path.join(publicDir, 'admin.html'));
        return;
      }

      if (pathname === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          service: 'temp-mail-api'
        });
        return;
      }

      if (pathname === '/ready') {
        try {
          const redisPing = await redis.ping();
          sendJson(response, 200, {
            status: redisPing === 'PONG' ? 'ready' : 'degraded',
            checks: {
              redis: redisPing
            }
          });
        } catch (error) {
          sendJson(response, 503, {
            status: 'not_ready',
            checks: {
              redis: 'ERROR'
            },
            error: error.message
          });
        }
        return;
      }

      if (pathname === '/domains') {
        let domains;
        try {
          domains = await getActiveDomains();
        } catch (error) {
          if (/Firebase domain management is not configured/i.test(error.message)) {
            serviceUnavailable(response, error.message);
            return;
          }

          throw error;
        }
        sendJson(response, 200, {
          domains,
          default_domain: domains[0] ?? null,
          source: ENV.NODE_ENV === 'production' ? 'firestore' : 'env'
        });
        return;
      }

      if (pathname === '/firebase/config') {
        sendJson(response, 200, {
          enabled: isFirebaseClientConfigured(),
          config: isFirebaseClientConfigured() ? getFirebaseClientConfig() : null
        });
        return;
      }

      if (pathname === '/generate') {
        const requestedDomain = url.searchParams.get('domain') || '';
        let email;
        try {
          email = await generateInboxEmail(requestedDomain);
        } catch (error) {
          if (/Firebase domain management is not configured/i.test(error.message)) {
            serviceUnavailable(response, error.message);
            return;
          }
          badRequest(response, error.message);
          return;
        }
        sendJson(response, 200, { email });
        return;
      }

      if (pathname.startsWith('/inbox/')) {
        const rawEmail = decodeURIComponent(pathname.replace('/inbox/', '')).trim().toLowerCase();
        if (!rawEmail) {
          badRequest(response, 'email is required');
          return;
        }

        const limitParam = url.searchParams.get('limit');
        const before = url.searchParams.get('before') || '';
        const limit = limitParam === null ? undefined : Number(limitParam);
        let inboxPage;

        try {
          inboxPage = await fetchInboxMails(rawEmail, { limit, before });
        } catch (error) {
          if (/before must be a valid inbox cursor/i.test(error.message)) {
            badRequest(response, error.message);
            return;
          }

          throw error;
        }

        if (inboxPage === null) {
          sendJson(response, 404, { error: 'Inbox not found' });
          return;
        }

        sendJson(response, 200, {
          email: rawEmail,
          mails: inboxPage.mails,
          next_cursor: inboxPage.nextCursor,
          total_count: inboxPage.totalCount,
          limit: limit ?? inboxPage.mails.length
        });
        return;
      }

      if (pathname.startsWith('/mail/')) {
        const htmlMatch = pathname.match(/^\/mail\/([^/]+)\/html$/);
        if (htmlMatch) {
          const id = decodeURIComponent(htmlMatch[1]).trim();
          if (!id) {
            badRequest(response, 'mail id is required');
            return;
          }

          const mail = await fetchMailById(id);
          if (!mail) {
            sendJson(response, 404, { error: 'Mail not found' });
            return;
          }

          const htmlKey = mail.html_key || extractObjectKeyFromUrl(mail.html_url);
          if (!htmlKey) {
            sendJson(response, 404, { error: 'Mail HTML not found' });
            return;
          }

          await sendS3Object(response, htmlKey, 'text/html; charset=utf-8');
          return;
        }

        const attachmentMatch = pathname.match(/^\/mail\/([^/]+)\/attachments\/(\d+)$/);
        if (attachmentMatch) {
          const id = decodeURIComponent(attachmentMatch[1]).trim();
          const attachmentIndex = Number(attachmentMatch[2]);
          if (!id || Number.isNaN(attachmentIndex)) {
            badRequest(response, 'attachment request is invalid');
            return;
          }

          const mail = await fetchMailById(id);
          if (!mail) {
            sendJson(response, 404, { error: 'Mail not found' });
            return;
          }

          const attachment = mail.attachments?.[attachmentIndex];
          const attachmentKey = attachment?.key || extractObjectKeyFromUrl(attachment?.url);
          if (!attachment || !attachmentKey) {
            sendJson(response, 404, { error: 'Attachment not found' });
            return;
          }

          await sendS3Object(response, attachmentKey, attachment.contentType);
          return;
        }

        const id = decodeURIComponent(pathname.replace('/mail/', '')).trim();
        if (!id) {
          badRequest(response, 'mail id is required');
          return;
        }

        const mail = await fetchMailById(id);
        if (!mail) {
          sendJson(response, 404, { error: 'Mail not found' });
          return;
        }

        sendJson(response, 200, mail);
        return;
      }

      const filePath = path.join(publicDir, pathname.replace(/^\/+/, ''));
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          await serveFile(request, response, filePath);
          return;
        }
      } catch {
        // fall through to 404
      }

      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Internal server error' });
    }
  });

export const startHttpServer = () =>
  new Promise((resolve, reject) => {
    const server = createHttpServer();
    server.once('error', reject);
    server.listen(API_PORT, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`[api] listening on port http://127.0.0.1:${API_PORT}`);
      resolve(server);
    });
  });
