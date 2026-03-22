import { getFirebaseFirestore } from '../services/firebase-admin.js';

const DOMAINS_COLLECTION = 'domains';
const SUBMISSIONS_COLLECTION = 'domain_submissions';

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const serializeDomain = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    domain: data.domain,
    normalized_domain: data.normalized_domain,
    active: Boolean(data.active),
    expires_at: toIsoString(data.expires_at),
    created_at: toIsoString(data.created_at),
    updated_at: toIsoString(data.updated_at),
    approved_at: toIsoString(data.approved_at),
    approved_by: data.approved_by ?? null,
    source: data.source ?? 'admin',
    submission_id: data.submission_id ?? null
  };
};

const serializeSubmission = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    domain: data.domain,
    normalized_domain: data.normalized_domain,
    status: data.status ?? 'pending',
    created_at: toIsoString(data.created_at),
    reviewed_at: toIsoString(data.reviewed_at),
    reviewed_by: data.reviewed_by ?? null,
    requested_expires_at: toIsoString(data.requested_expires_at),
    note: data.note ?? '',
    submitted_by_ip: data.submitted_by_ip ?? ''
  };
};

export const getAllDomains = async () => {
  const snapshot = await getFirebaseFirestore().collection(DOMAINS_COLLECTION).get();
  return snapshot.docs.map(serializeDomain);
};

export const getDomainById = async (id) => {
  const snapshot = await getFirebaseFirestore().collection(DOMAINS_COLLECTION).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return serializeDomain(snapshot);
};

export const getDomainByNormalizedDomain = async (normalizedDomain) =>
  getDomainById(normalizedDomain);

export const upsertDomain = async (id, data) => {
  const db = getFirebaseFirestore();
  const reference = db.collection(DOMAINS_COLLECTION).doc(id);
  const existing = await reference.get();
  const now = new Date();

  await reference.set(
    {
      ...data,
      created_at: existing.exists ? existing.data().created_at ?? now : data.created_at ?? now,
      updated_at: now
    },
    { merge: true }
  );

  return getDomainById(id);
};

export const deleteDomainById = async (id) => {
  await getFirebaseFirestore().collection(DOMAINS_COLLECTION).doc(id).delete();
};

export const getSubmissions = async (status) => {
  const snapshot = await getFirebaseFirestore().collection(SUBMISSIONS_COLLECTION).get();
  return snapshot.docs
    .map(serializeSubmission)
    .filter((submission) => !status || submission.status === status);
};

export const getSubmissionById = async (id) => {
  const snapshot = await getFirebaseFirestore().collection(SUBMISSIONS_COLLECTION).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return serializeSubmission(snapshot);
};

export const getPendingSubmissionByNormalizedDomain = async (normalizedDomain) => {
  const submissions = await getSubmissions('pending');
  return submissions.find((submission) => submission.normalized_domain === normalizedDomain) ?? null;
};

export const createSubmission = async (data) => {
  const now = new Date();
  const reference = await getFirebaseFirestore().collection(SUBMISSIONS_COLLECTION).add({
    ...data,
    status: 'pending',
    created_at: now,
    reviewed_at: null,
    reviewed_by: null
  });

  return getSubmissionById(reference.id);
};

export const updateSubmission = async (id, data) => {
  const reference = getFirebaseFirestore().collection(SUBMISSIONS_COLLECTION).doc(id);
  await reference.set(data, { merge: true });
  return getSubmissionById(id);
};

export const listExpiredActiveDomains = async (now = new Date()) => {
  const domains = await getAllDomains();
  return domains.filter(
    (domain) => domain.active && domain.expires_at && new Date(domain.expires_at).getTime() <= now.getTime()
  );
};
