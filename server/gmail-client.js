/* ============================================================
   gmail-client.js — Gmail MCP wrapper
   Uses OAuth via the Gmail MCP server.
   Credentials stay in .env — never exposed to the client.
   ============================================================ */

// node-fetch v3 is ESM-only; we use dynamic import for compatibility.
let _fetch;
async function getFetch() {
  if (!_fetch) {
    const mod = await import('node-fetch');
    _fetch = mod.default;
  }
  return _fetch;
}

const MCP_URL    = process.env.GMAIL_MCP_URL    || 'https://gmail.mcp.claude.com/mcp';
const CLIENT_ID  = process.env.GMAIL_CLIENT_ID  || '';
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL   || '';

// ── OAuth token refresh ───────────────────────────────────────

let _accessToken = null;
let _tokenExpiry = 0;

async function _getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60000) return _accessToken;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Gmail OAuth credentials not configured. Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env');
  }

  const fetch = await getFetch();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(`Gmail OAuth token refresh failed: ${data.error_description || data.error || 'Unknown error'}`);
  }

  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _accessToken;
}

// ── MCP call ─────────────────────────────────────────────────

async function _mcpCall(tool, params) {
  const token = await _getAccessToken();
  const fetch = await getFetch();

  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: tool, arguments: params },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gmail MCP HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Gmail MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

// ── Send email ────────────────────────────────────────────────

/**
 * Send a plain-text email via Gmail MCP.
 * @param {object} opts
 * @param {string} opts.to          Recipient email address
 * @param {string} opts.subject
 * @param {string} opts.body        Plain text body (with footer already appended)
 * @returns {Promise<{ messageId: string }>}
 */
async function sendEmail({ to, subject, body }) {
  if (!to || !subject || !body) {
    throw new Error('sendEmail: to, subject, and body are all required');
  }

  // Build RFC 2822 raw message
  const from = ADMIN_EMAIL;
  const rawLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ];
  const rawMessage = rawLines.join('\r\n');

  // Base64url encode for Gmail API
  const encoded = Buffer.from(rawMessage).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const result = await _mcpCall('gmail_send_email', {
    raw: encoded,
  });

  // Extract messageId from MCP result
  const messageId = result?.content?.[0]?.text
    ? JSON.parse(result.content[0].text)?.id
    : result?.id || `mock_${Date.now()}`;

  return { messageId };
}

// ── Health check ──────────────────────────────────────────────

/**
 * Verify that Gmail MCP is reachable and credentials work.
 * @returns {Promise<{ ok: boolean, email?: string, error?: string }>}
 */
async function healthCheck() {
  try {
    await _getAccessToken();
    // Try a minimal MCP call to verify connectivity
    const result = await _mcpCall('gmail_get_profile', {});
    const email = result?.content?.[0]?.text
      ? JSON.parse(result.content[0].text)?.emailAddress
      : ADMIN_EMAIL;
    return { ok: true, email };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail, healthCheck };
