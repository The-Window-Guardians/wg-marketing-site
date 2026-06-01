# Window Guardians — Front-End Prototype → Backend Handoff

**Read this first.** This folder is a **front-end-only prototype** (HTML + CSS + vanilla JS + jQuery).
There is **no backend yet**. Your job is to build the PHP + MySQL backend behind it. Nothing in the
UI should need to change when you swap the data layer — the data access is deliberately isolated.

All third-party libraries (jQuery, Font Awesome, Inter font) are downloaded **locally** under `assets/`.
There are **no CDN dependencies** — keep it that way.

---

## 1. Folder structure

```
prototype/
├── index.html          → Dashboard (this is the home page)
├── plan.html           → The 12-week plan
├── scorecard.html      → KPIs / scorecard
├── guides.html         → Reference guides
├── files.html          → File uploads (grouped by week + person)
├── strategy.html       → Strategy reference
├── audit.html          → SEO audit findings
├── settings.html       → Settings / export-import / reset
├── founder.html        → OWNER-ONLY wrapper page (see §6)
├── founder-dashboard.html → Sebastian's operating dashboard (separate self-contained app, embedded)
└── assets/
    ├── css/style.css            → all design (light theme) + @font-face + FA import
    ├── css/fontawesome.min.css  → rewired to local ../fonts/
    ├── js/jquery.min.js         → jQuery 3.7.1 (local)
    ├── js/scripts.js            → ALL data + logic for the Marketing OS (see §3)
    ├── fonts/                   → Inter (5 weights) + Font Awesome woff2 (local)
    └── images/
```

Each `.html` page is a **thin shell**: identical chrome (login gate + top bar + sidebar), differing only
by `<body data-view="...">`. All of them load the same `assets/js/scripts.js`, which renders the right
view based on that `data-view` attribute.

**Suggested backend conversion:** turn each `*.html` into `*.php`, move the shared chrome
(gate + top bar + sidebar) into a single PHP include, and convert the JS `viewXxx()` render functions
into server-rendered templates fed by the same data objects (`WEEKS`, `KPIS`, `PEOPLE`, `AUDIT`, …).

---

## 2. Where data lives RIGHT NOW (and where you plug in)

| Concern | Prototype (now) | Backend (you build) |
|---|---|---|
| App state (task progress, KPIs, notes, handoff text) | `localStorage["wg_mktg_os_v2"]` via `Store.load()/Store.save()` in `scripts.js` | A `state` row (JSON) or normalized tables in MySQL; GET/POST `state.php` |
| File uploads | IndexedDB (`db()/fileAdd/fileList/...` in `scripts.js`) | PHP upload endpoints + a `files` table + disk/S3 blob storage |
| Login ("pick your name" gate) | role string saved in state; **no security** | Real PHP session login; map the 3 roles to user accounts |
| Founder dashboard data | `localStorage["wg_dashboard_v2"]` (inside `founder-dashboard.html`) | Same backend; its own tables |
| Cross-app feed (Marketing → Founder) | `localStorage["wg_mktg_feed_v1"]` (see §5) | A read-only API/SQL view: `GET marketing_feed.php` |

Every hook point above is marked in the code with a `BACKEND HOOK` comment. Search the codebase for
`BACKEND HOOK` to find them all.

### The data-access seam (the ONLY place to swap)
In `assets/js/scripts.js`, near the top:
```js
const Store = {
  load(){ /* reads localStorage */ },
  save(s){ /* writes localStorage  ← also POST to MySQL here */ }
};
```
Replace the bodies of `load()` and `save()` with API calls. The rest of the app calls `Store.load()`
once into a variable `S`, mutates `S`, and calls `commit()` (which calls `Store.save(S)`). That's the
whole contract.

---

## 3. The Marketing OS data model (`scripts.js`)

Static definitions (these become DB seed data / config):
- `PEOPLE` — the 3 team members (sebastian / bogdan / ruth): name, role, avatar, colors.
- `ORDER` — display order of people.
- `WEEKS` — the 12-week plan. Each week: `{id, phase, due:'YYYY-MM-DD', title, roles:{ <person>:{est, sum, steps:[...], handoff} }}`.
- `DELIVERIES` — who must hand what to whom each week, keyed `"<week>.<person>"`.
- `KPIS`, `AUDIT`, `PHASES`, guides data, etc.

Per-user **progress** (this is the mutable state you persist):
- `S.tasks["<week>.<person>"] = { steps:{0:true,1:false,...}, roll:false, note:"" }`
- `S.kpis["<kpiId>"] = number`
- `S.deliv["<week>.<person>"] = { text:"...", files:[...] }`  ← the "Deliver to…" handoff messages
- `S.role` — who is logged in.

**Deadlines:** every deliverable in a given week is due that week's **Tuesday at 12:00 PM (noon)**.
The `due` field on each `WEEKS` entry is that Tuesday.

---

## 4. Roles & login (NOT secure yet)

The "pick your name" gate just stores a role string. **This is not authentication.** Anyone can pick any
name. You must build real server-side auth (PHP sessions) and map the three roles to user accounts:
- `sebastian` — Owner. Content + approvals. **Only role allowed into Founder HQ (§6).**
- `bogdan` — Web developer / builder.
- `ruth` — Execution (reviews, data, photos).

The system is built to add more people later (extend `PEOPLE` + `ORDER`).

---

## 5. Cross-app feed contract (Marketing OS → Founder HQ)

The Founder dashboard (`founder-dashboard.html`) is a **separate app** that cannot see the Marketing OS's
internal task definitions. So the Marketing OS **publishes a fully-resolved snapshot** that the Founder
dashboard reads. This is the contract you'll reproduce as a backend endpoint.

- **Producer:** `publishFeed()` in `scripts.js` writes `localStorage["wg_mktg_feed_v1"]` on every save.
- **Consumer:** `readMktgFeed()` in `founder-dashboard.html` reads it (READ-ONLY — never writes back).

Feed shape:
```jsonc
{
  "v": 1,
  "generatedAt": 1730000000000,
  "order": ["bogdan","ruth","sebastian"],
  "people": { "bogdan": {"name","c","bg","av","role"}, ... },
  "weeks": [
    { "id":1, "due":"2026-06-02", "title":"...", "phase":1,
      "roles": { "sebastian": { "sum","est","handoff","note",
                                "steps":[{"txt","done"}], "total":3, "done":2 } } }
  ],
  "messages": [ { "week":1, "from":"sebastian", "to":["bogdan","ruth"], "text":"...", "files":0 } ],
  "kpis": [ { "id":"reviews", "label":"New Google reviews", "value":7, "target":45 } ]
}
```

**Backend version:** replace `publishFeed()` with nothing (the data is already in the DB) and replace
`readMktgFeed()` with `GET marketing_feed.php`, which returns the same JSON shape from a SQL query/view.

---

## 6. Founder HQ (owner-only)

- `founder.html` is a thin owner-gated wrapper. It shows a "← Marketing OS" bar and embeds
  `founder-dashboard.html` (Sebastian's operating dashboard, an intact self-contained app) in an iframe.
- The Founder HQ nav tab only renders for `role === "sebastian"` (see `isOwner()/navVisible()` in `scripts.js`),
  and `founder.html` redirects/denies non-owners.
- **This front-end gate is a deterrent, NOT security.** Enforce owner-only access **server-side** — the
  Founder dashboard and the `marketing_feed` endpoint must reject non-owner sessions.
- Inside the Founder dashboard, a **"Marketing" tab** shows the full team feed, and the **Today** view shows
  a "Due today" alert when a deadline lands that day. Both are read-only mirrors of the feed in §5.

---

## 7. Suggested MySQL schema (starting point)

```sql
users        (id, name, email, role, password_hash, created_at)
weeks        (id, phase, due_date, title)                     -- seed from WEEKS
week_roles   (week_id, user_role, summary, est, handoff)      -- the per-person block
steps        (id, week_id, user_role, idx, text)              -- seed from WEEKS[].roles[].steps
step_state   (user_id, step_id, done, updated_at)             -- mutable progress
kpis         (id, label, target)                              -- seed from KPIS
kpi_state    (kpi_id, value, updated_at)
deliveries   (id, week_id, from_role, to_role, need)          -- seed from DELIVERIES
deliv_msgs   (id, week_id, from_role, text, created_at)       -- the "Deliver to…" text
files        (id, name, type, size, week_id, by_user, deliv_key, created_at, blob_path)
```
The `marketing_feed.php` endpoint is essentially a join across weeks/steps/step_state/kpis/deliv_msgs
returning the §5 JSON.

## 8. Ground rules (carry these into the backend)

- **Never put any secret (DB credentials, API keys) in the front-end files.** Keep them server-side.
- All libraries stay **local** — no CDNs.
- Town/location pages must be **genuinely local content**, never a templated city-swap.
- Don't touch the live single-file dashboards elsewhere on Sebastian's machine — this prototype is the
  next-gen build; the live ones keep running until you cut over.

---

*Prototype built as a front-end handoff. Questions go to Sebastian.*
