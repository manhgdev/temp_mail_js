import { generateUsername } from './username.js';

export const generateRandomEmail = (domain) => {
  const localPart = generateUsername();
  return `${localPart}@${domain}`.toLowerCase();
};
