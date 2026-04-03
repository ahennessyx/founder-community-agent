/* ============================================================
   email-composer.js — Subject line, body formatting, mandatory footer
   Plain text only. Footer is non-removable.
   ============================================================ */

const ADMIN_NAME = process.env.ADMIN_NAME || 'Community Facilitator';
const GROUP_NAME = process.env.GROUP_NAME || 'Founder Circle';

// ── Subject lines by mode ─────────────────────────────────────

/**
 * Generate the subject line for a given mode + recipient names.
 * The admin can override this from the queue UI.
 * @param {string} mode
 * @param {string[]} recipientNames
 * @param {string} [override]
 * @returns {string}
 */
function buildSubjectLine(mode, recipientNames, override) {
  if (override && override.trim()) return override.trim();

  switch (mode) {
    case 'seeker':
      return `[Community] Your experience — would love your perspective`;
    case 'connector': {
      if (recipientNames.length >= 2) {
        const a = recipientNames[0].split(' ')[0];
        const b = recipientNames[1].split(' ')[0];
        return `[Community] Introduction: ${a} \u2194 ${b}`;
      }
      return `[Community] A connection for you`;
    }
    case 'synthesizer':
      return `[Community] A conversation starter for the group`;
    default:
      return `[Community] Message from your community facilitator`;
  }
}

// ── Mandatory disclosure footer ───────────────────────────────

function _buildFooter() {
  return [
    '---',
    `This message was sent by ${ADMIN_NAME} on behalf of the ${GROUP_NAME} community.`,
    'It was facilitated by our community AI tool, which helps surface relevant conversations and connections.',
    'Reply directly to this email to respond.',
  ].join('\n');
}

// ── Full email body ───────────────────────────────────────────

/**
 * Compose the full plain-text email body for one recipient.
 * @param {object} opts
 * @param {string} opts.firstName
 * @param {string} opts.agentContent  Full agent output text
 * @param {string} [opts.adminNote]   Optional note prepended before agent content
 * @returns {string}  Complete plain-text email body
 */
function buildBody({ firstName, agentContent, adminNote }) {
  const salutation = `Hi ${firstName},`;

  const bodyParts = [];
  if (adminNote && adminNote.trim()) {
    bodyParts.push(adminNote.trim());
  }
  bodyParts.push(agentContent.trim());

  const body = bodyParts.join('\n\n');
  const footer = _buildFooter();

  return [salutation, '', body, '', footer].join('\n');
}

/**
 * Extract the DM text for a specific recipient from agent output.
 * Looks for "RECIPIENT: [Name]" blocks. If the mode doesn't produce
 * per-recipient blocks (Synthesizer), returns the full content.
 * @param {string} content  Full agent output
 * @param {string} recipientName
 * @returns {string}
 */
function extractDmForRecipient(content, recipientName) {
  const lines = content.split('\n');
  let capturing = false;
  let dmLines = [];
  const nameLower = recipientName.toLowerCase().trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match "RECIPIENT: Name" or "PAIRING: Name ↔ Name"
    const recipientMatch = line.match(/^RECIPIENT:\s*(.+)$/i);
    const pairingMatch = line.match(/^PAIRING:\s*(.+?)\s*[↔<>-]+\s*(.+)$/i);

    if (recipientMatch) {
      const matchedName = recipientMatch[1].trim().toLowerCase();
      // Check exact or first-name match
      if (matchedName === nameLower || matchedName.split(' ')[0] === nameLower.split(' ')[0]) {
        capturing = true;
        dmLines = [];
        continue;
      } else if (capturing) {
        // We've hit the next recipient block — stop
        break;
      }
    } else if (pairingMatch) {
      const nameA = pairingMatch[1].trim().toLowerCase();
      const nameB = pairingMatch[2].trim().toLowerCase();
      if (
        nameA === nameLower || nameA.split(' ')[0] === nameLower.split(' ')[0] ||
        nameB === nameLower || nameB.split(' ')[0] === nameLower.split(' ')[0]
      ) {
        capturing = true;
        dmLines = [];
        continue;
      } else if (capturing) {
        break;
      }
    } else if (line.match(/^---+\s*$/)) {
      if (capturing) break;
    } else if (capturing) {
      dmLines.push(line);
    }
  }

  const extracted = dmLines.join('\n').trim();
  // If we couldn't extract a specific section, return full content
  return extracted || content;
}

module.exports = { buildSubjectLine, buildBody, extractDmForRecipient };
