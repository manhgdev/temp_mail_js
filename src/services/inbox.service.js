import {
  createInbox,
  deleteInbox,
  deleteInboxAll,
  deleteMail,
  getInbox,
  getMail,
  inboxExists,
  listInboxMails
} from '../repositories/mail.repo.js';
import { generateRandomEmail } from '../utils/email.js';
import { getActiveDomains, normalizeDomain } from './domain.service.js';

const MAX_GENERATE_ATTEMPTS = 10;

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

  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
    const email = generateRandomEmail(selectedDomain);
    const created = await createInbox(email);
    if (created) {
      return email;
    }
  }

  throw new Error('Failed to allocate a unique inbox');
};

export const fetchInboxMails = async (email) => {
  const exists = await inboxExists(email);
  if (!exists) {
    return null;
  }

  return listInboxMails(email);
};

export const fetchMailById = async (id) => getMail(id);
export const deleteInboxById = async (email, id) => {
  const exists = await inboxExists(email);
  if (!exists) {
    return null;
  }

  return deleteInbox(email, id);
};

export const deleteInboxAllByEmail = async (email) => {
  const exists = await inboxExists(email);
  if (!exists) {
    return null;
  }

  return deleteInboxAll(email);
};

export const deleteMailByEmail = async (email) => {
  const exists = await inboxExists(email);
  if (!exists) {
    return null;
  }

  return deleteMail(email);
};
