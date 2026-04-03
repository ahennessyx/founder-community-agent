/* ============================================================
   audit-log.js — Append-only audit trail (newline-delimited JSON)
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_FILE = path.join(__dirname, 'audit.json');

// ── Helpers ──────────────────────────────────────────────────

function _genAuditId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `audit_${datePart}_${rand}`;
}

function _contentHash(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

function _currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Core ─────────────────────────────────────────────────────

/**
 * Append one audit entry to audit.json (newline-delimited).
 * @param {object} entry
 * @returns {object} the written entry with auditId + timestamp
 */
function append(entry) {
  const record = {
    auditId: _genAuditId(),
    timestamp: new Date().toISOString(),
    ...entry,
    contentHash: _contentHash(entry.content || entry.body || ''),
  };
  // Remove raw content from audit log — store hash only
  delete record.content;
  delete record.body;

  fs.appendFileSync(AUDIT_FILE, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

/**
 * Read all audit entries, with optional filters.
 * @param {object} [filters]
 * @param {string} [filters.mode]
 * @param {string} [filters.from]  ISO date string
 * @param {string} [filters.memberId]
 * @returns {object[]}
 */
function read(filters) {
  if (!fs.existsSync(AUDIT_FILE)) return [];

  const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
  let entries = raw.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);

  if (filters) {
    if (filters.mode) {
      entries = entries.filter(e => e.mode === filters.mode);
    }
    if (filters.from) {
      const fromTs = new Date(filters.from).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= fromTs);
    }
    if (filters.memberId) {
      entries = entries.filter(e =>
        (e.recipients || []).some(r => r.memberId === filters.memberId)
      );
    }
  }

  return entries;
}

/**
 * Reconstruct DM counts per member for the current calendar month.
 * Called on server startup so cap state is always from the durable log.
 * @returns {Map<string, number>}  memberId → count
 */
function getDmCountsThisMonth() {
  const month = _currentMonthKey();
  const entries = read();
  const counts = new Map();

  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const entryMonth = entry.timestamp.slice(0, 7); // "YYYY-MM"
    if (entryMonth !== month) continue;

    for (const r of (entry.recipients || [])) {
      if (r.status === 'sent' && r.memberId) {
        counts.set(r.memberId, (counts.get(r.memberId) || 0) + 1);
      }
    }
  }

  return counts;
}

module.exports = { append, read, getDmCountsThisMonth };
