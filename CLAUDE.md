# ProjMgt.AI - Claude Code Session Memory

## 1. PROJECT OVERVIEW
ProjMgt.AI is an AI-native estimating platform for architectural woodwork, millwork, and casework companies. It parses bid-set and construction-set PDFs (multi-upload supported) and produces a six-tab Excel deliverable via five sequential AI agents. Current version: v14.9.0. Primary proof point: 24 Hour Fitness Ventura project ($76,875 total bid).

## 2. TECH STACK (exact versions)
- Framework: Next.js 14.2.x - App Router exclusively (no Pages Router)
- Runtime: Node.js 18+
- Hosting: Vercel (GReinhold-ai org)
- Auth/DB: Firebase (project: projmgtai) - Firestore + Firebase Auth
- AI: Anthropic Claude API (claude-sonnet-4-20250514) via /api/ routes
- Excel output: SheetJS (xlsx)
- PDF parsing: pdfplumber (Python, Vercel serverless) + client-side fallback
- Styling: Tailwind CSS
- Repo: github.com/GReinhold-ai/ProjMgt.ai
- Local path: C:\Dev\projmgtai_production\ (backend) / F:\Dev\projmgtai-landing\ (frontend)
- Live URLs: https://projmgt.ai (landing) - https://api.projmgt.ai (API)
- Deploy: git push + Vercel deploy hook (webhook broken - always use hook URL)

## 3. ARCHITECTURE & CONVENTIONS

### Five AI Agents (sequential pipeline)
1. ScopeExtractor - parses PDF text into raw WBS rows
2. TradeClassifier - assigns Woodwork Institute series (100/200/300/400)
3. WBSBuilder - structures by building > floor > room > detail
4. BidChecklist - validates completeness, flags missing items
5. Risk & RFI Agent - surfaces constructability issues, generates RFIs

### Six-Tab Excel Output
- Bid-Quote: Priced line items
- Cabinet List: Classified cabinet schedule
- Parts List: Material breakdown
- By Room: WBS grouped by room
- Material Schedule: WD/PLY/M codes linked to specs
- Summary: Stats + totals

### TOON Output Format (canonical LLM schema)
- Semicolon-delimited output from all LLM agents
- Material codes: WD-1, WD-2, M-1, M-2, PLY-1, PLY-2
- Never switch to JSON or CSV for agent outputs - TOON only

### API File Deployment Rule (CRITICAL)
All API route files must be copied to BOTH locations:
  pages/api/
  src/pages/api/
Failure to copy to both causes silent 404s on Vercel.

### PowerShell Deploy Workflow
  cd C:\Dev\projmgtai_production
  git add -A
  git commit -m "v14.x.x - description"
  git push
  Invoke-WebRequest -Method POST -Uri "https://api.vercel.com/v1/integrations/deploy/prj_Ntse493jDPNHaBgb5JUZ2Q8IMlTH/W0qXekxgzN"

### PDF Parsing Rules (hard-learned)
- Do NOT use page filtering or server-side page splitting - causes regressions
- Let the LLM handle mixed-content pages - it outperforms regex classifiers
- Multi-PDF upload supported; process each PDF independently then merge WBS
- 50MB upload limit configured at Vercel project level

### Naming Conventions
- Components: PascalCase (ScopeExtractor.jsx, BidChecklist.jsx)
- API routes: kebab-case (/api/extract-scope, /api/build-wbs)
- Agent outputs: always TOON format, never raw JSON to frontend
- Firebase collections: camelCase (projectSessions, bidItems)

## 4. FILES CLAUDE MUST NEVER TOUCH
- .env.local
- firebase-service-account.json
- vercel.json (ask before modifying)
- Any generated .xlsx files in /outputs or /tmp
- pages/api/deploy-hook.js
- Firebase Firestore security rules files

## CURRENT BUILD FOCUS (update each session)
- v14.9.0: Feedback UI + Constructability RFI Agent live
- Next: Phase D1 - Material Schedule Parser (parse WD/PLY/M code legend pages into structured material DB)
- Scout pipeline (estimator job posting scraper > cold outreach) in spec phase

## PROOF POINT FOR DEMOS
- 24 Hour Fitness Ventura - $76,875 total bid, multi-PDF upload, six-tab Excel output
- Use this project for all marketing copy and demo screenshots