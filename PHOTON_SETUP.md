# Photon AI — Setup Summary

In-store iMessage tag scanner. User texts a clothing tag photo → K2-Think v2 reads the label → sustainability score + material breakdown sent back as iMessage reply.

---

## What was built

```
photon-bot/
  index.ts          Spectrum-TS iMessage bot (persistent Node/Bun process)
  package.json      single dep: spectrum-ts
  .env              credentials (gitignored)
  .env.example      template

supabase/functions/analyze-tag/index.ts
  Edge function: K2-Think v2 vision (extract tag + score) → Dedalus (certifications) → JSON / SMS reply

supabase/migrations/migration_20260418_photon_tag_scans
  tag_scans table in Supabase

src/types/tag-scan.ts
  TagAnalysisResult TypeScript types
```

---

## Full pipeline

```
iPhone → iMessage → Photon Cloud
  → photon-bot/index.ts  (Spectrum-TS, bun process)
  → POST supabase/functions/v1/analyze-tag  { imageUrl }
  → K2-Think v2 vision: extract brand / materials / origin + score 0–100
  → Dedalus brand audit: certifications + brand rating
  → reply: "🌿 Sustainability Score: 82/100\nBrand: Patagonia\n..."
```

---

## Step 1 — Supabase migration

In Supabase Dashboard → SQL Editor, run the contents of:
`supabase/migrations/migration_20260418_photon_tag_scans`

---

## Step 2 — Deploy edge function

```bash
supabase functions deploy analyze-tag
```

Secrets needed in Supabase Dashboard → Edge Functions → Secrets:

| Secret | Value |
|---|---|
| `IFM_API_URL` | HuggingFace K2-Think v2 endpoint `/v1/chat/completions` |
| `IFM_API_KEY` | HuggingFace token |
| `IFM_MODEL_ID` | `LLM360/K2-Think-v2` (optional, this is the default) |
| `DEDALUS_API_KEY` | Dedalus Labs key |

---

## Step 3 — Run the Photon bot

### Fill in `.env`

`photon-bot/.env` already has the Photon credentials. Add Supabase values:

```
PHOTON_PROJECT_ID=469bfd2a-e731-4a65-80d8-6ebd0f5856ec
PHOTON_PROJECT_SECRET=2iFhunI2pXoJa6HsWuwx5BWtXIjIcGKEbIkicNqXU0Y
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon key from Supabase Dashboard → Settings → API>
```

### Install and run

```bash
cd photon-bot
bun install
bun run index.ts
```

On Windows if bun is not installed:
```powershell
# Install bun via PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"
# Then restart PowerShell and retry
```

---

## Open issue

`bun install && bun run index.ts` failed in PowerShell on Windows.
**Next step: paste the error output into a new session to diagnose.**

Likely causes:
- Bun not installed → run the install command above
- `spectrum-ts` install error → paste npm/bun error
- `.env` not loaded → check SUPABASE_URL is filled in
- Photon Cloud connection error → check projectId/projectSecret

---

## Photon credentials

- **Plan**: Pro
- **projectId**: `469bfd2a-e731-4a65-80d8-6ebd0f5856ec`
- **projectSecret**: `2iFhunI2pXoJa6HsWuwx5BWtXIjIcGKEbIkicNqXU0Y`
- **Docs**: https://docs.photon.codes/spectrum-ts/getting-started.md
- **Dashboard**: https://app.photon.codes

---

## Key files to read for context

1. `PHOTON_SETUP.md` — this file
2. `photon-bot/index.ts` — bot logic
3. `supabase/functions/analyze-tag/index.ts` — scoring pipeline
4. `ENTER_CLOUD_MIGRATION.md` — full backend overview
