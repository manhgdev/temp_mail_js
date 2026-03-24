import { generateRandomEmail } from '../utils/email.js';
import { getActiveDomains, normalizeDomain } from './domain.service.js';
import {
  createInbox,
  deleteInboxAllByEmail,
  deleteInboxById,
  deleteMailByEmail,
  fetchInboxMails,
  fetchMailById,
  checkInboxOwnership
} from './mail.service.js';

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

export { fetchInboxMails, fetchMailById, deleteInboxById, deleteInboxAllByEmail, deleteMailByEmail, checkInboxOwnership };
