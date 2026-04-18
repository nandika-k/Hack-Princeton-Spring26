# Backend Setup — macOS Quick Start

> For your teammate running the Kizaki backend on macOS.

---

## 1. Install Kizaki CLI

```bash
brew install --cask kizakicorp/tap/kizaki
```

Verify:

```bash
kizaki version
```

---

## 2. Log in

```bash
kizaki login
```

This opens a browser to authenticate with your HackPrinceton Kizaki account.

---

## 3. Pull the repo and navigate to the worktree

```bash
git clone <repo-url>
cd Hack-Princeton-Spring26
```

The backend files are all under the repo root:

```
schema/main.inspire          ← data model
src/aggregate-products.ts    ← Tavily search
src/get-recommendations.ts   ← feed recommendations
src/calculate-sustainability.ts ← IFM + Dedalus scoring
src/types/                   ← shared TypeScript types
src/lib/mockProducts.ts      ← mock data (no API needed)
```

---

## 4. Register API secrets

```bash
kizaki secrets set TAVILY_API_KEY=<key>
kizaki secrets set IFM_API_KEY=<key>
kizaki secrets set DEDALUS_API_KEY=<key>

# Optional
kizaki secrets set HEYGEN_API_KEY=<key>
kizaki secrets set ERAGON_API_KEY=<key>
```

---

## 5. Compile schema and migrate DB

```bash
kizaki compile
kizaki migrate plan    # review the generated SQL
kizaki migrate apply   # apply to local embedded DB
```

If `compile` fails with syntax errors in `schema/main.inspire`, check the [Inspire reference](https://docs.kizaki.ai/docs/reference/inspire-overview) and adjust entity/policy syntax — the schema was written against early docs.

---

## 6. Start local dev server

```bash
kizaki dev
```

This starts the embedded PostgreSQL, applies migrations, and serves all `@expose` functions.

---

## 7. Deploy

```bash
kizaki deploy
```

Your live URL will be: `<app-name>-hackprincetonspring26.kizaki.ai`

---

## Exposed functions (callable from frontend via generated SDK)

| Function | What it does |
|---|---|
| `aggregateProducts({ query, retailers?, page? })` | Search Tavily for products, cache results |
| `getRecommendations(page?)` | Personalized feed based on user's style prefs |
| `calculateSustainability(productId)` | Dedalus brand audit + IFM score (0–100) |

The frontend calls these directly — no manual API routes needed. Import from the generated SDK package after `kizaki compile`.

---

## Score color guide

| Score | Color | Meaning |
|---|---|---|
| 70–100 | Green | Highly sustainable |
| 40–69 | Amber | Moderate |
| 0–39 | Red | Low sustainability |
