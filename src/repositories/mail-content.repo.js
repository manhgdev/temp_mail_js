import { deleteFiles, getObjectText, uploadFile } from '../services/s3.js';

const safeFileName = (value = 'attachment') => value.replace(/[^a-zA-Z0-9._-]/g, '_');

export const saveMailContent = async ({ id, text, html, attachments = [] }) => {
  const bodyText = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  const htmlBody = html || `<pre>${text || ''}</pre>`;
  const uploadedKeys = [];

  try {
    const htmlKey = `mails/${id}/body.html`;
    const htmlUrl = await uploadFile(htmlKey, htmlBody, 'text/html; charset=utf-8');
    uploadedKeys.push(htmlKey);

    const textKey = `mails/${id}/body.txt`;
    await uploadFile(textKey, bodyText, 'text/plain; charset=utf-8');
    uploadedKeys.push(textKey);

    const uploadedAttachments = [];
    for (const attachment of attachments) {
      const fileName = safeFileName(attachment.filename || 'attachment.bin');
      const attachmentKey = `mails/${id}/attachments/${fileName}`;
      const url = await uploadFile(
        attachmentKey,
        attachment.content,
        attachment.contentType || 'application/octet-stream'
      );
      uploadedKeys.push(attachmentKey);

      uploadedAttachments.push({
        filename: attachment.filename || fileName,
        contentType: attachment.contentType || 'application/octet-stream',
        size: attachment.size || 0,
        key: attachmentKey,
        url
      });
    }

    return {
      body_text: '',
      text_key: textKey,
      html_url: htmlUrl,
      html_key: htmlKey,
      attachments: uploadedAttachments
    };
  } catch (error) {
    await deleteFiles(uploadedKeys).catch((cleanupError) => {
      console.error(`[mail-content] failed to rollback uploaded content for ${id}`, cleanupError);
    });
    throw error;
  }
};

export const getMailTextContent = async (key) => {
  if (!key) {
    return '';
  }

  return getObjectText(key);
};

export const deleteMailContent = async (mail) => {
  const keys = [
    mail?.text_key,
    mail?.html_key,
    ...(mail?.attachments || []).map((attachment) => attachment?.key)
  ].filter(Boolean);

  await deleteFiles(keys);
};
