import { createIncomingMail } from './mail.service.js';

export const persistParsedMail = async ({ to, from, subject, text, html, attachments = [] }) => {
  return createIncomingMail({ to, from, subject, text, html, attachments });
};
