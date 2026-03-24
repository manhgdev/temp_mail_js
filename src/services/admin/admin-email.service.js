import { countInboxMailMeta } from '../../repositories/mail-meta.repo.js';
import { removeAllUserInboxes, removeUserInbox } from '../user/user-inbox.service.js';
import { countUserInboxes, getUserInboxListPaginated } from '../user/user-inbox.service.js';

export const listAdminUserEmails = async (uid, { limit = 20, before = '' } = {}) => {
  const [page, totalCount] = await Promise.all([
    getUserInboxListPaginated(uid, { limit, before }),
    countUserInboxes(uid)
  ]);

  const emails = await Promise.all(
    page.inboxes.map(async (inbox) => ({
      ...inbox,
      total_mail_count: await countInboxMailMeta(inbox.email).catch(() => 0)
    }))
  );

  return {
    emails: emails.sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    }),
    nextCursor: page.nextCursor,
    totalCount
  };
};

export const deleteAdminUserEmail = async (uid, email) => {
  const removed = await removeUserInbox(uid, email);
  return { removed: Boolean(removed), email: String(email || '').trim().toLowerCase() };
};

export const deleteAllAdminUserEmails = async (uid) => {
  const count = await removeAllUserInboxes(uid);
  return { deleted_count: count };
};
