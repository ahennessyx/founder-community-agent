/* ============================================================
   ui.js — All rendering functions
   ============================================================ */

const UI = (() => {

  // ── Helpers ──────────────────────────────────────────────────

  function initials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  function relativeDate(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tagsHtml(tags, variant) {
    return tags.map(t => `<span class="tag ${variant || ''}">${escHtml(t)}</span>`).join('');
  }

  // ── Dashboard ────────────────────────────────────────────────

  function renderDashboard() {
    const members = Store.getMembers();
    const threads = Store.getThreads();

    document.getElementById('stat-members').textContent = members.length;
    document.getElementById('stat-threads').textContent = threads.length;
    document.getElementById('stat-queue').textContent = Store.getPendingQueueCount();
    document.getElementById('stat-sent').textContent = Store.getTotalSentCount();

    // Recent members
    const recentMembers = [...members].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    document.getElementById('recent-members').innerHTML = recentMembers.length
      ? recentMembers.map(m => `
          <div class="recent-item">
            <div class="member-avatar" style="width:28px;height:28px;font-size:11px">${initials(m.name)}</div>
            <span class="recent-item-name">${escHtml(m.name)}</span>
            <span class="recent-item-meta">${escHtml(m.sector)}</span>
          </div>`).join('')
      : '<p style="color:var(--text-3);font-size:13px">No members yet.</p>';

    // Recent threads
    const recentThreads = [...threads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
    document.getElementById('recent-threads').innerHTML = recentThreads.length
      ? recentThreads.map(t => `
          <div class="recent-item">
            <span class="recent-item-name">${escHtml(t.title)}</span>
            <span class="recent-item-meta">${relativeDate(t.createdAt)}</span>
          </div>`).join('')
      : '<p style="color:var(--text-3);font-size:13px">No threads yet.</p>';
  }

  // ── Members Grid ─────────────────────────────────────────────

  function renderMembersGrid(filter) {
    const container = document.getElementById('members-grid');
    let members = Store.getMembers();

    if (filter) {
      const q = filter.toLowerCase();
      members = members.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.sector.toLowerCase().includes(q) ||
        m.expertiseTags.some(t => t.toLowerCase().includes(q)) ||
        m.askTags.some(t => t.toLowerCase().includes(q)) ||
        (m.bio || '').toLowerCase().includes(q)
      );
    }

    if (!members.length) {
      container.innerHTML = '<div class="empty-state"><p>No members found.</p></div>';
      return;
    }

    container.innerHTML = members.map(m => {
      const dmCount = Store.getDmCountThisMonth(m.id);
      const capPct = (dmCount / Store.DM_CAP) * 100;
      const capFull = dmCount >= Store.DM_CAP;
      return `
        <div class="member-card" data-member-id="${m.id}">
          <div class="member-card-header">
            <div class="member-avatar">${initials(m.name)}</div>
            <div>
              <div class="member-card-name">${escHtml(m.name)}</div>
              <div class="member-card-sector">${escHtml(m.sector)} · ${escHtml(m.stage)}</div>
            </div>
          </div>
          ${m.bio ? `<div class="member-card-bio">${escHtml(m.bio)}</div>` : ''}
          <div class="tags-row">${tagsHtml(m.expertiseTags.slice(0, 3), 'amber')}</div>
          ${m.askTags.length ? `<div class="tags-row" style="margin-top:6px">${tagsHtml(m.askTags.slice(0, 2))}</div>` : ''}
          <div class="dm-cap-indicator">
            DMs this month: ${dmCount}/${Store.DM_CAP}
            <div class="dm-cap-bar"><div class="dm-cap-fill ${capFull ? 'full' : ''}" style="width:${capPct}%"></div></div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Member Modal ─────────────────────────────────────────────

  function showMemberModal(memberId) {
    const m = Store.getMember(memberId);
    if (!m) return;

    const dmCount = Store.getDmCountThisMonth(m.id);
    const dmLog = Store.getDmLog().filter(d => d.memberId === m.id);

    const html = `
      <div class="modal-member-header">
        <div class="modal-avatar">${initials(m.name)}</div>
        <div>
          <div class="modal-member-name">${escHtml(m.name)}</div>
          <div class="modal-member-sector">${escHtml(m.sector)} · ${escHtml(m.stage)}</div>
        </div>
      </div>
      ${m.bio ? `
      <div class="modal-section">
        <div class="modal-section-label">Bio</div>
        <div class="modal-section-value">${escHtml(m.bio)}</div>
      </div>` : ''}
      <div class="modal-section">
        <div class="modal-section-label">Expertise</div>
        <div class="tags-row">${tagsHtml(m.expertiseTags, 'amber')}</div>
      </div>
      ${m.askTags.length ? `
      <div class="modal-section">
        <div class="modal-section-label">Looking for help with</div>
        <div class="tags-row">${tagsHtml(m.askTags)}</div>
      </div>` : ''}
      ${m.email ? `
      <div class="modal-section">
        <div class="modal-section-label">Email</div>
        <div class="modal-section-value">${escHtml(m.email)}</div>
      </div>` : ''}
      ${m.linkedin ? `
      <div class="modal-section">
        <div class="modal-section-label">LinkedIn</div>
        <div class="modal-section-value"><a href="${escHtml(m.linkedin)}" target="_blank" style="color:var(--amber)">${escHtml(m.linkedin)}</a></div>
      </div>` : ''}
      <div class="modal-dm-history">
        <div class="modal-section-label">DM Activity — This Month: ${dmCount}/${Store.DM_CAP}</div>
        ${dmLog.length
          ? dmLog.slice(-5).reverse().map(d => `
              <div class="recent-item">
                <span class="recent-item-meta">${relativeDate(d.sentAt)}</span>
                <span style="font-size:12px;color:var(--text-3)">Queue item ${d.queueItemId}</span>
              </div>`).join('')
          : '<p style="font-size:13px;color:var(--text-3);margin-top:8px">No DMs sent yet.</p>'}
      </div>`;

    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('member-modal-overlay').style.display = 'flex';
  }

  function closeMemberModal() {
    document.getElementById('member-modal-overlay').style.display = 'none';
  }

  // ── Threads List ─────────────────────────────────────────────

  function renderThreads() {
    const container = document.getElementById('threads-list');
    const threads = [...Store.getThreads()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const members = Store.getMembers();

    if (!threads.length) {
      container.innerHTML = '<div class="empty-state"><p>No threads yet. Add one above.</p></div>';
      return;
    }

    container.innerHTML = threads.map(t => {
      const author = members.find(m => m.id === t.authorId);
      return `
        <div class="thread-item">
          <div class="thread-header">
            <div class="thread-title">${escHtml(t.title)}</div>
            <div class="thread-meta">${relativeDate(t.createdAt)}</div>
          </div>
          ${t.content ? `<div class="thread-content">${escHtml(t.content)}</div>` : ''}
          <div class="thread-footer">
            <div class="tags-row">${tagsHtml(t.tags)}</div>
            ${author ? `<div style="font-size:12px;color:var(--text-3)">by ${escHtml(author.name)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ── Thread author select ─────────────────────────────────────

  function populateThreadAuthorSelect() {
    const sel = document.getElementById('thread-author');
    const members = Store.getMembers();
    sel.innerHTML = '<option value="">Select member…</option>' +
      members.map(m => `<option value="${m.id}">${escHtml(m.name)}</option>`).join('');
  }

  // ── Seeker thread select ──────────────────────────────────────

  function populateSeekerThreadSelect() {
    const sel = document.getElementById('seeker-thread');
    const threads = Store.getThreads();
    sel.innerHTML = '<option value="">Choose a thread…</option>' +
      threads.map(t => `<option value="${t.id}">${escHtml(t.title)}</option>`).join('');
  }

  // ── Queue ────────────────────────────────────────────────────

  function renderQueue() {
    const container = document.getElementById('queue-list');
    const items = Store.getQueue();

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No items in queue. Run the agent to generate outreach.</p>
          <button class="btn btn-ghost" data-goto="run-agent">Run Agent</button>
        </div>`;
      return;
    }

    container.innerHTML = items.map(item => renderQueueItem(item)).join('');
  }

  function renderQueueItem(item) {
    const modeBadgeClass = {
      seeker: 'mode-badge-seeker',
      connector: 'mode-badge-connector',
      synthesizer: 'mode-badge-synthesizer',
    }[item.mode] || 'mode-badge-seeker';

    const statusClass = {
      pending: 'status-pending',
      approved: 'status-approved',
      discarded: 'status-discarded',
      sent: 'status-sent',
    }[item.status] || 'status-pending';

    const isPending = item.status === 'pending';
    const isEditing = item._editing;

    const contentBlock = isEditing ? `
      <div class="queue-edit-area">
        <div class="queue-subject-row">
          <label class="form-label" style="margin-bottom:6px">Subject Line</label>
          <input type="text" class="queue-subject-input" data-edit-subject="${item.id}" value="${escHtml(item.subjectLine || '')}" />
        </div>
        ${item.recipientNames && item.recipientNames.length ? `
        <div class="queue-recipients-row">
          <label class="form-label" style="margin-bottom:6px">Recipients <span class="form-hint">(comma-separated names)</span></label>
          <input type="text" class="queue-subject-input" data-edit-recipients="${item.id}" value="${escHtml(item.recipientNames.join(', '))}" />
        </div>` : ''}
        <textarea class="queue-edit-textarea" data-edit-content="${item.id}">${escHtml(item.content)}</textarea>
      </div>` : `
      <div class="queue-item-content truncated">${escHtml(item.content)}</div>`;

    const sendResultHtml = item.sendResult ? renderSendResult(item.sendResult) : '';

    const actions = isPending ? `
      <button class="btn btn-success btn-sm" data-action="approve-send" data-item-id="${item.id}">
        Approve &amp; Send
      </button>
      ${isEditing ? `
        <button class="btn btn-primary btn-sm" data-action="save-edit" data-item-id="${item.id}">Save</button>
        <button class="btn btn-ghost btn-sm" data-action="cancel-edit" data-item-id="${item.id}">Cancel</button>
      ` : `
        <button class="btn btn-ghost btn-sm" data-action="edit" data-item-id="${item.id}">Edit</button>
      `}
      <button class="btn btn-danger btn-sm" data-action="discard" data-item-id="${item.id}">Discard</button>
    ` : `
      <span class="queue-item-date" style="font-size:12px;color:var(--text-3)">
        ${item.status === 'discarded' ? 'Discarded' : item.status === 'sent' ? 'Sent' : 'Approved'}
      </span>
    `;

    const recipientsDisplay = item.recipientNames && item.recipientNames.length && !isEditing
      ? `<div class="queue-recipients-row">Recipients: ${escHtml(item.recipientNames.join(', '))}</div>`
      : '';

    return `
      <div class="queue-item" id="qi-${item.id}">
        <div class="queue-item-header">
          <div class="queue-item-meta">
            <span class="queue-mode-badge ${modeBadgeClass}">${item.mode}</span>
            <span class="queue-item-date">${relativeDate(item.createdAt)}</span>
          </div>
          <span class="queue-status-badge ${statusClass}">${item.status}</span>
        </div>
        <div class="queue-item-body">
          ${recipientsDisplay}
          ${contentBlock}
          ${sendResultHtml}
          <div class="queue-item-actions">${actions}</div>
        </div>
      </div>`;
  }

  function renderSendResult(result) {
    if (!result) return '';
    if (result.ok) {
      const sentNames = (result.sent || []).map(s => s.name).join(', ');
      const blockedParts = (result.blocked || []).map(b => `${b.name} (${b.reason})`).join(', ');
      let cls = result.blocked && result.blocked.length ? 'partial' : 'success';
      let msg = sentNames ? `Sent to: ${sentNames}` : '';
      if (blockedParts) msg += (msg ? ' · ' : '') + `Blocked: ${blockedParts}`;
      return `<div class="send-result ${cls}">${escHtml(msg)}</div>`;
    }
    return `<div class="send-result error">Send failed: ${escHtml(result.error || 'Unknown error')}</div>`;
  }

  // ── Queue badge ───────────────────────────────────────────────

  function updateQueueBadge() {
    const count = Store.getPendingQueueCount();
    const badge = document.getElementById('queue-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Tag input widget ─────────────────────────────────────────

  function initTagInput({ wrapId, displayId, inputId, hiddenId }) {
    const wrap = document.getElementById(wrapId);
    const display = document.getElementById(displayId);
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);

    if (!wrap || !display || !input || !hidden) return;

    let tags = [];

    function render() {
      display.innerHTML = tags.map((t, i) => `
        <span class="tag-pill">
          ${escHtml(t)}
          <span class="tag-pill-remove" data-tag-idx="${i}">×</span>
        </span>`).join('');
      hidden.value = JSON.stringify(tags);
    }

    function addTag(val) {
      const v = val.trim().toLowerCase();
      if (v && !tags.includes(v)) {
        tags.push(v);
        render();
      }
      input.value = '';
    }

    input.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
        e.preventDefault();
        addTag(input.value);
      }
      if (e.key === 'Backspace' && !input.value && tags.length) {
        tags.pop();
        render();
      }
    });

    display.addEventListener('click', e => {
      const idx = e.target.dataset.tagIdx;
      if (idx !== undefined) {
        tags.splice(Number(idx), 1);
        render();
      }
    });

    wrap.addEventListener('click', () => input.focus());

    return {
      getTags: () => [...tags],
      reset: () => { tags = []; render(); },
    };
  }

  // ── Toast ────────────────────────────────────────────────────

  function toast(msg, type) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type || ''}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  // ── Loading state in agent output ────────────────────────────

  function showAgentLoading() {
    const output = document.getElementById('agent-output');
    const content = document.getElementById('output-content');
    output.style.display = 'block';
    content.innerHTML = `
      <div class="loading-pulse">
        <div class="pulse-dots">
          <div class="pulse-dot"></div>
          <div class="pulse-dot"></div>
          <div class="pulse-dot"></div>
        </div>
        Agent is thinking…
      </div>`;
  }

  function showAgentResult(text) {
    const content = document.getElementById('output-content');
    content.textContent = text;
  }

  function hideAgentOutput() {
    document.getElementById('agent-output').style.display = 'none';
  }

  return {
    renderDashboard,
    renderMembersGrid,
    showMemberModal,
    closeMemberModal,
    renderThreads,
    populateThreadAuthorSelect,
    populateSeekerThreadSelect,
    renderQueue,
    renderQueueItem,
    renderSendResult,
    updateQueueBadge,
    initTagInput,
    toast,
    showAgentLoading,
    showAgentResult,
    hideAgentOutput,
    relativeDate,
    escHtml,
    initials,
  };
})();
