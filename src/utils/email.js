import { randomBytes } from 'node:crypto';

export const generateRandomEmail = (domain) => {
  const localPart = randomBytes(8).toString('hex');
  return `${localPart}@${domain}`.toLowerCase();
};
