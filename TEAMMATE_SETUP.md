# Backend Setup — macOS Quick Start

> For your teammate running the Kizaki backend on macOS. **Live-first** — real Tavily + K2-Think on the happy path, mock/heuristic fallback if upstream fails so the demo never breaks.

---

## 1. Install Kizaki CLI

```bash
brew install --cask kizakicorp/tap/kizaki
kizaki version
```

---

## 2. Log in

```bash
kizaki login
```

---

## 3. Clone repo

```bash
git clone <repo-url>
cd Hack-Princeton-Spring26
```

Backend files:

```
schema/main.inspire              ← data model
src/aggregate-products.ts        ← Tavily search (live)
src/get-recommendations.ts       ← feed recs (live Tavily → mock fallback)
src/calculate-sustainability.ts  ← Dedalus + K2-Think (live → heuristic fallback)
src/lib/mockProducts.ts          ← fallback catalog (22 products)
src/types/                       ← shared TypeScript types
```

### Fallback behavior

| Live service | Happy path | On failure |
|---|---|---|
| Tavily | 20 live products per page | `MOCK_PRODUCTS` slice |
| K2-Think | 0–100 score + reasoning chain | secondhand→65, new→35, short explanation |
| Dedalus | Brand rating + certifications | `{ brand_rating: 'unknown' }` (K2 still runs) |

Failures are logged via `console.warn` and visible in `kizaki logs`. Nothing throws.

---

## 4. Deploy K2-Think on Modal (for IFM scoring)

The K2-Think 32B model isn't on any free hosted API — we self-host on Modal.com (free $30/mo credits).

```bash
pip install modal
modal token new
```

Create `k2_server.py`:

```python
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("vllm==0.6.3", "huggingface_hub")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

app = modal.App("k2-think-server")

@app.function(
    image=image,
    gpu="A100-80GB",
    timeout=60 * 60,
    container_idle_timeout=300,
    allow_concurrent_inputs=10,
)
@modal.asgi_app()
def serve():
    from vllm.entrypoints.openai.api_server import app as vllm_app
    from vllm.engine.arg_utils import AsyncEngineArgs
    from vllm.engine.async_llm_engine import AsyncLLMEngine

    args = AsyncEngineArgs(
        model="LLM360/K2-Think",
        dtype="bfloat16",
        max_model_len=8192,
    )
    engine = AsyncLLMEngine.from_engine_args(args)
    vllm_app.state.engine = engine
    return vllm_app
```

```bash
modal deploy k2_server.py
```

Modal prints a URL — copy it.

---

## 5. Register API secrets

```bash
# Tavily — live product search
kizaki secrets set TAVILY_API_KEY=<tavily-key>

# Dedalus — brand audits
kizaki secrets set DEDALUS_API_KEY=<dedalus-key>

# K2-Think via Modal
kizaki secrets set IFM_API_URL=https://<your-modal-url>/v1/chat/completions
kizaki secrets set IFM_API_KEY=dummy   # vLLM doesn't enforce auth

# Optional
kizaki secrets set HEYGEN_API_KEY=<key>
kizaki secrets set ERAGON_API_KEY=<key>
```

---

## 6. Compile schema and migrate DB

```bash
kizaki compile
kizaki migrate plan
kizaki migrate apply
```

If `compile` fails on `schema/main.inspire`, cross-reference [docs.kizaki.ai](https://docs.kizaki.ai/) for exact Inspire syntax.

---

## 7. Pre-warm Modal before demo

First K2-Think call after idle takes ~90s (container cold start + model load). Fire a throwaway call right before demoing:

```bash
curl $IFM_API_URL -H "Authorization: Bearer dummy" \
  -H "Content-Type: application/json" \
  -d '{"model":"LLM360/K2-Think","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
```

After warm, responses take ~5–10s per product.

---

## 8. Start local dev

```bash
kizaki dev
```

Test flow:
1. Sign up via dev login
2. Pick style tags
3. Call `getRecommendations(0)` → hits Tavily live → 20 products
4. Call `calculateSustainability(<product_id>)` → Dedalus + K2-Think live → score + reasoning

---

## 9. Deploy

```bash
kizaki deploy
```

Live URL: `<app-name>-hackprincetonspring26.kizaki.ai`

---

## Exposed functions (auto-generated SDK)

| Function | Live source |
|---|---|
| `aggregateProducts({ query, retailers?, page? })` | Tavily (cached 1hr in `Product` table) |
| `getRecommendations(page?)` | Tavily via user's style prefs |
| `calculateSustainability(productId)` | Dedalus + K2-Think |

---

## Score color guide

| Score | Color | Meaning |
|---|---|---|
| 70–100 | Green | Highly sustainable |
| 40–69 | Amber | Moderate |
| 0–39 | Red | Low sustainability |

---

## Cost watch

- Modal A100-80GB: $0.001/sec → ~$3.60/hr active, ~$18 over hackathon
- Tavily: free tier is 1000 searches/mo (cache aggressively — already done, 1hr TTL)
- Dedalus: sponsor credits

Keep Modal container timeout at 5 min idle so you don't bleed credits between demos.
