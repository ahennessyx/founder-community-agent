# Founder Community Agent

An AI-powered community management tool for a private LinkedIn group of zero-to-one stage founders. Built to demonstrate full-stack product thinking: a clean editorial UI, a multi-mode AI agent, a structured approval workflow, and a Node.js delivery backend with Gmail integration and audit logging.

---

## What it does

Community managers spend hours manually identifying who in a group has relevant expertise for a discussion, crafting personalized outreach, and making warm introductions. This tool automates that loop while keeping a human in the review seat before anything is sent.

The agent runs in three modes:

| Mode | What it does |
|---|---|
| **Seeker** | Takes an active discussion thread, finds the 2–4 members with the most relevant expertise, and drafts a personalized ≤80-word DM to each one |
| **Connector** | Scans the full member roster and surfaces 2–3 high-value pairings, then drafts warm intro messages for each |
| **Synthesizer** | Reads across all active threads and generates a pattern post, debate starter, poll, or resource recommendation for the community feed |

All output goes into a **review queue** — the admin can edit, approve, or discard each item before anything is sent. Approved items trigger real email delivery via the Gmail backend.

---

## Architecture

```
founder-community-agent/
├── index.html          # Single-page app — all six views
├── css/style.css       # Dark editorial theme (DM Serif Display + Instrument Sans)
├── js/
│   ├── store.js        # localStorage state manager + DM cap enforcement
│   ├── agent.js        # Claude API — three prompt strategies
│   ├── ui.js           # All rendering: cards, modals, queue, tag inputs
│   ├── delivery.js     # Fetch layer to POST /api/send
│   └── app.js          # Event handlers, nav, agent runner, queue actions
└── server/
    ├── server.js           # Express on port 3001
    ├── gmail-client.js     # Gmail MCP OAuth wrapper
    ├── recipient-resolver.js # Name → email + DM cap check
    ├── email-composer.js   # Subject lines, body, mandatory disclosure footer
    └── audit-log.js        # Append-only NDJSON audit trail
```

**Phase 1** is fully client-side — no backend required to explore the UI and run the agent.

**Phase 2** adds the Node.js/Express backend for Gmail delivery. Gmail OAuth credentials live in `.env` only — never in client JS. DM cap (2 per member per calendar month) is enforced from the audit log on every request, not from memory.

---

## Running it locally

### Phase 1 — frontend only

No install needed. Open `index.html` in any browser, or serve it statically:

```bash
cd founder-community-agent
python3 -m http.server 8080
# open http://localhost:8080
```

The app seeds six members and four discussion threads automatically on first load.

To run the agent, you need a Claude API key:
- Get one at [console.anthropic.com](https://console.anthropic.com) → API Keys
- Paste it into the **Claude API Key** field on the Run Agent page
- The key is never stored — it lives only in your browser session

### Phase 2 — with Gmail delivery

```bash
cd server
cp .env.example .env
# fill in Gmail OAuth credentials and admin details
npm install
npm start
# server runs on http://localhost:3001
```

Gmail OAuth setup: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID. You'll need a refresh token — the `.env.example` documents every required variable.

Once the server is running, the **Approve** button in the queue becomes **Approve & Send** and triggers real email delivery.

---

## Key design decisions

**DM cap from audit log, not memory.** The 2 DM/month limit per member is reconstructed from `audit.json` on every server request. If the server restarts, the cap state is exactly preserved.

**Disclosure footer is non-removable.** Every outgoing email appends a mandatory disclosure identifying it as AI-facilitated. This is enforced in `email-composer.js` and cannot be omitted by the frontend.

**Credentials never touch the client.** The Gmail OAuth token refresh and all email sending happen server-side only. The frontend sends approved content to `POST /api/send` — it never sees a token.

**Name resolution without fuzzy matching.** The recipient resolver does exact-match first, then first-name fallback (only if unambiguous). Unresolved names surface as warnings, not silent failures.

---

## Seed data

The app loads with six fictional founders and four discussion threads representing real zero-to-one stage problems:

- Priya Mehta — B2B SaaS / AI contract intelligence
- Marcus Trevino — Fintech / credit for gig workers
- Sofia Andersson — Climate Tech / carbon verification
- James Okafor — Marketplace / African manufacturers
- Lin Wei — EdTech / adaptive K-12 learning
- Amara Diallo — Health Tech / remote patient monitoring

Threads cover: hiring a first salesperson, PLG for B2B, getting deep tech pilots, and diagnosing retention problems.

---

## Stack

- **Frontend:** Vanilla JS, no framework, localStorage
- **AI:** Claude API (`claude-sonnet-4-20250514`) via direct browser fetch
- **Backend:** Node.js, Express, node-fetch
- **Email:** Gmail MCP (OAuth 2.0)
- **Fonts:** DM Serif Display, Instrument Sans (Google Fonts)
