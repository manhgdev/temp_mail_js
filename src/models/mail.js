export const createMail = ({
  id,
  to,
  from,
  subject,
  preview,
  body_text,
  html_url,
  html_key,
  attachments = [],
  created_at = new Date().toISOString()
}) => ({
  id,
  to,
  from,
  subject,
  preview,
  body_text,
  html_url,
  html_key,
  attachments,
  created_at
});
