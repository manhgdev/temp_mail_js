import { ENV } from '../config/env.js';
import {
  createSubmission,
  deleteDomainById,
  getAllDomains,
  getDomainById,
  getDomainByNormalizedDomain,
  getPendingSubmissionByNormalizedDomain,
  getSubmissionById,
  getSubmissions,
  listExpiredActiveDomains,
  updateSubmission,
  upsertDomain
} from '../repositories/domain.repo.js';
import { isFirebaseAdminConfigured } from './firebase-admin.js';

const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const sortDomains = (domains) => [...new Set(domains)].sort((left, right) => left.localeCompare(right));

export const normalizeDomain = (value) => String(value || '').trim().toLowerCase();

export const isValidDomain = (value) => DOMAIN_REGEX.test(normalizeDomain(value));

const ensureFirebaseBackedDomains = () => {
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase domain management is not configured');
  }
};

export const isProductionDomainSource = () => ENV.NODE_ENV === 'production';

export const getActiveDomains = async () => {
  if (!isProductionDomainSource()) {
    return [...ENV.DOMAINS];
  }

  ensureFirebaseBackedDomains();
  const now = Date.now();
  const domains = await getAllDomains();
  return sortDomains(
    domains
      .filter((domain) => domain.active)
      .filter((domain) => !domain.expires_at || new Date(domain.expires_at).getTime() > now)
      .map((domain) => domain.domain)
  );
};

export const ensureDomainCanGenerate = async (domain) => {
  const normalized = normalizeDomain(domain);
  const activeDomains = await getActiveDomains();
  return activeDomains.includes(normalized);
};

export const createPublicDomainSubmission = async ({
  domain,
  expiresAt = null,
  note = '',
  submittedByIp = ''
}) => {
  ensureFirebaseBackedDomains();

  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    throw new Error('Domain is invalid');
  }

  const existingDomain = await getDomainByNormalizedDomain(normalizedDomain);
  if (existingDomain) {
    throw new Error('Domain is already managed');
  }

  const existingPending = await getPendingSubmissionByNormalizedDomain(normalizedDomain);
  if (existingPending) {
    throw new Error('Domain is already pending review');
  }

  return createSubmission({
    domain: normalizedDomain,
    normalized_domain: normalizedDomain,
    requested_expires_at: ensureIsoDate(expiresAt),
    note: String(note || '').trim(),
    submitted_by_ip: String(submittedByIp || '').trim()
  });
};

export const createAdminDomain = async ({ domain, expiresAt, adminUid, active = true }) => {
  ensureFirebaseBackedDomains();

  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    throw new Error('Domain is invalid');
  }

  const existingDomain = await getDomainByNormalizedDomain(normalizedDomain);
  if (existingDomain) {
    throw new Error('Domain is already managed');
  }

  const expiresAtIso = ensureIsoDate(expiresAt);
  return upsertDomain(normalizedDomain, {
    domain: normalizedDomain,
    normalized_domain: normalizedDomain,
    active: Boolean(active),
    expires_at: expiresAtIso,
    approved_at: new Date().toISOString(),
    approved_by: adminUid,
    source: 'admin',
    submission_id: null
  });
};

export const listPendingSubmissions = async (status = 'pending') => {
  ensureFirebaseBackedDomains();
  const submissions = await getSubmissions(status);
  return submissions.sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
};

export const listManagedDomains = async () => {
  ensureFirebaseBackedDomains();
  const domains = await getAllDomains();
  return domains.sort((left, right) => left.domain.localeCompare(right.domain));
};

const ensureIsoDate = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('expires_at must be a valid date');
  }

  return date.toISOString();
};

export const approveSubmission = async ({ submissionId, expiresAt, adminUid }) => {
  ensureFirebaseBackedDomains();

  const submission = await getSubmissionById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }

  if (submission.status !== 'pending') {
    throw new Error('Submission has already been reviewed');
  }

  const expiresAtIso = ensureIsoDate(expiresAt);
  const normalizedDomain = submission.normalized_domain;

  const domain = await upsertDomain(normalizedDomain, {
    domain: normalizedDomain,
    normalized_domain: normalizedDomain,
    active: true,
    expires_at: expiresAtIso,
    approved_at: new Date().toISOString(),
    approved_by: adminUid,
    source: 'public_submission',
    submission_id: submission.id
  });

  await updateSubmission(submission.id, {
    status: 'approved',
    reviewed_at: new Date(),
    reviewed_by: adminUid
  });

  return domain;
};

export const rejectSubmission = async ({ submissionId, adminUid, note = '' }) => {
  ensureFirebaseBackedDomains();

  const submission = await getSubmissionById(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }

  if (submission.status !== 'pending') {
    throw new Error('Submission has already been reviewed');
  }

  return updateSubmission(submission.id, {
    status: 'rejected',
    reviewed_at: new Date(),
    reviewed_by: adminUid,
    note: String(note || '').trim()
  });
};

export const activateDomain = async ({ domainId, expiresAt, adminUid }) => {
  ensureFirebaseBackedDomains();

  const domain = await getDomainById(domainId);
  if (!domain) {
    throw new Error('Domain not found');
  }

  const requestedExpiry =
    expiresAt === null || expiresAt === undefined || String(expiresAt).trim() === ''
      ? domain.expires_at ?? null
      : expiresAt;
  const expiresAtIso = ensureIsoDate(requestedExpiry);
  return upsertDomain(domain.id, {
    active: true,
    expires_at: expiresAtIso,
    approved_by: adminUid
  });
};

export const deactivateDomain = async ({ domainId }) => {
  ensureFirebaseBackedDomains();

  const domain = await getDomainById(domainId);
  if (!domain) {
    throw new Error('Domain not found');
  }

  return upsertDomain(domain.id, {
    active: false
  });
};

export const deleteManagedDomain = async ({ domainId }) => {
  ensureFirebaseBackedDomains();

  const domain = await getDomainById(domainId);
  if (!domain) {
    throw new Error('Domain not found');
  }

  await deleteDomainById(domainId);
  return domain;
};

export const updateManagedDomain = async ({ domainId, domain, expiresAt, active, adminUid }) => {
  ensureFirebaseBackedDomains();

  const existingDomain = await getDomainById(domainId);
  if (!existingDomain) {
    throw new Error('Domain not found');
  }

  const normalizedDomain = normalizeDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    throw new Error('Domain is invalid');
  }

  if (normalizedDomain !== domainId) {
    const conflictingDomain = await getDomainByNormalizedDomain(normalizedDomain);
    if (conflictingDomain) {
      throw new Error('Domain is already managed');
    }
  }

  const expiresAtIso = ensureIsoDate(expiresAt);
  const nextDomain = await upsertDomain(normalizedDomain, {
    domain: normalizedDomain,
    normalized_domain: normalizedDomain,
    active: Boolean(active),
    expires_at: expiresAtIso,
    approved_at: existingDomain.approved_at,
    approved_by: adminUid ?? existingDomain.approved_by,
    source: existingDomain.source,
    submission_id: existingDomain.submission_id,
    created_at: existingDomain.created_at ? new Date(existingDomain.created_at) : undefined
  });

  if (normalizedDomain !== domainId) {
    await deleteDomainById(domainId);
  }

  return nextDomain;
};

export const extendDomain = async ({ domainId, expiresAt, adminUid }) => {
  ensureFirebaseBackedDomains();

  const domain = await getDomainById(domainId);
  if (!domain) {
    throw new Error('Domain not found');
  }

  const expiresAtIso = ensureIsoDate(expiresAt);
  return upsertDomain(domain.id, {
    expires_at: expiresAtIso,
    approved_by: adminUid
  });
};

export const deactivateExpiredDomains = async () => {
  ensureFirebaseBackedDomains();

  const expiredDomains = await listExpiredActiveDomains();
  if (expiredDomains.length === 0) {
    return [];
  }

  const updates = await Promise.all(
    expiredDomains.map((domain) =>
      upsertDomain(domain.id, {
        active: false
      })
    )
  );

  return updates;
};
