import {
  countInboxMailMeta,
  getMailMetaById,
  listInboxMailMetaPage
} from '../../repositories/mail-meta.repo.js';
import { getMailTextContent } from '../../repositories/mail-content.repo.js';

export const listAdminEmailMails = async (email, { limit = 20, before = '' } = {}) => {
  const [page, totalCount] = await Promise.all([
    listInboxMailMetaPage({ email, limit, before }),
    countInboxMailMeta(email)
  ]);

  return {
    email,
    mails: page.mails,
    nextCursor: page.nextCursor,
    totalCount
  };
};

export const getAdminMailDetail = async (id) => {
  const mail = await getMailMetaById(id);
  if (!mail) {
    return null;
  }

  if (!mail.body_text && mail.text_key) {
    mail.body_text = await getMailTextContent(mail.text_key).catch(() => '');
  }

  return mail;
};
