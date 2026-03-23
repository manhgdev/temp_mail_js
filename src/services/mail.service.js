import { createMail } from '../models/mail.js';
import {
  createInboxMeta,
  inboxMetaExists,
  touchInboxMeta,
  clearInboxMeta,
  deleteInboxMeta
} from '../repositories/inbox-meta.repo.js';
import {
  countInboxMailMeta,
  deleteMailMetaBatch,
  getInboxMailMeta,
  getMailMetaById,
  listAllInboxMailMeta,
  listInboxMailMeta,
  listInboxMailMetaPage,
  listInboxOverflowMailMeta,
  saveMailMeta
} from '../repositories/mail-meta.repo.js';
import {
  getCachedInboxExists,
  getCachedInboxList,
  getCachedMailDetail,
  invalidateInboxCache,
  invalidateInboxListCache,
  invalidateMailDetailCache,
  setCachedInboxExists,
  setCachedInboxList,
  setCachedMailDetail
} from '../repositories/mail-cache.repo.js';
import { deleteMailContent, getMailTextContent, saveMailContent } from '../repositories/mail-content.repo.js';
import { ENV } from '../config/env.js';
import { isFirebaseAdminConfigured } from './firebase-admin.js';
import { generateId } from '../utils/id.js';
import { getPreview } from '../utils/preview.js';

const MAIL_STORE_CONFIG_ERROR =
  'Firebase Admin is required for inbox/mail metadata storage';
const DEFAULT_INBOX_PAGE_SIZE = ENV.DEFAULT_INBOX_PAGE_SIZE;
const MAX_INBOX = ENV.MAX_INBOX;

const ensureMailStoreConfigured = () => {
  if (!isFirebaseAdminConfigured()) {
    throw new Error(MAIL_STORE_CONFIG_ERROR);
  }
};

const normalizeEmailAddress = (addressLike) => {
  if (!addressLike) {
    return null;
  }

  if (typeof addressLike === 'string') {
    return addressLike.trim().toLowerCase();
  }

  if (addressLike.address) {
    return String(addressLike.address).trim().toLowerCase();
  }

  if (Array.isArray(addressLike.value) && addressLike.value[0]?.address) {
    return String(addressLike.value[0].address).trim().toLowerCase();
  }

  return null;
};

const encodeMailCursor = (mail) =>
  mail ? JSON.stringify({ created_at: mail.created_at, id: mail.id }) : null;

export const createInbox = async (email) => {
  ensureMailStoreConfigured();

  const normalized = email.toLowerCase();
  const created = await createInboxMeta(normalized);

  if (created) {
    await Promise.all([
      setCachedInboxExists(normalized, true),
      setCachedInboxList(normalized, [])
    ]);
    return true;
  }

  await setCachedInboxExists(normalized, true);
  return false;
};

export const inboxExists = async (email) => {
  ensureMailStoreConfigured();

  const normalized = email.toLowerCase();
  const cached = await getCachedInboxExists(normalized);
  if (cached !== null) {
    return cached;
  }

  const exists = await inboxMetaExists(normalized);
  await setCachedInboxExists(normalized, exists);
  return exists;
};

export const createIncomingMail = async ({ to, from, subject, text, html, attachments = [] }) => {
  ensureMailStoreConfigured();

  const id = generateId();
  const normalizedTo = normalizeEmailAddress(to);
  const normalizedFrom = normalizeEmailAddress(from);
  if (!normalizedTo) {
    throw new Error('Recipient email is required');
  }

  const exists = await inboxExists(normalizedTo);
  if (!exists) {
    throw new Error('Inbox not found');
  }

  const bodyText = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  const preview = getPreview(text || html || '');
  const content = await saveMailContent({
    id,
    text: bodyText || preview,
    html,
    attachments
  });

  const mail = createMail({
    id,
    to: normalizedTo,
    from: normalizedFrom,
    subject: subject || '(no subject)',
    preview,
    ...content,
    created_at: new Date().toISOString()
  });

  try {
    await saveMailMeta(mail);
  } catch (error) {
    await deleteMailContent(mail).catch((cleanupError) => {
      console.error(`[mail-service] failed to rollback S3 content for ${mail.id}`, cleanupError);
    });
    throw error;
  }

  await touchInboxMeta(normalizedTo, { last_mail_at: new Date(mail.created_at) }).catch((error) => {
    console.error(`[mail-service] failed to update inbox metadata for ${normalizedTo}`, error);
  });

  const overflowMails = await listInboxOverflowMailMeta(normalizedTo, MAX_INBOX);
  if (overflowMails.length > 0) {
    await deleteMailMetaBatch(normalizedTo, overflowMails);

    const cleanupResults = await Promise.allSettled(overflowMails.map((oldMail) => deleteMailContent(oldMail)));
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `[mail-service] failed to delete overflow S3 content for ${overflowMails[index]?.id}`,
          result.reason
        );
      }
    });

    await invalidateMailDetailCache(overflowMails.map((oldMail) => oldMail.id));
  }

  const mailDetail = {
    ...mail,
    body_text: bodyText || preview
  };

  await Promise.all([
    setCachedInboxExists(normalizedTo, true),
    invalidateInboxListCache(normalizedTo),
    setCachedMailDetail(mail.id, mailDetail)
  ]);

  return mail;
};

export const fetchInboxMails = async (email, options = {}) => {
  ensureMailStoreConfigured();

  const normalized = email.toLowerCase();
  const exists = await inboxExists(normalized);
  if (!exists) {
    return null;
  }

  const requestedLimit = Number(options.limit ?? DEFAULT_INBOX_PAGE_SIZE);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.floor(requestedLimit))
    : DEFAULT_INBOX_PAGE_SIZE;
  const before = String(options.before || '').trim();
  const canUseDefaultCache = !before && limit === DEFAULT_INBOX_PAGE_SIZE;

  if (canUseDefaultCache) {
    const cached = await getCachedInboxList(normalized);
    if (cached !== null) {
      const totalCount = await countInboxMailMeta(normalized);
      return {
        mails: cached,
        nextCursor:
          totalCount > cached.length && cached.length > 0
            ? encodeMailCursor(cached[cached.length - 1])
            : null,
        totalCount
      };
    }
  }

  const [page, totalCount] = await Promise.all([
    before
      ? listInboxMailMetaPage({ email: normalized, limit, before })
      : listInboxMailMetaPage({ email: normalized, limit }),
    countInboxMailMeta(normalized)
  ]);

  if (canUseDefaultCache) {
    await setCachedInboxList(normalized, page.mails);
  }

  return {
    ...page,
    totalCount
  };
};

export const fetchMailById = async (id) => {
  ensureMailStoreConfigured();

  const cached = await getCachedMailDetail(id);
  if (cached) {
    return cached;
  }

  const mail = await getMailMetaById(id);
  if (!mail) {
    return null;
  }

  if (!mail.body_text && mail.text_key) {
    mail.body_text = await getMailTextContent(mail.text_key).catch(() => '');
  }

  await setCachedMailDetail(id, mail);
  return mail;
};

export const deleteInboxById = async (email, id) => {
  ensureMailStoreConfigured();

  const normalized = email.toLowerCase();
  const exists = await inboxExists(normalized);
  if (!exists) {
    return null;
  }

  const mail = await getInboxMailMeta(normalized, id);
  if (!mail) {
    return false;
  }

  await deleteMailMetaBatch(normalized, [mail]);
  await deleteMailContent(mail).catch((error) => {
    console.error(`[mail-service] failed to delete S3 content for ${mail.id}`, error);
  });
  await Promise.all([
    invalidateInboxListCache(normalized),
    invalidateMailDetailCache([id])
  ]);
  return true;
};

export const deleteInboxAllByEmail = async (email) => {
  ensureMailStoreConfigured();

  const normalized = email.toLowerCase();
  const exists = await inboxExists(normalized);
  if (!exists) {
    return null;
  }

  const mails = await listAllInboxMailMeta(normalized);
  const deletedCount = await deleteMailMetaBatch(normalized, mails);
  await clearInboxMeta(normalized);
  const cleanupResults = await Promise.allSettled(mails.map((mail) => deleteMailContent(mail)));
  cleanupResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[mail-service] failed to delete S3 content for ${mails[index]?.id}`, result.reason);
    }
  });
  await Promise.all([
    setCachedInboxExists(normalized, true),
    setCachedInboxList(normalized, []),
    invalidateMailDetailCache(mails.map((mail) => mail.id))
  ]);
  return deletedCount;
};

export const deleteMailByEmail = async (email) => {
  ensureMailStoreConfigured();

  const normalized = email.toLowerCase();
  const exists = await inboxExists(normalized);
  if (!exists) {
    return null;
  }

  const mails = await listAllInboxMailMeta(normalized);
  const deletedCount = await deleteMailMetaBatch(normalized, mails);
  await deleteInboxMeta(normalized);
  const cleanupResults = await Promise.allSettled(mails.map((mail) => deleteMailContent(mail)));
  cleanupResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[mail-service] failed to delete S3 content for ${mails[index]?.id}`, result.reason);
    }
  });
  await Promise.all([
    invalidateInboxCache(normalized),
    invalidateMailDetailCache(mails.map((mail) => mail.id))
  ]);
  return deletedCount;
};
