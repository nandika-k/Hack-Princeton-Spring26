# Free AI Alternatives for Sustainability Scoring

## Option 1: HuggingFace Inference API (FREE)

### Setup:
1. Get free API token: https://huggingface.co/settings/tokens
2. Update your Edge Function to use HF Inference API

### Update `calculate-sustainability` function:

Replace the `fetchIFMScore` function with:

```typescript
async function fetchIFMScore(input: any): Promise<any> {
  const hfToken = Deno.env.get('HUGGINGFACE_API_KEY')
  
  if (!hfToken) return retailerFallback(input)

  const prompt = `You are a sustainability expert. Rate this product:

Product: ${input.title}
Retailer: ${input.retailer}
${input.isSecondhand ? 'This is a SECONDHAND item (reuse reduces carbon footprint)' : 'This is a NEW item'}

Respond ONLY with JSON:
{"score": <0-100>, "explanation": "<one sentence>", "reasoning": "<2-3 sentences>"}`

  try {
    const res = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 300,
            temperature: 0.3,
            return_full_text: false,
          }
        }),
      }
    )

    if (!res.ok) return retailerFallback(input)

    const data = await res.json()
    const text = data[0]?.generated_text || ''
    
    const jsonMatch = text.match(/\{[^{}]*"score"[^{}]*\}/);
    if (!jsonMatch) return retailerFallback(input)
    
    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: parsed.score,
      explanation: parsed.explanation,
      reasoning: parsed.reasoning ?? parsed.explanation,
    }
  } catch (err) {
    console.warn('[HF] Inference failed:', err)
    return retailerFallback(input)
  }
}
```

### Secrets to Add:
- `HUGGINGFACE_API_KEY`: Your HF token (free)
- Remove `IFM_API_URL` and `IFM_API_KEY` (not needed)

### Pros:
- ✅ Completely FREE
- ✅ No deployment needed
- ✅ Instant setup (just API token)

### Cons:
- ⚠️ Rate limited (~1000 req/month)
- ⚠️ Smaller model (3B vs 32B)
- ⚠️ May need retries during cold starts

---

## Option 2: Groq (FREE, Fast)

Groq offers FREE API access with blazing fast inference!

### Setup:
1. Get free API key: https://console.groq.com
2. Update Edge Function:

```typescript
async function fetchIFMScore(input: any): Promise<any> {
  const groqKey = Deno.env.get('GROQ_API_KEY')
  
  if (!groqKey) return retailerFallback(input)

  const systemPrompt = `You are a sustainability expert. Respond with JSON only: {"score": 0-100, "explanation": "...", "reasoning": "..."}`
  
  const userPrompt = `Rate sustainability:
- Product: ${input.title}
- Retailer: ${input.retailer}
- Type: ${input.isSecondhand ? 'SECONDHAND (reuse)' : 'NEW'}
- Brand rating: ${input.brandRating}`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!res.ok) return retailerFallback(input)

    const data = await res.json()
    const content = data.choices[0]?.message?.content
    
    const jsonMatch = content.match(/\{[^{}]*"score"[^{}]*\}/)
    if (!jsonMatch) return retailerFallback(input)
    
    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: parsed.score,
      explanation: parsed.explanation,
      reasoning: parsed.reasoning ?? parsed.explanation,
    }
  } catch (err) {
    console.warn('[Groq] API failed:', err)
    return retailerFallback(input)
  }
}
```

### Secrets to Add:
- `GROQ_API_KEY`: Your Groq API key (free)

### Pros:
- ✅ Completely FREE
- ✅ SUPER FAST (500+ tokens/sec)
- ✅ Llama-3.1-8B (good quality)
- ✅ Generous free tier

### Cons:
- ⚠️ Rate limits exist (but higher than HF)
- ⚠️ Smaller than K2-Think-32B

---

## Option 3: Together.ai (FREE $25 Credit)

Together.ai gives $25 free credit for new signups.

### Setup:
1. Sign up: https://api.together.xyz
2. Get $25 free credit
3. Update Edge Function:

```typescript
async function fetchIFMScore(input: any): Promise<any> {
  const togetherKey = Deno.env.get('TOGETHER_API_KEY')
  
  if (!togetherKey) return retailerFallback(input)

  try {
    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        messages: [
          { role: 'system', content: 'You are a sustainability expert.' },
          { role: 'user', content: `Rate: ${input.title} from ${input.retailer}. JSON only.` },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    })

    const data = await res.json()
    const content = data.choices[0]?.message?.content
    const parsed = extractTrailingJson(content)
    return {
      score: parsed.score,
      explanation: parsed.explanation,
      reasoning: parsed.reasoning,
    }
  } catch (err) {
    return retailerFallback(input)
  }
}
```

### Pros:
- ✅ $25 FREE credit
- ✅ Access to many models
- ✅ Fast inference
- ✅ Good for hackathons

### Cons:
- ⚠️ Credits run out eventually
- ⚠️ Need credit card for signup

---

## Option 4: Enter AI Capability (Easiest!)

Enter.pro has built-in AI capability that's already set up!

### Setup:
Just enable AI capability (already available in your project):

```typescript
// In your Edge Function, use Enter's AI Gateway
const AI_API_TOKEN = Deno.env.get('AI_API_TOKEN_xxx') // Already set up

async function fetchIFMScore(input: any): Promise<any> {
  try {
    const res = await fetch('https://code.enter.pro/api/v1/ai/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic:claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: `Rate sustainability of ${input.title} from ${input.retailer}. Return JSON: {"score": 0-100, "explanation": "..."}` }
        ],
        max_tokens: 500,
      }),
    })

    const data = await res.json()
    const content = data.choices[0]?.message?.content
    const parsed = extractTrailingJson(content)
    return {
      score: parsed.score,
      explanation: parsed.explanation,
      reasoning: parsed.reasoning,
    }
  } catch (err) {
    return retailerFallback(input)
  }
}
```

### Pros:
- ✅ Built into Enter.pro
- ✅ Claude 3.5 Sonnet (excellent quality)
- ✅ Already set up
- ✅ Easy billing through Enter

### Cons:
- ⚠️ Not completely free (but very affordable)

---

## Comparison Table

| Option | Cost | Model Quality | Setup Time | Rate Limits |
|--------|------|---------------|------------|-------------|
| **HuggingFace** | FREE | ⭐⭐⭐ (3B) | 5 min | 1k req/mo |
| **Groq** | FREE | ⭐⭐⭐⭐ (8B) | 5 min | Generous |
| **Together.ai** | $25 credit | ⭐⭐⭐⭐ (8B) | 10 min | Credit-based |
| **Enter AI** | Pay-as-go | ⭐⭐⭐⭐⭐ (Claude) | Instant | Billing-based |
| **Modal K2-32B** | $3.60/hr | ⭐⭐⭐⭐⭐ (32B) | 30 min | None |

---

## Recommendation for Hackathon

### Best Choice: **Groq (FREE)**
- Fast, free, good quality
- Perfect for demos
- No deployment complexity

### Runner-up: **Enter AI Capability**
- Already integrated
- Best quality (Claude)
- Small cost but worth it for sponsor demos

### Budget Option: **HuggingFace FREE**
- Truly free
- Works for MVP
- May hit rate limits

---

## Quick Deploy - Groq (Recommended)

1. Sign up at https://console.groq.com
2. Copy your API key
3. In Enter.pro, I'll update the Edge Function for you
4. Add secret: `GROQ_API_KEY`
5. Done! Free AI scoring

Want me to implement Groq right now?
