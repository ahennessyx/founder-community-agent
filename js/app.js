/* ============================================================
   app.js — Event handlers, navigation, agent runner, queue actions
   ============================================================ */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────

  let currentPage = 'dashboard';
  let activeMode = 'seeker';
  let lastAgentOutput = null;
  let expertiseTagInput, askTagInput, threadTagInput;
  // Track which queue items are in edit mode (by id)
  const editingItems = new Set();

  // ── Init ──────────────────────────────────────────────────────

  Store.init();
  navigateTo('dashboard');
  setupNavigation();
  setupTagInputs();
  setupMemberForm();
  setupThreadForm();
  setupAgentRunner();
  setupQueueActions();
  setupMemberModal();
  setupSearch();

  // ── Navigation ────────────────────────────────────────────────

  function navigateTo(page) {
    currentPage = page;

    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');

    // Page-specific setup on enter
    switch (page) {
      case 'dashboard':
        UI.renderDashboard();
        break;
      case 'members':
        UI.renderMembersGrid();
        break;
      case 'threads':
        UI.renderThreads();
        UI.populateThreadAuthorSelect();
        document.getElementById('add-thread-form-card').style.display = 'none';
        break;
      case 'run-agent':
        UI.populateSeekerThreadSelect();
        UI.hideAgentOutput();
        break;
      case 'queue':
        UI.renderQueue();
        break;
    }

    UI.updateQueueBadge();
    window.scrollTo(0, 0);
  }

  function setupNavigation() {
    // Sidebar nav items
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(el.dataset.page);
      });
    });

    // data-goto buttons anywhere
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-goto]');
      if (btn) navigateTo(btn.dataset.goto);
    });
  }

  // ── Tag Inputs ────────────────────────────────────────────────

  function setupTagInputs() {
    expertiseTagInput = UI.initTagInput({
      wrapId: 'expertise-tag-wrap',
      displayId: 'expertise-tags-display',
      inputId: 'expertise-tag-input',
      hiddenId: 'expertise-tags-value',
    });

    askTagInput = UI.initTagInput({
      wrapId: 'ask-tag-wrap',
      displayId: 'ask-tags-display',
      inputId: 'ask-tag-input',
      hiddenId: 'ask-tags-value',
    });

    threadTagInput = UI.initTagInput({
      wrapId: 'thread-tag-wrap',
      displayId: 'thread-tags-display',
      inputId: 'thread-tag-input',
      hiddenId: 'thread-tags-value',
    });
  }

  // ── Add Member Form ───────────────────────────────────────────

  function setupMemberForm() {
    const form = document.getElementById('add-member-form');
    const cancelBtn = document.getElementById('cancel-add-member');

    form.addEventListener('submit', e => {
      e.preventDefault();

      const name = document.getElementById('member-name').value.trim();
      const sector = document.getElementById('member-sector').value.trim();
      if (!name || !sector) {
        UI.toast('Name and sector are required.', 'error');
        return;
      }

      Store.addMember({
        name,
        sector,
        stage: document.getElementById('member-stage').value,
        linkedin: document.getElementById('member-linkedin').value.trim(),
        email: document.getElementById('member-email').value.trim(),
        bio: document.getElementById('member-bio').value.trim(),
        expertiseTags: expertiseTagInput.getTags(),
        askTags: askTagInput.getTags(),
      });

      form.reset();
      expertiseTagInput.reset();
      askTagInput.reset();
      UI.toast(`${name} added to the community.`, 'success');
      navigateTo('members');
    });

    cancelBtn.addEventListener('click', () => navigateTo('members'));
  }

  // ── Add Thread Form ───────────────────────────────────────────

  function setupThreadForm() {
    const showBtn = document.getElementById('show-add-thread');
    const formCard = document.getElementById('add-thread-form-card');
    const form = document.getElementById('add-thread-form');
    const cancelBtn = document.getElementById('cancel-add-thread');

    showBtn.addEventListener('click', () => {
      formCard.style.display = 'block';
      UI.populateThreadAuthorSelect();
      formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    cancelBtn.addEventListener('click', () => {
      formCard.style.display = 'none';
      form.reset();
      threadTagInput.reset();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const title = document.getElementById('thread-title').value.trim();
      if (!title) {
        UI.toast('Thread title is required.', 'error');
        return;
      }

      Store.addThread({
        title,
        authorId: document.getElementById('thread-author').value || null,
        content: document.getElementById('thread-content').value.trim(),
        tags: threadTagInput.getTags(),
      });

      form.reset();
      threadTagInput.reset();
      formCard.style.display = 'none';
      UI.renderThreads();
      UI.populateSeekerThreadSelect();
      UI.toast('Thread added.', 'success');
    });
  }

  // ── Agent Runner ──────────────────────────────────────────────

  function setupAgentRunner() {
    // Mode selection
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeMode = card.dataset.mode;

        document.querySelectorAll('.agent-config').forEach(c => c.classList.add('hidden'));
        document.getElementById(`config-${activeMode}`)?.classList.remove('hidden');

        UI.hideAgentOutput();
        lastAgentOutput = null;
      });
    });

    // Run button
    document.getElementById('run-agent-btn').addEventListener('click', runAgent);
  }

  async function runAgent() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    if (!apiKey) {
      UI.toast('Please enter your Claude API key.', 'error');
      return;
    }

    const btn = document.getElementById('run-agent-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="pulse-dots"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div> Running…`;

    UI.showAgentLoading();
    lastAgentOutput = null;

    try {
      let result;
      switch (activeMode) {
        case 'seeker': {
          const threadId = document.getElementById('seeker-thread').value;
          if (!threadId) { UI.toast('Please select a thread.', 'error'); throw null; }
          const context = document.getElementById('seeker-context').value.trim();
          result = await Agent.runSeeker({ threadId, context, apiKey });
          break;
        }
        case 'connector': {
          const focus = document.getElementById('connector-focus').value.trim();
          const notes = document.getElementById('connector-notes').value.trim();
          result = await Agent.runConnector({ focus, notes, apiKey });
          break;
        }
        case 'synthesizer': {
          const format = document.querySelector('input[name="synth-format"]:checked')?.value || 'pattern_post';
          const theme = document.getElementById('synth-theme').value.trim();
          result = await Agent.runSynthesizer({ format, theme, apiKey });
          break;
        }
      }

      lastAgentOutput = result;
      UI.showAgentResult(result);
      UI.toast('Agent completed. Review the output below.', 'success');
    } catch (err) {
      if (err) {
        UI.showAgentResult(`Error: ${err.message}`);
        UI.toast(err.message, 'error');
      } else {
        UI.hideAgentOutput();
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Agent`;
    }
  }

  // Add to queue
  document.getElementById('add-to-queue-btn').addEventListener('click', () => {
    if (!lastAgentOutput) {
      UI.toast('No agent output to queue.', 'error');
      return;
    }

    const recipientNames = Agent.parseRecipientNames(lastAgentOutput);
    const subjectLine = Agent.generateSubjectLine(activeMode, recipientNames);

    Store.addToQueue({
      mode: activeMode,
      content: lastAgentOutput,
      recipientNames,
      subjectLine,
    });

    UI.updateQueueBadge();
    UI.toast('Added to outreach queue.', 'info');
    lastAgentOutput = null;
    UI.hideAgentOutput();
  });

  // ── Queue Actions ─────────────────────────────────────────────

  function setupQueueActions() {
    document.getElementById('queue-list').addEventListener('click', handleQueueClick);
  }

  function handleQueueClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) {
      // Handle data-goto within queue
      const gotoEl = e.target.closest('[data-goto]');
      if (gotoEl) navigateTo(gotoEl.dataset.goto);
      return;
    }

    const { action, itemId } = actionEl.dataset;

    switch (action) {
      case 'edit':
        startEditQueueItem(itemId);
        break;
      case 'save-edit':
        saveQueueItemEdit(itemId);
        break;
      case 'cancel-edit':
        cancelQueueItemEdit(itemId);
        break;
      case 'approve-send':
        approveSend(itemId);
        break;
      case 'discard':
        discardQueueItem(itemId);
        break;
    }
  }

  function startEditQueueItem(id) {
    editingItems.add(id);
    const item = Store.getQueue().find(q => q.id === id);
    if (!item) return;
    item._editing = true;
    const el = document.getElementById(`qi-${id}`);
    if (el) el.outerHTML = UI.renderQueueItem(item);
  }

  function saveQueueItemEdit(id) {
    const contentEl = document.querySelector(`[data-edit-content="${id}"]`);
    const subjectEl = document.querySelector(`[data-edit-subject="${id}"]`);
    const recipientsEl = document.querySelector(`[data-edit-recipients="${id}"]`);

    const updates = { _editing: false };
    if (contentEl) updates.content = contentEl.value;
    if (subjectEl) updates.subjectLine = subjectEl.value;
    if (recipientsEl) {
      updates.recipientNames = recipientsEl.value.split(',').map(n => n.trim()).filter(Boolean);
    }

    Store.updateQueueItem(id, updates);
    editingItems.delete(id);
    UI.renderQueue();
    UI.toast('Changes saved.', 'success');
  }

  function cancelQueueItemEdit(id) {
    editingItems.delete(id);
    Store.updateQueueItem(id, { _editing: false });
    UI.renderQueue();
  }

  async function approveSend(id) {
    const item = Store.getQueue().find(q => q.id === id);
    if (!item || item.status !== 'pending') return;

    const btn = document.querySelector(`[data-action="approve-send"][data-item-id="${id}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }

    try {
      const result = await Delivery.send({
        queueItemId: item.id,
        mode: item.mode,
        content: item.content,
        recipientNames: item.recipientNames || [],
        subjectLine: item.subjectLine || '',
        adminNote: item.adminNote || '',
      });

      Store.updateQueueItem(id, {
        status: result.ok ? 'sent' : 'pending',
        sendResult: result,
      });

      // Record DM in local store for cap tracking
      if (result.ok && result.sent) {
        result.sent.forEach(s => {
          const member = Store.getMemberByName(s.name);
          if (member) Store.recordDm(member.id, id);
        });
      }

      UI.renderQueue();
      UI.updateQueueBadge();
      UI.renderDashboard();

      if (result.ok) {
        const sentCount = (result.sent || []).length;
        const blockedCount = (result.blocked || []).length;
        if (blockedCount > 0) {
          UI.toast(`Sent to ${sentCount}, blocked ${blockedCount} (cap reached).`, 'info');
        } else {
          UI.toast(`Sent to ${sentCount} recipient${sentCount !== 1 ? 's' : ''}.`, 'success');
        }
      } else {
        UI.toast(`Send failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      UI.toast(`Delivery error: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Approve & Send'; }
    }
  }

  function discardQueueItem(id) {
    Store.updateQueueItem(id, { status: 'discarded' });
    UI.renderQueue();
    UI.updateQueueBadge();
    UI.toast('Item discarded.', '');
  }

  // ── Member Modal ──────────────────────────────────────────────

  function setupMemberModal() {
    document.getElementById('members-grid').addEventListener('click', e => {
      const card = e.target.closest('.member-card');
      if (card) UI.showMemberModal(card.dataset.memberId);
    });

    document.getElementById('modal-close').addEventListener('click', UI.closeMemberModal);
    document.getElementById('member-modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('member-modal-overlay')) UI.closeMemberModal();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') UI.closeMemberModal();
    });
  }

  // ── Search ────────────────────────────────────────────────────

  function setupSearch() {
    document.getElementById('member-search').addEventListener('input', e => {
      UI.renderMembersGrid(e.target.value);
    });
  }

})();
