import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { inboxExists } from '../repositories/mail.repo.js';
import { persistParsedMail } from '../services/mail-processing.service.js';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 25);

const firstRecipient = (toList = []) => {
  if (!Array.isArray(toList) || toList.length === 0) {
    return null;
  }

  return toList[0]?.address?.toLowerCase() || null;
};

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
        const toEmail = firstRecipient(parsed.to?.value);

        if (!toEmail) {
          callback(null);
          return;
        }

        const exists = await inboxExists(toEmail);
        if (!exists) {
          callback(null);
          return;
        }

        await persistParsedMail({
          to: parsed.to,
          from: parsed.from,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          attachments: parsed.attachments
        });

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
