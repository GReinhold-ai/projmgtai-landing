# V14 Parser Drop-In Upgrade

## Install

1. Unzip this into your project root:
   ```
   C:\Dev\projmgtai_parser_minimal\projmgtai-ui\
   ```
   It will merge into your existing `src\` folder.

2. Install the Anthropic SDK:
   ```bash
   npm install @anthropic-ai/sdk
   ```

3. Add your Anthropic API key to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
   Get your key at: https://console.anthropic.com/settings/keys

## What's in the zip

```
src/
├── lib/
│   ├── toonSchemas.ts              ← REPLACES existing (backward compatible)
│   └── parser/                     ← NEW folder
│       ├── preprocess.ts           ← Stage 1: regex pre-processor
│       └── postprocess.ts          ← Stage 3: validation & enrichment
└── pages/
    └── api/
        └── scope-extractor-v14.ts  ← NEW endpoint (v13 untouched)
```

## What it does NOT touch

- `src/lib/toon.ts` — unchanged, still works
- `src/pages/api/scope-extractor-toon.ts` — v13 stays live
- All other files — untouched

## Endpoints

- **V13 (existing):** `POST /api/scope-extractor-toon`
- **V14 (new):**      `POST /api/scope-extractor-v14`

Same request body works for both:
```json
{
  "text": "...OCR text...",
  "projectId": "24hr-fitness-ventura",
  "sheetRef": "A8.10"
}
```

## Fallback

If `ANTHROPIC_API_KEY` is not set but `OPENAI_API_KEY` is, v14 will
fall back to GPT-4o automatically. You can run both keys simultaneously.

## V14 Response (new fields)

The v14 response includes everything v13 had plus:
- `assemblies[]` — detected parent assemblies with component rollups
- `hints{}` — pre-extracted dimensions, materials, hardware, equipment
- `stats{}` — counts of items with dimensions, materials, flagged defaults
- `warnings[]` — validation issues found by post-processor
- `timing{}` — ms for each pipeline stage
