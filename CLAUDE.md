# ProjMgt.AI — Claude Session Memory

**Last updated:** 2026-04-25
**Audience:** AI coding assistants (future Claude sessions) working on ProjMgt.AI
**Purpose:** Snapshot of the dev environment, canonical file locations, deploy procedures, and landmines. Read this first.

---

## 1. Product overview

**ProjMgt.AI** is an AI-native estimating platform for architectural woodwork, millwork, and casework companies. It takes architectural plan PDFs (multi-upload supported) and outputs a structured Excel workbook via a sequential AI agent pipeline.

- **Owner:** Gary Reinhold, Founder & CEO, Centriv AI. Retired USMC Lt. Colonel.
- **Primary test case:** North County Cabinetry (NCC, est. 1980, Fullerton CA, License 1007884 C-6).
- **Current version:** v14.9.39 (git HEAD); the nav bar displays v14.9.38 because v14.9.39 added functionality without bumping the display string. This is not a bug.
- **Primary proof point:** 24 Hour Fitness Ventura — $78,875 bid, multi-PDF upload, seven-tab Excel output.

## 2. Three separate products, three separate repos

Future sessions often conflate these. They are **separate repos with separate deployments**.

| Product | Repo | Local path | Live URL |
|---|---|---|---|
| Frontend / scope extractor | `GReinhold-ai/projmgtai-landing` | `F:\Dev\projmgtai-landing\` | https://www.projmgt.ai |
| Backend API (FastAPI/Python) | `GReinhold-ai/ProjMgt.ai` | `C:\Dev\projmgtai_production\` | https://api.projmgt.ai |
| Estimator outreach agent | `GReinhold-ai/estimator-outreach-agent` | `C:\Dev\estimator-outreach-agent\` | https://estimator-outreach-agent.vercel.app |

**All three** deploy via Vercel under the **RewmoAI** team.

## 3. Tech stack

- **Frontend:** Next.js (App Router preferred; Pages Router for API routes) + TypeScript + Tailwind + SheetJS client-side Excel generation
- **Backend API:** FastAPI + Python on Vercel serverless
- **Database:** **Supabase** (project `sceogtrqayzgnehnwymp`) — primary data store. Shared between ProjMgt.AI and the outreach agent.
- **AI:** Anthropic Claude API — model `claude-sonnet-4-20250514`
- **PDF parsing:** pdf.js client-side (`app/scope-extractor/page.tsx`) + Claude Sonnet 4 server-side (`pages/api/scope-extractor-v14.ts`). The server does NOT use pdfplumber in production.
- **Email:** SendGrid Essentials 50K plan, verified sender `outreach@projmgt.ai`, reply-to `greinhold@rewmo.ai`
- **Storage:** Vercel Blob (`projmgtai-uploads` store) for PDF captures from lead users
- **DNS:** GoDaddy (projmgt.ai and rewmo.ai)

Firebase is referenced in earlier handoffs but is NOT the primary database. Supabase is.

## 4. Repository directory map (F: and C: drives)

**Active and canonical (DO NOT touch naming):**
- `F:\Dev\projmgtai-landing\` — frontend repo (Vercel deploys this)
- `C:\Dev\projmgtai_production\` — backend repo
- `C:\Dev\estimator-outreach-agent\` — outreach agent repo

**Archived on 2026-04-25 (do not use):**
- `C:\Dev\projmgtai-landing_ARCHIVE_2026-04-25\` — empty pre-git directory
- `C:\Dev\projmgtai-landing-v2_ARCHIVE_2026-04-25\` — stale duplicate of frontend, 18 days behind main
- `F:\Dev\projmgtai_parser_minimal_ARCHIVE_2026-04-25\` — 7 months stale
- `C:\Dev\scout-bulk-v3_ARCHIVE_2026-04-25\` — patch staging bundle
- `C:\Dev\scout-linkedin-update_ARCHIVE_2026-04-25\` — patch staging bundle

**Active but NOT git-controlled (leave alone):**
- `C:\Dev\projmgtai_parser_minimal\` — local parser scratch/experimentation area, contains v14.9.0 page.tsx that is NEWER than some git HEAD files. Untouched during cleanup until its purpose is confirmed.

## 5. Canonical file locations (for the frontend repo)

Next.js File Router requires files be in specific locations. This has been a recurring problem.

**Scope extractor UI (client-side React):**
- Canonical: `app/scope-extractor/page.tsx`
- NOT at repo root, NOT in `pages/`

**Scope extractor API (server-side handler):**
- **Must exist in BOTH locations:** `pages/api/scope-extractor-v14.ts` AND `src/pages/api/scope-extractor-v14.ts`
- If only one exists, Vercel builds succeed but requests return silent 404s
- Always copy edits to both paths

**Domain reference docs (in repo root, leave alone):**
- `bid-rules-v1.md`
- `millwork-glossary.md`
- `millwork-sku-map.md`
- `README.md`

**Root files that were removed on 2026-04-25 (don't recreate):**
- ~~`page.tsx`~~ (at root, was stale v14.4.x artifact)
- ~~`scope-extractor-v14.ts`~~ (at root, was stale v14.4.x artifact)
- ~~`parsed_scope.xlsx`~~ (test artifact, shouldn't be in source control)
- ~~`r.text()).then(console.log).catch(console.error)`~~ (accidental file from a broken paste)

## 6. AI agent pipeline

Seven-tab Excel output produced by sequential agents:

1. **ScopeExtractor (Agent A)** — PDF → OCR → room grouping (50+ patterns) → LLM extraction → TOON decode → postprocess
2. **TradeClassifier (Agent B)** — Confidence scoring + rule tags in All Items tab
3. **WBSBuilder (Agent C)** — Trade hierarchy in WBS Summary tab
4. **BidChecklist (Agent D)** — Per-room completeness (blocking, hardware, finish, dims, ADA, exclusions)
5. **Risk & RFI (Agent E)** — Six RFI types auto-generated from extraction gaps
6. **Constructability RFI (Agent F, v14.9.0)** — 23 rule-based checks across 8 categories, merged into RFIs tab
7. **AssemblyDecomposer (Agent G, v14.9.1/v14.9.31)** — AWI 300 parts explosion, produces Parts List tab

**Excel tabs:** Project Summary, All Items, Per-Room tabs (one per detected room), WBS Summary, Bid Checklist, RFIs, Parts List.

## 7. TOON output format (canonical LLM schema)

All LLM agent outputs use TOON — a semicolon-delimited format. Never switch to JSON or CSV for agent outputs.

- Column separator: `;`
- Header line: `#TOON v=1 sep=; cols=<field_list>`
- Item types: `assembly`, `base_cabinet`, `upper_cabinet`, `tall_cabinet`, `countertop`, `transaction_top`, `ada_fascia`, `wall_cap`, `decorative_panel`, `trim`, `rubber_base`, `substrate`, `scope_exclusion`, and others defined in `MW_ITEM_SCHEMA_V14`
- Material codes: prefixes include PL, SS, WD, WC, FB, 3FORM, GRANITE, AF, RC, CT, PT, LVP, CPT, VCT, QZ, MEL (expanded list in scope-extractor-v14.ts)

## 8. Deploy workflow

### Frontend (`F:\Dev\projmgtai-landing`)

```powershell
cd F:\Dev\projmgtai-landing
# F: drive requires one-time: git config --global --add safe.directory F:/Dev/projmgtai-landing

# Make changes, then:
git add -A
git commit -m "v14.x.x: description"
git push origin main     # NOT master:main — frontend branch is 'main'
```

Vercel auto-redeploys on push. If the GitHub webhook is broken, use the deploy hook:

```powershell
Invoke-WebRequest -Method POST -UseBasicParsing `
  -Uri "https://api.vercel.com/v1/integrations/deploy/prj_Ntse493jDPNHaBgb5JUZ2Q8IMlTH/W0qXekxgzN"
```

### Backend (`C:\Dev\projmgtai_production`)

```powershell
cd C:\Dev\projmgtai_production
git add -A
git commit -m "description"
git push origin master:main   # local is 'master', remote is 'main' (legacy)
```

### Outreach agent (`C:\Dev\estimator-outreach-agent`)

```powershell
cd C:\Dev\estimator-outreach-agent
git add -A
git commit -m "description"
git push origin main
```

## 9. Environment landmines (hard-learned)

### PowerShell + UTF-8 encoding

- PowerShell's terminal displays em-dashes, middle dots, and other multi-byte UTF-8 chars as garbage like `Â·` or `—`. Files on disk are correct; the terminal is the problem. Don't waste time "fixing" terminal artifacts.
- Writing files with `Set-Content -replace` on strings containing Unicode chars (em-dashes, bullets, emojis) corrupts the bytes. Use a Python script with explicit `encoding='utf-8'` for any edit involving special chars.
- Email HTML templates: **no em-dashes, no Unicode bullets, no emojis** when written via PowerShell. Use plain ASCII equivalents (`-`, plain text).

### File management

- Downloads folder auto-appends `(1)`, `(2)`, `(3)` to duplicate filenames. Don't assume the most recent download is the file you want — verify with `Get-Item` or `Select-String` after copy.
- `Copy-Item -LiteralPath` is required for filenames containing brackets `[]` or parens `()`. Plain `Copy-Item` silently fails on these.
- Always verify file content (`Select-String` for version marker) AFTER copying into repo. Never assume the copy worked.

### Parser regressions (never do these)

- Never filter pages server-side by content type. v14.5.2-5.4 proved this causes 50%+ item count regression. The LLM handles mixed-content pages better than regex classifiers.
- Never split pages server-side by gender for vanity/locker rooms. v14.7.2 caused 217 duplicate items. Client-side item routing works.

### Next.js config quirks

- `next.config.ts` has `typescript.ignoreBuildErrors: true` — TypeScript errors won't fail builds. Don't rely on build to catch type issues.
- Turbopack is explicitly disabled (`experimental.turbo.enabled: false`). Earlier notes about Turbopack escape-quote issues no longer apply.

### Version drift

- Commit messages use `v14.X.Y` version strings.
- Displayed version string in `app/scope-extractor/page.tsx` nav bar lags the actual git HEAD sometimes. v14.9.39 commit didn't update the display string, so the deployed site shows "v14.9.38" despite being at git HEAD v14.9.39.
- File header comments (line 1-3 of page.tsx) may reference v14.9.31 or older — these are stale metadata, not indicative of actual functionality.

## 10. Supabase schema essentials

Project ID: `sceogtrqayzgnehnwymp`

### `leads` table (outreach agent)

61 columns total. Important ones for the AI analyze endpoint:

- `id` (text, NOT NULL) — primary key
- `relevance_score` (integer) — 0-10 Claude-assigned score
- `confidence` (text) — "high"/"medium"/"low" — **added 2026-04-25 via `ALTER TABLE leads ADD COLUMN confidence TEXT; NOTIFY pgrst, 'reload schema';`**
- `size` (text)
- `pain_phrases`, `software_mentioned`, `project_types` (ARRAY)
- `hook_sentence` (text)
- `processed` (boolean)
- `analyzed_at`, `sent_at`, `opened_at`, `clicked_at`, `replied_at`, `bounced_at` (timestamptz)
- `sendgrid_message_id` (text) — link between SendGrid events and lead rows
- `status` (text, NOT NULL)
- `rejection_reason` (text)
- `contact_name`, `contact_email`, `contact_confidence`, `linkedin_url` (contact resolution)

### Schema rule

When code writes to `leads`, every field must exist or PostgREST returns `PGRST204: Could not find the 'X' column of 'leads' in the schema cache`. Fix by adding the column via `ALTER TABLE` in the Supabase SQL Editor, followed by `NOTIFY pgrst, 'reload schema';` — NEVER run SQL from PowerShell.

### RLS policies

- `leads` — RLS enabled with service_role policy
- `suppressions` — RLS enabled
- `extractions`, `feedback`, `uploads` — RLS NOT yet enabled (flagged in session notes for hardening)

## 11. Files never to touch

- `.env.local` (any repo)
- `firebase-service-account.json` (legacy, still in backend repo)
- `vercel.json` (ask before modifying)
- Any `.xlsx` in `/outputs` or `/tmp` (generated artifacts)
- `pages/api/deploy-hook.js` (backend only)
- Firebase Firestore security rules (if present)

## 12. Known open issues (non-blocking)

- `/api/outreach/generate-pitch` — was returning 400, fixed 2026-04-25 via the same confidence column migration. Verify before reporting new bugs.
- `gary@projmgt.ai` M365 forwarding to `greinhold@rewmo.ai` is broken; outreach agent uses explicit `replyTo: "greinhold@rewmo.ai"` in SendGrid payloads.
- `typescript.ignoreBuildErrors: true` — Vercel builds succeed with TS warnings. Check build logs manually if behavior is suspicious.
- Deployment last build log showed 3 warnings (non-failing). Not investigated.
- Unit-type parsing (AL 1 Bed B × N units in senior-living projects) is not yet implemented in the finish-schedule parser.

## 13. Working patterns that work

- **Iterative, test-driven deploys:** package change → deploy → test on real project → regression-fix immediately → bump version. Do not stack multiple speculative changes before testing.
- **For file edits:** prefer `str_replace` for surgical changes; fall back to Python script for Unicode-sensitive or multi-line edits; full rewrite only as last resort.
- **Verify before committing:** `git diff <file>` after every edit, confirm only the intended change is present, and no encoding corruption.
- **Hard-reload browser (Ctrl+F5) after deploys** — stale caches cause false "fix didn't work" reports.
- **When in doubt, don't touch.** Today's 30-minute session that fixed two broken endpoints succeeded because we investigated carefully first. Rushed changes caused the original bugs.

## 14. Resume prompt for new sessions

Paste this when starting a new conversation inside the ProjMgtAI project:

> Continue ProjMgt.AI development. Read CLAUDE.md in the frontend repo (F:\Dev\projmgtai-landing\CLAUDE.md) first — it's the authoritative reference for the dev environment. Current focus: [fill in].

---

**Session contributors:**
- Thread 2026-04-22 to 2026-04-25: SendGrid webhook loop validation, outreach to Nicholson/Taber/Transworld, parser Fix 1 (finish-schedule-parser.ts module validated on Menifee Lakes), directory sprawl cleanup, fixed /api/outreach/analyze + /api/outreach/generate-pitch (added `confidence` column).
