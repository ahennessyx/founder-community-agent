/* ============================================================
   agent.js — Claude API integration (three modes)
   Model: claude-sonnet-4-20250514
   ============================================================ */

const Agent = (() => {
  const MODEL = 'claude-sonnet-4-20250514';
  const API_URL = 'https://api.anthropic.com/v1/messages';

  // ── Shared prompt helpers ────────────────────────────────────

  function _memberSummary(members) {
    return members.map(m => {
      const dmCount = Store.getDmCountThisMonth(m.id);
      const capNote = dmCount >= Store.DM_CAP ? ' [DM CAP REACHED]' : ` [DMs this month: ${dmCount}/${Store.DM_CAP}]`;
      return [
        `Name: ${m.name}`,
        `Sector: ${m.sector} | Stage: ${m.stage}`,
        `Bio: ${m.bio}`,
        `Expertise: ${m.expertiseTags.join(', ')}`,
        `Asking for help with: ${m.askTags.join(', ')}`,
        capNote,
      ].join('\n');
    }).join('\n\n---\n\n');
  }

  function _threadSummary(threads, members) {
    return threads.map(t => {
      const author = members.find(m => m.id === t.authorId);
      return [
        `Title: ${t.title}`,
        `Author: ${author ? author.name : 'Unknown'}`,
        `Tags: ${t.tags.join(', ')}`,
        `Content: ${t.content}`,
      ].join('\n');
    }).join('\n\n---\n\n');
  }

  // ── Mode: Seeker ─────────────────────────────────────────────
  // Finds members with relevant expertise for a thread.
  // Drafts targeted DMs ≤80 words per member.

  async function runSeeker({ threadId, context, apiKey }) {
    const thread = Store.getThread(threadId);
    if (!thread) throw new Error('Thread not found');

    const members = Store.getMembers();
    const memberData = _memberSummary(members);

    const systemPrompt = `You are a thoughtful community facilitator for a private group of zero-to-one stage founders. Your job is to identify which community members can meaningfully contribute to a discussion thread, then draft a personalized, direct message to each one.

Guidelines:
- Only select members who have genuinely relevant expertise or experience
- Skip any member marked [DM CAP REACHED]
- Each DM must be ≤80 words, warm but direct, reference the thread topic specifically
- Never be generic — show you've read their profile
- Address the recipient by first name
- Identify the message as coming from the community facilitator
- Output format: for each selected member, write "RECIPIENT: [Full Name]" then the DM body
- If no members are a strong match, say so clearly`;

    const userPrompt = `THREAD:
Title: ${thread.title}
Content: ${thread.content}
Tags: ${thread.tags.join(', ')}

ADDITIONAL CONTEXT FROM ADMIN:
${context || 'None provided'}

COMMUNITY MEMBERS:
${memberData}

Please identify 2-4 members who can contribute most meaningfully to this thread and draft a personalized DM for each.`;

    return await _callClaude(systemPrompt, userPrompt, apiKey);
  }

  // ── Mode: Connector ──────────────────────────────────────────
  // Surfaces 2-3 high-value member pairings with intro messages.

  async function runConnector({ focus, notes, apiKey }) {
    const members = Store.getMembers();
    const memberData = _memberSummary(members);

    const systemPrompt = `You are a skilled community connector for a private founder group. Your job is to surface 2-3 high-value member pairings where an introduction would genuinely benefit both founders.

Guidelines:
- Look for complementary expertise, shared problems, or potential collaborations
- Skip any member marked [DM CAP REACHED] for the intro message
- For each pairing: explain WHY this introduction is valuable (2-3 sentences), then write a warm intro message addressed to both members
- The intro message should reference something specific from each person's profile
- Format: "PAIRING: [Name A] ↔ [Name B]" then "WHY:" then "INTRO MESSAGE:"`;

    const userPrompt = `FOCUS AREA: ${focus || 'General — find the most compelling pairings across the community'}

ADMIN NOTES: ${notes || 'None provided'}

COMMUNITY MEMBERS:
${memberData}

Please identify 2-3 high-value pairings and draft introduction messages.`;

    return await _callClaude(systemPrompt, userPrompt, apiKey);
  }

  // ── Mode: Synthesizer ────────────────────────────────────────
  // Reads across threads to produce insight content.

  async function runSynthesizer({ format, theme, apiKey }) {
    const threads = Store.getThreads();
    const members = Store.getMembers();
    const threadData = _threadSummary(threads, members);

    const FORMAT_INSTRUCTIONS = {
      pattern_post: `Write a "Pattern Post" — a short, punchy observation (200-300 words) that identifies a recurring pattern or tension across multiple threads. Frame it as an insight post for the community feed. Start with a bold claim, then support it with 2-3 specific observations from the threads. End with an open question.`,
      debate_starter: `Write a "Debate Starter" — a provocative, balanced framing of a genuine tension visible across the threads (150-200 words). Present two opposing views that reasonable founders might hold. End with a direct question that forces a choice. Avoid straw-man arguments.`,
      poll: `Write a poll question and 3-4 answer options based on a real debate visible across the threads. Format:
POLL QUESTION: [question]
Options:
A) [option]
B) [option]
C) [option]
D) [option — optional]
CONTEXT: [1-2 sentence explanation of why this question matters to the community]`,
      resource_rec: `Write a "Resource Recommendation" — curate 3-4 highly specific resources (frameworks, articles, books, or mental models) that would directly address the most common challenges visible across the threads. For each resource: name it, explain why it's relevant to what this community is working through (1-2 sentences), and suggest which member challenges it addresses.`,
    };

    const systemPrompt = `You are an insightful community curator for a private founder group. Your job is to read across all active discussion threads and synthesize meaningful content that sparks conversation and learning.

${FORMAT_INSTRUCTIONS[format] || FORMAT_INSTRUCTIONS.pattern_post}

Base your output on the actual thread content provided — be specific, not generic.`;

    const userPrompt = `THEME FOCUS: ${theme || 'Read across all threads and identify the most compelling synthesis opportunity'}

COMMUNITY THREADS:
${threadData}

Please generate the requested content format.`;

    return await _callClaude(systemPrompt, userPrompt, apiKey);
  }

  // ── Core API call ─────────────────────────────────────────────

  async function _callClaude(systemPrompt, userPrompt, apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      throw new Error('Invalid or missing Claude API key. Key must start with sk-ant-');
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Claude API error: ${msg}`);
    }

    const data = await response.json();
    if (!data.content || !data.content[0]) throw new Error('Empty response from Claude API');
    return data.content[0].text;
  }

  // ── Parse recipient names from agent output ──────────────────

  function parseRecipientNames(output) {
    const names = [];
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^RECIPIENT:\s*(.+)$/i);
      if (match) names.push(match[1].trim());
      // Also handle PAIRING: Name A ↔ Name B
      const pairingMatch = line.match(/^PAIRING:\s*(.+)\s*↔\s*(.+)$/i);
      if (pairingMatch) {
        names.push(pairingMatch[1].trim());
        names.push(pairingMatch[2].trim());
      }
    }
    return [...new Set(names)];
  }

  // ── Generate subject line by mode ────────────────────────────

  function generateSubjectLine(mode, recipientNames) {
    switch (mode) {
      case 'seeker':
        return `[Community] Your experience — would love your perspective`;
      case 'connector':
        if (recipientNames.length >= 2) {
          const a = recipientNames[0].split(' ')[0];
          const b = recipientNames[1].split(' ')[0];
          return `[Community] Introduction: ${a} ↔ ${b}`;
        }
        return `[Community] A connection for you`;
      case 'synthesizer':
        return `[Community] A conversation starter for the group`;
      default:
        return `[Community] Message from your community facilitator`;
    }
  }

  return {
    runSeeker,
    runConnector,
    runSynthesizer,
    parseRecipientNames,
    generateSubjectLine,
  };
})();
