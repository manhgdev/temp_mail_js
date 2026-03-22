export const getPreview = (value = '') => {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 100);
};
