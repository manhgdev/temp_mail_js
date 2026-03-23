import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { inboxExists } from '../services/mail.service.js';
import { persistParsedMail } from '../services/mail-processing.service.js';
import { ENV } from '../config/env.js';

const SMTP_PORT = ENV.SMTP_PORT;

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
    async onRcptTo(address, session, callback) {
      try {
        const recipient = String(address?.address || '').trim().toLowerCase();
        if (!recipient) {
          const error = new Error('Recipient address is required');
          error.responseCode = 501;
          callback(error);
          return;
        }

        const exists = await inboxExists(recipient);
        if (!exists) {
          const error = new Error('Mailbox unavailable');
          error.responseCode = 550;
          callback(error);
          return;
        }

        callback(null);
      } catch (error) {
        callback(error);
      }
    },
    async onData(stream, session, callback) {
      try {
        const parsed = await simpleParser(stream);
        const recipients = getEnvelopeRecipients(session?.envelope?.rcptTo);

        if (recipients.length === 0) {
          callback(null);
          return;
        }

        for (const recipient of recipients) {
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
