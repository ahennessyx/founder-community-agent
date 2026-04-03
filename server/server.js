/* ============================================================
   server.js — Express backend for Founder Community Agent
   Port 3001 · Routes: POST /api/send, GET /api/audit, GET /api/health
   ============================================================ */

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const AuditLog = require('./audit-log');
const Resolver = require('./recipient-resolver');
const Composer = require('./email-composer');
const Gmail    = require('./gmail-client');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:8080',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// ── Startup: reconstruct DM cap state from audit log ─────────
// (audit-log module handles this on each call, no cache needed)

console.log('[server] Starting Founder Community Agent backend…');
const dmCounts = AuditLog.getDmCountsThisMonth();
console.log(`[server] DM counts this month from audit log:`, Object.fromEntries(dmCounts));

// ── POST /api/send ────────────────────────────────────────────

app.post('/api/send', async (req, res) => {
  const { queueItemId, mode, content, recipientNames, adminNote, subjectLine } = req.body || {};

  // Validate payload
  if (!queueItemId || !mode || !content) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: queueItemId, mode, content',
      code: 'INVALID_PAYLOAD',
    });
  }

  // The frontend passes a member list snapshot; for simplicity the server
  // reconstructs recipients from the names list passed in.
  // In production you'd read from a shared DB — here we rely on the
  // admin having set emails in the frontend store and passed them through
  // recipientNames (name strings). We need member emails too, so the
  // frontend must also pass enrichedRecipients when available.
  const enrichedRecipients = req.body.enrichedRecipients || [];

  // Resolve names → emails. We use enrichedRecipients from frontend
  // as the member source of truth (emails live in the browser store).
  let resolved, blocked;

  if (enrichedRecipients.length > 0) {
    // Frontend already resolved: validate cap server-side
    const dmCounts = AuditLog.getDmCountsThisMonth();
    resolved = [];
    blocked  = [];
    for (const r of enrichedRecipients) {
      const count = dmCounts.get(r.memberId) || 0;
      if (count >= 2) {
        blocked.push({ name: r.name, reason: `DM cap reached (${count}/2 this month)` });
      } else if (!r.email) {
        blocked.push({ name: r.name, reason: 'No email address on file' });
      } else {
        resolved.push(r);
      }
    }
  } else if (recipientNames && recipientNames.length > 0) {
    // No emails provided — we can't send without emails
    return res.status(422).json({
      ok: false,
      error: 'Recipient emails not provided. Ensure members have email addresses set in their profiles.',
      code: 'NO_RECIPIENTS_RESOLVED',
    });
  } else {
    // Synthesizer / no specific recipients
    resolved = [];
    blocked  = [];
  }

  // Check early exits
  if (recipientNames && recipientNames.length > 0 && resolved.length === 0 && blocked.length > 0) {
    // All blocked due to cap
    const allCap = blocked.every(b => b.reason.includes('cap'));
    if (allCap) {
      return res.status(422).json({
        ok: false,
        error: 'All recipients have reached the 2 DM/month cap.',
        code: 'ALL_BLOCKED_CAP',
        blocked,
      });
    }
    return res.status(422).json({
      ok: false,
      error: 'No recipients could be resolved with valid email addresses.',
      code: 'NO_RECIPIENTS_RESOLVED',
      blocked,
    });
  }

  // ── Send emails ───────────────────────────────────────────

  const sentResults  = [];
  const failResults  = [];
  const allRecipients = [];

  if (resolved.length > 0) {
    for (const recipient of resolved) {
      const dmContent = Composer.extractDmForRecipient(content, recipient.name);
      const subject   = Composer.buildSubjectLine(mode, recipientNames || [], subjectLine);
      const body      = Composer.buildBody({
        firstName:    recipient.firstName || recipient.name.split(' ')[0],
        agentContent: dmContent,
        adminNote:    adminNote || '',
      });

      try {
        const { messageId } = await Gmail.sendEmail({
          to:      recipient.email,
          subject,
          body,
        });

        sentResults.push({
          name:      recipient.name,
          email:     recipient.email,
          messageId,
        });

        allRecipients.push({
          memberId:     recipient.memberId || null,
          name:         recipient.name,
          email:        recipient.email,
          status:       'sent',
          messageId,
          dmCountAfter: (AuditLog.getDmCountsThisMonth().get(recipient.memberId) || 0) + 1,
        });
      } catch (sendErr) {
        console.error(`[server] Failed to send to ${recipient.name}:`, sendErr.message);
        failResults.push({ name: recipient.name, error: sendErr.message });
        allRecipients.push({
          memberId: recipient.memberId || null,
          name:     recipient.name,
          email:    recipient.email,
          status:   'failed',
          error:    sendErr.message,
        });
      }
    }
  } else if (resolved.length === 0 && (!recipientNames || recipientNames.length === 0)) {
    // Synthesizer mode — no individual recipients; log as broadcast
    allRecipients.push({ status: 'broadcast', name: 'all-members' });
  }

  // ── Write audit entry ─────────────────────────────────────

  const auditEntry = AuditLog.append({
    queueItemId,
    mode,
    adminAction: 'approved',
    recipients:  allRecipients,
    blocked,
    subjectLine: Composer.buildSubjectLine(mode, recipientNames || [], subjectLine),
    content,   // will be hashed and removed by AuditLog.append
  });

  // ── Build response ────────────────────────────────────────

  if (failResults.length > 0 && sentResults.length === 0) {
    return res.status(502).json({
      ok: false,
      error: `Gmail send failed: ${failResults.map(f => f.error).join('; ')}`,
      code: 'GMAIL_SEND_FAILED',
      blocked,
      auditId: auditEntry.auditId,
    });
  }

  return res.json({
    ok: true,
    sent:    sentResults,
    blocked: [...blocked, ...failResults.map(f => ({ name: f.name, reason: f.error }))],
    auditId: auditEntry.auditId,
  });
});

// ── GET /api/audit ────────────────────────────────────────────

app.get('/api/audit', (req, res) => {
  const filters = {};
  if (req.query.mode)     filters.mode     = req.query.mode;
  if (req.query.from)     filters.from     = req.query.from;
  if (req.query.memberId) filters.memberId = req.query.memberId;

  const entries = AuditLog.read(filters);
  res.json(entries);
});

// ── GET /api/health ───────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  const gmailStatus = await Gmail.healthCheck();
  const dmCounts    = AuditLog.getDmCountsThisMonth();

  res.json({
    ok:     true,
    server: 'running',
    gmail:  gmailStatus,
    dmCapsThisMonth: Object.fromEntries(dmCounts),
    timestamp: new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Founder Community Agent backend running on http://localhost:${PORT}`);
  console.log(`[server] Accepting requests from: ${process.env.FRONTEND_ORIGIN || 'http://localhost:8080'}`);
});

module.exports = app;
