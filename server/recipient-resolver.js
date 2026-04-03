/* ============================================================
   recipient-resolver.js
   Resolves member names from agent output → email addresses.
   Enforces DM cap from the audit log (not in-memory state).
   ============================================================ */

const AuditLog = require('./audit-log');

const DM_CAP = 2;

/**
 * Name-matching: exact match first, then first-name fallback.
 * Case-insensitive. No fuzzy matching in v1.
 * @param {string} name
 * @param {object[]} members
 * @returns {object|null}
 */
function findMember(name, members) {
  const lower = name.toLowerCase().trim();
  // Exact match
  const exact = members.find(m => m.name.toLowerCase() === lower);
  if (exact) return exact;
  // First-name fallback: only if exactly one member has that first name
  const firstNameMatches = members.filter(
    m => m.name.split(' ')[0].toLowerCase() === lower
  );
  return firstNameMatches.length === 1 ? firstNameMatches[0] : null;
}

/**
 * Resolve a list of recipient names to members.
 * Checks DM cap from the audit log.
 *
 * @param {string[]} names         Names from the agent output or admin override
 * @param {object[]} members       Full member list from store
 * @returns {{ resolved: object[], blocked: object[] }}
 *
 * resolved[]: { memberId, name, email, firstName }
 * blocked[]:  { name, reason }
 */
function resolve(names, members) {
  // Load DM counts from audit log (source of truth)
  const dmCounts = AuditLog.getDmCountsThisMonth();

  const resolved = [];
  const blocked = [];

  for (const name of names) {
    const member = findMember(name, members);

    if (!member) {
      blocked.push({ name, reason: 'Member not found in community' });
      continue;
    }

    if (!member.email || !member.email.trim()) {
      blocked.push({ name: member.name, reason: 'No email address on file' });
      continue;
    }

    const count = dmCounts.get(member.id) || 0;
    if (count >= DM_CAP) {
      blocked.push({
        name: member.name,
        reason: `DM cap reached (${count}/${DM_CAP} this month)`,
      });
      continue;
    }

    resolved.push({
      memberId: member.id,
      name: member.name,
      email: member.email.trim(),
      firstName: member.name.split(' ')[0],
    });
  }

  return { resolved, blocked };
}

/**
 * Parse member name mentions from free-text agent output.
 * Looks for "RECIPIENT: Name" lines and "PAIRING: A ↔ B" lines.
 * Returns unique names.
 * @param {string} content
 * @returns {string[]}
 */
function parseNamesFromContent(content) {
  const names = [];
  const lines = (content || '').split('\n');

  for (const line of lines) {
    const recipientMatch = line.match(/^RECIPIENT:\s*(.+)$/i);
    if (recipientMatch) {
      names.push(recipientMatch[1].trim());
      continue;
    }
    const pairingMatch = line.match(/^PAIRING:\s*(.+?)\s*[↔<>]+\s*(.+)$/i);
    if (pairingMatch) {
      names.push(pairingMatch[1].trim());
      names.push(pairingMatch[2].trim());
    }
  }

  return [...new Set(names)];
}

module.exports = { resolve, parseNamesFromContent, findMember };
