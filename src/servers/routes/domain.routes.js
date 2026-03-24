import {
  createPublicDomainSubmission,
  getActiveDomains
} from '../../services/domain.service.js';
import {
  isFirebaseAdminConfigured,
  isFirebaseClientConfigured,
  getFirebaseClientConfig
} from '../../services/firebase-admin.js';
import { ENV } from '../../config/env.js';
import {
  sendJson,
  readJsonBody,
  serviceUnavailable,
  getClientIp
} from '../helpers.js';

let publicIpCache = { value: '', expiresAt: 0 };

const getPublicIpAddress = async () => {
  const now = Date.now();
  if (publicIpCache.value && publicIpCache.expiresAt > now) {
    return publicIpCache.value;
  }

  const res = await fetch('https://api.ipify.org?format=json');
  if (!res.ok) throw new Error('Failed to resolve public IP');

  const payload = await res.json();
  const publicIp = String(payload.ip || '').trim();
  if (!publicIp) throw new Error('Public IP is unavailable');

  publicIpCache = { value: publicIp, expiresAt: now + 5 * 60 * 1000 };
  return publicIp;
};

/**
 * Handles:
 *   GET  /domains
 *   GET  /firebase/config
 *   POST /domains/submit
 *   GET  /submit-domain/config
 */
export const handleDomainRoutes = async ({ url, method, pathname, request, response }) => {
  // GET /domains
  if (method === 'GET' && pathname === '/domains') {
    let domains;
    try {
      domains = await getActiveDomains();
    } catch (error) {
      if (/Firebase domain management is not configured/i.test(error.message)) {
        serviceUnavailable(response, error.message);
        return true;
      }
      throw error;
    }
    sendJson(response, 200, {
      domains,
      default_domain: domains[0] ?? null,
      source: ENV.NODE_ENV === 'production' ? 'firestore' : 'env'
    });
    return true;
  }

  // GET /firebase/config
  if (method === 'GET' && pathname === '/firebase/config') {
    sendJson(response, 200, {
      enabled: isFirebaseClientConfigured(),
      config: isFirebaseClientConfigured() ? getFirebaseClientConfig() : null
    });
    return true;
  }

  // POST /domains/submit
  if (method === 'POST' && pathname === '/domains/submit') {
    if (!isFirebaseAdminConfigured()) {
      serviceUnavailable(response, 'Firebase domain management is not configured');
      return true;
    }

    const body = await readJsonBody(request);
    const submission = await createPublicDomainSubmission({
      domain: body.domain,
      expiresAt: body.expires_at,
      note: body.note,
      submittedByIp: getClientIp(request)
    });
    sendJson(response, 201, { status: 'pending', submission });
    return true;
  }

  // GET /submit-domain/config
  if (method === 'GET' && pathname === '/submit-domain/config') {
    try {
      const publicIp = await getPublicIpAddress();
      sendJson(response, 200, { public_ip: publicIp });
    } catch {
      sendJson(response, 200, { public_ip: '' });
    }
    return true;
  }

  return false;
};
