import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { inboxExists } from '../repositories/mail.repo.js';
import { persistParsedMail } from '../services/mail-processing.service.js';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 25);

const getEnvelopeRecipients = (rcptTo = []) =>
  [...new Set(
    (Array.isArray(rcptTo) ? rcptTo : [])
      .map((recipient) => String(recipient?.address || '').trim().toLowerCase())
      .filter(Boolean)
  )];

export const createSmtpServer = () =>
  new SMTPServer({
    disabledCommands: ['AUTH'],
    authOptional: true,
    onRcptTo(address, session, callback) {
      callback(null);
    },
    async onData(stream, session, callback) {
      try {
        const parsed = await simpleParser(stream);
        const recipients = getEnvelopeRecipients(session?.envelope?.rcptTo);

        if (recipients.length === 0) {
          callback(null);
          return;
        }

        const existingRecipients = [];
        for (const recipient of recipients) {
          if (await inboxExists(recipient)) {
            existingRecipients.push(recipient);
          }
        }

        if (existingRecipients.length === 0) {
          callback(null);
          return;
        }

        for (const recipient of existingRecipients) {
          await persistParsedMail({
            to: recipient,
            from: parsed.from,
            subject: parsed.subject,
            text: parsed.text,
            html: parsed.html,
            attachments: parsed.attachments
          });
        }

        callback(null);
      } catch (error) {
        callback(error);
      }
    }
  });

export const startSmtpServer = () =>
  new Promise((resolve, reject) => {
    const server = createSmtpServer();
    server.once('error', reject);
    server.listen(SMTP_PORT, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`[smtp] listening on port http://127.0.0.1:${SMTP_PORT}`);
      resolve(server);
    });
  });
