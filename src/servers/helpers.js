import { verifyAdminIdToken, verifyUserIdToken } from '../services/firebase-admin.js';
import { isFirebaseAdminConfigured } from '../services/firebase-admin.js';

export const sendJson = (response, status, data) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(data));
};

export const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const looksLikeHtml = (value = '') => /<[a-z][\s\S]*>/i.test(String(value));

export const readJsonBody = (request, maxBytes = 1024 * 32) =>
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

export const notFound = (response) => sendJson(response, 404, { error: 'Not found' });
export const badRequest = (response, message) => sendJson(response, 400, { error: message });
export const unauthorized = (response, message = 'Authentication is required') =>
  sendJson(response, 401, { error: message });
export const forbidden = (response, message = 'Admin privileges are required') =>
  sendJson(response, 403, { error: message });
export const serviceUnavailable = (response, message) =>
  sendJson(response, 503, { error: message });

export const getClientIp = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || request.socket.remoteAddress || '';
};

export const parseAuthToken = (request) => {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1];

  // Fallback to query string parameter for iframes / download links
  try {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    return url.searchParams.get('token') || '';
  } catch {
    return '';
  }
};

export const requireAdmin = async (request, response) => {
  if (!isFirebaseAdminConfigured()) {
    serviceUnavailable(response, 'Firebase admin is not configured');
    return null;
  }

  const token = parseAuthToken(request);
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

export const requireUser = async (request, response) => {
  if (!isFirebaseAdminConfigured()) {
    serviceUnavailable(response, 'Firebase admin is not configured');
    return null;
  }

  const token = parseAuthToken(request);
  if (!token) {
    unauthorized(response);
    return null;
  }

  try {
    return await verifyUserIdToken(token);
  } catch {
    unauthorized(response, 'Invalid Firebase ID token');
    return null;
  }
};

export const extractOptionalUser = async (request) => {
  if (!isFirebaseAdminConfigured()) return null;
  const token = parseAuthToken(request);
  if (!token) return null;
  
  try {
    return await verifyUserIdToken(token);
  } catch (error) {
    console.error('[auth] extractOptionalUser error:', error.message);
    return null; // Don't throw or send error, just return null
  }
};
