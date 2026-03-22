import {
  clearInbox,
  createInbox,
  deleteMail,
  getInbox,
  getMail,
  inboxExists
} from '../repositories/mail.repo.js';
import { generateRandomEmail } from '../utils/email.js';
import { getActiveDomains, normalizeDomain } from './domain.service.js';

export const generateInboxEmail = async (domain) => {
  const activeDomains = await getActiveDomains();
  if (!activeDomains.length) {
    throw new Error('No active domains configured');
  }

  const selectedDomain = domain
    ? normalizeDomain(domain)
    : activeDomains[Math.floor(Math.random() * activeDomains.length)];
  if (!activeDomains.includes(selectedDomain)) {
    throw new Error('Unsupported domain');
  }

  const email = generateRandomEmail(selectedDomain);
  await createInbox(email);
  return email;
};

export const fetchInboxMails = async (email) => {
  const exists = await inboxExists(email);
  if (!exists) {
    return null;
  }

  const ids = await getInbox(email);
  if (ids.length === 0) {
    return [];
  }

  const mails = await Promise.all(ids.map((id) => getMail(id)));
  return mails.filter(Boolean);
};

export const fetchMailById = async (id) => getMail(id);
export const deleteMailById = async (id) => deleteMail(id);
export const deleteInboxByEmail = async (email) => {
  const exists = await inboxExists(email);
  if (!exists) {
    return null;
  }

  return clearInbox(email);
};
