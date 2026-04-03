/* ============================================================
   store.js — localStorage state manager
   ============================================================ */

const Store = (() => {
  const KEYS = {
    members: 'fca_members',
    threads:  'fca_threads',
    queue:    'fca_queue',
    dmLog:    'fca_dm_log',
    meta:     'fca_meta',
  };

  // ── Seed data ────────────────────────────────────────────────

  const SEED_MEMBERS = [
    {
      id: 'm1',
      name: 'Priya Mehta',
      sector: 'B2B SaaS',
      stage: 'early-revenue',
      linkedin: 'https://linkedin.com/in/priya-mehta',
      email: '',
      bio: 'Building AI-powered contract intelligence for mid-market legal teams. Ex-McKinsey. Obsessed with reducing time-to-close for enterprise deals.',
      expertiseTags: ['enterprise sales', 'AI products', 'legal tech', 'pricing strategy'],
      askTags: ['PLG', 'Series A fundraising'],
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    },
    {
      id: 'm2',
      name: 'Marcus Trevino',
      sector: 'Fintech',
      stage: 'pre-revenue',
      linkedin: 'https://linkedin.com/in/marcus-trevino',
      email: '',
      bio: 'Consumer credit alternative for gig workers. Background in consumer finance and regulatory affairs. Navigating complex compliance landscape.',
      expertiseTags: ['consumer finance', 'regulatory strategy', 'gig economy', 'credit scoring'],
      askTags: ['first hire', 'seed fundraising', 'bank partnerships'],
      createdAt: new Date(Date.now() - 86400000 * 25).toISOString(),
    },
    {
      id: 'm3',
      name: 'Sofia Andersson',
      sector: 'Climate Tech',
      stage: 'pre-revenue',
      linkedin: 'https://linkedin.com/in/sofia-andersson',
      email: '',
      bio: 'Developing carbon removal verification platform using satellite data + ML. Former climate policy researcher. Working to make carbon markets trustworthy.',
      expertiseTags: ['climate policy', 'satellite data', 'carbon markets', 'impact measurement'],
      askTags: ['enterprise GTM', 'deep tech fundraising', 'pilot customers'],
      createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
    {
      id: 'm4',
      name: 'James Okafor',
      sector: 'Marketplace',
      stage: 'early-revenue',
      linkedin: 'https://linkedin.com/in/james-okafor',
      email: '',
      bio: 'B2B marketplace connecting African manufacturers to global buyers. 3 years operating in Lagos. Solving last-mile logistics and payment trust.',
      expertiseTags: ['marketplace dynamics', 'supply chain', 'Africa ops', 'trade finance'],
      askTags: ['retention', 'unit economics', 'hiring ops team'],
      createdAt: new Date(Date.now() - 86400000 * 18).toISOString(),
    },
    {
      id: 'm5',
      name: 'Lin Wei',
      sector: 'EdTech',
      stage: 'pre-revenue',
      linkedin: 'https://linkedin.com/in/lin-wei',
      email: '',
      bio: 'Adaptive learning platform for K-12 math in Southeast Asia. Former teacher turned builder. Focused on outcomes-based pricing and school district sales.',
      expertiseTags: ['edtech', 'adaptive learning', 'K-12 sales', 'Southeast Asia'],
      askTags: ['district partnerships', 'pricing model', 'measuring learning outcomes'],
      createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    },
    {
      id: 'm6',
      name: 'Amara Diallo',
      sector: 'Health Tech',
      stage: 'early-revenue',
      linkedin: 'https://linkedin.com/in/amara-diallo',
      email: '',
      bio: 'Remote patient monitoring for chronic disease management in under-resourced clinics. Built on SMS + basic smartphones. Serving 12 clinics in West Africa.',
      expertiseTags: ['digital health', 'remote monitoring', 'low-resource markets', 'clinical validation'],
      askTags: ['scaling ops', 'insurance reimbursement', 'Series A prep'],
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
  ];

  const SEED_THREADS = [
    {
      id: 't1',
      title: 'How do you hire your first salesperson without a clear ICP yet?',
      authorId: 'm4',
      content: 'I keep hearing "hire someone who can figure it out" but also "hire someone with domain expertise." I\'ve had two bad hires already. What signals actually predict success for a first sales hire at zero-to-one stage?',
      tags: ['hiring', 'sales', 'early-stage'],
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    },
    {
      id: 't2',
      title: 'PLG for B2B: myth or real path to enterprise?',
      authorId: 'm1',
      content: 'We\'re debating whether to add a free tier. Our ACV is $40K so pure PLG feels like a stretch, but everyone talks about it. Anyone have experience using PLG as an enterprise top-of-funnel rather than the primary motion?',
      tags: ['PLG', 'B2B', 'growth strategy', 'enterprise'],
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    },
    {
      id: 't3',
      title: 'Getting your first 3 deep tech pilots without institutional backing',
      authorId: 'm3',
      content: 'Without a brand-name VC or corporate sponsor, how do you convince a enterprise to run a pilot with an unproven technical product? Would love to hear stories from anyone who\'s cracked this — especially in regulated industries.',
      tags: ['deep tech', 'pilots', 'enterprise sales', 'credibility'],
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    },
    {
      id: 't4',
      title: 'Diagnosing retention problems: where to start when everything is leaking',
      authorId: 'm5',
      content: 'Month 1 retention is 60%, month 3 is 30%. I have theories but no real signal yet. What frameworks or leading indicators helped you pinpoint the root cause early — before you had enough data for a rigorous cohort analysis?',
      tags: ['retention', 'metrics', 'product', 'churn'],
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
  ];

  // ── Init ─────────────────────────────────────────────────────

  function init() {
    const meta = _get(KEYS.meta) || {};
    if (!meta.seeded) {
      _set(KEYS.members, SEED_MEMBERS);
      _set(KEYS.threads, SEED_THREADS);
      _set(KEYS.queue, []);
      _set(KEYS.dmLog, []);
      _set(KEYS.meta, { seeded: true, version: 1 });
    }
    // Schema migration: ensure email field on all members
    _migrateMembers();
  }

  function _migrateMembers() {
    const members = _get(KEYS.members) || [];
    let changed = false;
    members.forEach(m => {
      if (m.email === undefined) { m.email = ''; changed = true; }
    });
    if (changed) _set(KEYS.members, members);
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function _set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function _genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // ── DM Cap ───────────────────────────────────────────────────

  const DM_CAP = 2;

  function _currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getDmCountThisMonth(memberId) {
    const log = _get(KEYS.dmLog) || [];
    const month = _currentMonthKey();
    return log.filter(e => e.memberId === memberId && e.month === month).length;
  }

  function canSendDm(memberId) {
    return getDmCountThisMonth(memberId) < DM_CAP;
  }

  function recordDm(memberId, queueItemId) {
    const log = _get(KEYS.dmLog) || [];
    log.push({
      id: _genId('dm'),
      memberId,
      queueItemId,
      month: _currentMonthKey(),
      sentAt: new Date().toISOString(),
    });
    _set(KEYS.dmLog, log);
  }

  function getDmLog() { return _get(KEYS.dmLog) || []; }

  // ── Members ──────────────────────────────────────────────────

  function getMembers() { return _get(KEYS.members) || []; }

  function getMember(id) {
    return getMembers().find(m => m.id === id) || null;
  }

  function getMemberByName(name) {
    const members = getMembers();
    const lower = name.toLowerCase().trim();
    // Exact match
    let m = members.find(m => m.name.toLowerCase() === lower);
    if (m) return m;
    // First-name fallback
    const matches = members.filter(m => m.name.split(' ')[0].toLowerCase() === lower);
    return matches.length === 1 ? matches[0] : null;
  }

  function addMember(data) {
    const members = getMembers();
    const member = {
      id: _genId('m'),
      name: data.name.trim(),
      sector: data.sector.trim(),
      stage: data.stage || 'pre-revenue',
      linkedin: data.linkedin || '',
      email: data.email || '',
      bio: data.bio || '',
      expertiseTags: data.expertiseTags || [],
      askTags: data.askTags || [],
      createdAt: new Date().toISOString(),
    };
    members.push(member);
    _set(KEYS.members, members);
    return member;
  }

  function updateMember(id, updates) {
    const members = getMembers();
    const idx = members.findIndex(m => m.id === id);
    if (idx === -1) return null;
    members[idx] = { ...members[idx], ...updates };
    _set(KEYS.members, members);
    return members[idx];
  }

  // ── Threads ──────────────────────────────────────────────────

  function getThreads() { return _get(KEYS.threads) || []; }

  function getThread(id) {
    return getThreads().find(t => t.id === id) || null;
  }

  function addThread(data) {
    const threads = getThreads();
    const thread = {
      id: _genId('t'),
      title: data.title.trim(),
      authorId: data.authorId || null,
      content: data.content || '',
      tags: data.tags || [],
      createdAt: new Date().toISOString(),
    };
    threads.push(thread);
    _set(KEYS.threads, threads);
    return thread;
  }

  // ── Queue ────────────────────────────────────────────────────

  function getQueue() { return _get(KEYS.queue) || []; }

  function addToQueue(data) {
    const queue = getQueue();
    const item = {
      id: _genId('q'),
      mode: data.mode,
      content: data.content,
      recipientNames: data.recipientNames || [],
      subjectLine: data.subjectLine || '',
      adminNote: data.adminNote || '',
      status: 'pending',
      sendResult: null,
      createdAt: new Date().toISOString(),
    };
    queue.unshift(item);
    _set(KEYS.queue, queue);
    return item;
  }

  function updateQueueItem(id, updates) {
    const queue = getQueue();
    const idx = queue.findIndex(q => q.id === id);
    if (idx === -1) return null;
    queue[idx] = { ...queue[idx], ...updates };
    _set(KEYS.queue, queue);
    return queue[idx];
  }

  function getPendingQueueCount() {
    return getQueue().filter(q => q.status === 'pending').length;
  }

  function getTotalSentCount() {
    return (getDmLog()).length;
  }

  // ── Public API ───────────────────────────────────────────────

  return {
    init,
    // Members
    getMembers, getMember, getMemberByName, addMember, updateMember,
    // Threads
    getThreads, getThread, addThread,
    // Queue
    getQueue, addToQueue, updateQueueItem, getPendingQueueCount,
    // DM Cap
    getDmCountThisMonth, canSendDm, recordDm, getDmLog,
    getTotalSentCount,
    DM_CAP,
  };
})();
