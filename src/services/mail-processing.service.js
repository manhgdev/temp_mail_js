import { createMail } from '../models/mail.js';
import { saveMail } from '../repositories/mail.repo.js';
import { generateId } from '../utils/id.js';
import { getPreview } from '../utils/preview.js';
import { uploadFile } from './s3.js';

const safeFileName = (value = 'attachment') => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const normalizeEmailAddress = (addressLike) => {
  if (!addressLike) {
    return null;
  }

  if (typeof addressLike === 'string') {
    return addressLike.trim().toLowerCase();
  }

  if (addressLike.address) {
    return String(addressLike.address).trim().toLowerCase();
  }

  if (Array.isArray(addressLike.value) && addressLike.value[0]?.address) {
    return String(addressLike.value[0].address).trim().toLowerCase();
  }

  return null;
};

export const persistParsedMail = async ({ to, from, subject, text, html, attachments = [] }) => {
  const id = generateId();
  const bodyText = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();

  const htmlBody = html || `<pre>${text || ''}</pre>`;
  const htmlKey = `mails/${id}/body.html`;
  const htmlUrl = await uploadFile(htmlKey, htmlBody, 'text/html; charset=utf-8');
  const textKey = `mails/${id}/body.txt`;
  await uploadFile(textKey, bodyText || getPreview(text || html || ''), 'text/plain; charset=utf-8');

  const uploadedAttachments = [];
  for (const attachment of attachments) {
    const fileName = safeFileName(attachment.filename || 'attachment.bin');
    const attachmentKey = `mails/${id}/attachments/${fileName}`;
    const url = await uploadFile(
      attachmentKey,
      attachment.content,
      attachment.contentType || 'application/octet-stream'
    );

    uploadedAttachments.push({
      filename: attachment.filename || fileName,
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || 0,
      key: attachmentKey,
      url
    });
  }

  const mail = createMail({
    id,
    to: normalizeEmailAddress(to),
    from: normalizeEmailAddress(from),
    subject: subject || '(no subject)',
    preview: getPreview(text || html || ''),
    body_text: '',
    text_key: textKey,
    html_url: htmlUrl,
    html_key: htmlKey,
    attachments: uploadedAttachments,
    created_at: new Date().toISOString()
  });

  await saveMail(mail);
  return mail;
};
