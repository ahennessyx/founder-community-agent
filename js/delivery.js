/* ============================================================
   delivery.js — Frontend delivery layer
   POST /api/send to Node.js backend
   ============================================================ */

const Delivery = (() => {
  const SERVER_URL = 'http://localhost:3001';

  /**
   * Send an approved queue item via the backend.
   * @param {object} payload
   * @param {string} payload.queueItemId
   * @param {string} payload.mode
   * @param {string} payload.content
   * @param {string[]} payload.recipientNames
   * @param {string} payload.subjectLine
   * @param {string} [payload.adminNote]
   * @returns {Promise<object>} server response
   */
  async function send(payload) {
    let response;
    try {
      response = await fetch(`${SERVER_URL}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      // Server not running — return graceful offline result
      return {
        ok: false,
        error: 'Cannot reach delivery server (http://localhost:3001). Is the backend running?',
        code: 'SERVER_UNREACHABLE',
        offline: true,
      };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        error: `Server returned non-JSON response (HTTP ${response.status})`,
        code: 'INVALID_RESPONSE',
      };
    }

    return data;
  }

  /**
   * Fetch the audit log from the backend.
   * @param {object} [filters]
   * @param {string} [filters.mode]
   * @param {string} [filters.from]
   * @param {string} [filters.memberId]
   * @returns {Promise<object[]>}
   */
  async function getAudit(filters) {
    const params = new URLSearchParams(filters || {});
    try {
      const response = await fetch(`${SERVER_URL}/api/audit?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.warn('Audit fetch failed:', err.message);
      return [];
    }
  }

  /**
   * Check server health and Gmail MCP status.
   * @returns {Promise<object>}
   */
  async function health() {
    try {
      const response = await fetch(`${SERVER_URL}/api/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { send, getAudit, health };
})();
