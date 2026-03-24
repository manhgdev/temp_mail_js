export const fetchJson = async (path, options = {}) => {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
};

export const postJson = (path, payload, options = {}) =>
  fetchJson(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: JSON.stringify(payload),
    ...options
  });
