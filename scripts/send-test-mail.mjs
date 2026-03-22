import net from 'node:net';

const args = process.argv.slice(2);

const readArg = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
};

const SMTP_HOST = readArg('host', process.env.SMTP_HOST || '127.0.0.1');
const SMTP_PORT = Number(readArg('port', process.env.SMTP_PORT || '25'));
const API_BASE = readArg('api', process.env.API_BASE || 'http://127.0.0.1:9001');
let TO = readArg('to');
const FROM = readArg('from', 'sender@example.com');
const SUBJECT = readArg('subject', 'Temp mail local test');
const BODY = readArg('body', 'Local SMTP test mail');

const generateInbox = async () => {
  const response = await fetch(`${API_BASE}/generate`);
  if (!response.ok) {
    throw new Error(`Failed to generate inbox: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.email) {
    throw new Error('Failed to generate inbox: missing email');
  }

  return data.email;
};

const getCurrentInbox = async () => {
  const response = await fetch(`${API_BASE}/session/current-email`);
  if (!response.ok) {
    throw new Error(`Failed to get current inbox: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.email || '';
};

const lines = [];
let pendingResolve = null;
let pendingReject = null;

const socket = net.createConnection({
  host: SMTP_HOST,
  port: SMTP_PORT
});

const waitForResponse = () =>
  new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
  });

const flushLines = () => {
  while (lines.length > 0) {
    const line = lines.shift();
    if (!pendingResolve) {
      continue;
    }

    if (/^\d{3} /.test(line)) {
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      resolve(line);
    }
  }
};

const sendCommand = async (command) => {
  socket.write(`${command}\r\n`);
  const response = await waitForResponse();

  if (!/^[23]/.test(response)) {
    throw new Error(`SMTP command failed: ${command} -> ${response}`);
  }

  return response;
};

socket.setEncoding('utf8');

socket.on('data', (chunk) => {
  const parts = chunk.split('\r\n').filter(Boolean);
  lines.push(...parts);
  flushLines();
});

socket.on('error', (error) => {
  if (pendingReject) {
    pendingReject(error);
    pendingResolve = null;
    pendingReject = null;
    return;
  }

  console.error(error.message);
  process.exit(1);
});

socket.on('end', () => {
  if (pendingReject) {
    pendingReject(new Error('SMTP connection closed unexpectedly'));
    pendingResolve = null;
    pendingReject = null;
  }
});

try {
  if (!TO) {
    TO = await getCurrentInbox();
  }

  if (!TO) {
    TO = await generateInbox();
  }

  const greeting = await waitForResponse();
  if (!/^220 /.test(greeting)) {
    throw new Error(`Invalid SMTP greeting: ${greeting}`);
  }

  await sendCommand('EHLO localhost');
  await sendCommand(`MAIL FROM:<${FROM}>`);
  await sendCommand(`RCPT TO:<${TO}>`);
  await sendCommand('DATA');

  socket.write(
    [
      `From: ${FROM}`,
      `To: ${TO}`,
      `Subject: ${SUBJECT}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      BODY,
      '.',
      ''
    ].join('\r\n')
  );

  const dataResponse = await waitForResponse();
  if (!/^250 /.test(dataResponse)) {
    throw new Error(`SMTP DATA failed: ${dataResponse}`);
  }

  await sendCommand('QUIT');
  socket.end();

  console.log(
    JSON.stringify(
      {
        status: 'sent',
        host: SMTP_HOST,
        port: SMTP_PORT,
        to: TO,
        source: readArg('to') ? 'argument' : 'active-or-generated',
        inbox_url: `${API_BASE}/inbox/${encodeURIComponent(TO)}`
      },
      null,
      2
    )
  );
} catch (error) {
  socket.destroy();
  console.error(error.message);
  process.exit(1);
}
