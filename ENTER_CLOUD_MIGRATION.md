# Backend Migration Complete - Enter Cloud (Supabase)

✅ **Migration Status: COMPLETE**

Your backend has been successfully migrated from Kizaki to Enter Cloud (Supabase).

---

## What Was Migrated

### Database Schema
- ✅ `profiles` - User profiles (auto-created on signup)
- ✅ `style_preferences` - User style tags and occasions
- ✅ `boards` - User-created pinning collections
- ✅ `pins` - Saved products linked to boards
- ✅ `products` - Public cache for Tavily search results (1hr TTL)

All tables have Row Level Security (RLS) enabled with proper access policies.

### Edge Functions
- ✅ `aggregate-products` - Tavily search across 6 secondhand retailers with 1hr cache
- ✅ `get-recommendations` - Personalized feed based on user preferences (live → mock fallback)
- ✅ `calculate-sustainability` - Dedalus brand audit + K2-Think scoring (live → heuristic fallback)

### API Secrets Configured
- ✅ `TAVILY_API_KEY` - Product search API
- ✅ `DEDALUS_API_KEY` - Brand sustainability audits
- ✅ `IFM_API_URL` - K2-Think endpoint (HuggingFace Inference Endpoint `/v1/chat/completions`)
- ✅ `IFM_API_KEY` - HuggingFace token
- ✅ `IFM_MODEL_ID` - K2-Think v2 model ID (default: `LLM360/K2-Think-v2`)

---

## How to Use in Your Frontend

### 1. Import Supabase Client
```typescript
import { supabase } from '@/integrations/supabase/client'
```

### 2. Call Edge Functions

**Get Recommendations:**
```typescript
const { data, error } = await supabase.functions.invoke('get-recommendations', {
  body: { page: 0 }
})
```

**Aggregate Products (Search):**
```typescript
const { data, error } = await supabase.functions.invoke('aggregate-products', {
  body: { 
    query: 'Y2K vintage clothing',
    retailers: ['depop', 'vinted'], // optional
    page: 0 
  }
})
```

**Calculate Sustainability:**
```typescript
const { data, error } = await supabase.functions.invoke('calculate-sustainability', {
  body: { productId: 'depop:mock-001' }
})

// Returns: { score, explanation, reasoning, comparison }
```

**Photon AI — Analyze Tag Photo (in-store):**
```typescript
const { data, error } = await supabase.functions.invoke('analyze-tag', {
  body: { imageUrl: 'https://...photo-of-tag.jpg' }
})

// Returns:
// {
//   extraction: { brand, materials, countryOfOrigin, careInstructions, rawText },
//   score: 82,
//   explanation: "Patagonia recycled fleece — high sustainability.",
//   reasoning: "...",
//   comparison: "saves ~25 kg CO₂ vs buying new",
//   certifications: ["bluesign®", "Fair Trade"],
//   brandRating: "great",
//   formattedReply: "🌿 Sustainability Score: 82/100\n..."
// }
```

For iMessage/SMS: configure Twilio webhook URL as
`https://<project>.supabase.co/functions/v1/analyze-tag`
The function auto-detects Twilio's `application/x-www-form-urlencoded` payload and replies with TwiML.

### 3. Database Operations

**Create Style Preferences:**
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('user_id', user.id)
  .single()

await supabase.from('style_preferences').insert({
  profile_id: profile.id,
  style_tags: ['Y2K', 'Vintage 90s'],
  occasions: ['Prom', 'Everyday']
})
```

**Create Board & Pin Products:**
```typescript
const { data: board } = await supabase.from('boards').insert({
  profile_id: profile.id,
  name: 'Prom 2026',
  description: 'Y2K aesthetic'
}).select().single()

await supabase.from('pins').insert({
  profile_id: profile.id,
  board_id: board.id,
  product_id: product.id,
  product_data: product,
  sustainability_score: product.sustainability_score
})
```

---

## Authentication

Auto-confirm email is enabled for easy testing. Profile is auto-created on signup.

**Sign Up:**
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'your-secure-password'
})
```

**Sign In:**
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'your-secure-password'
})
```

**Get Current User:**
```typescript
const { data: { user } } = await supabase.auth.getUser()
```

---

## Fallback Behavior

All functions degrade gracefully - your app never shows a broken state:

| Service Down | Fallback Behavior |
|---|---|
| Tavily API | Returns 4 mock products (Y2K items with images) |
| K2-Think | Uses retailer heuristic: secondhand=65, new=35 |
| Dedalus | K2-Think runs without brand data |
| All services | Mock products + heuristic scores |

---

## Next Steps

1. **Deploy K2-Think on Modal** (optional but recommended for sponsor prize):
   - Follow `TEAMMATE_SETUP.md` step 4 to deploy vLLM server
   - Update `IFM_API_URL` secret with your Modal endpoint
   - Format: `https://your-app.modal.run/v1/chat/completions`

2. **Test the Functions:**
   - Sign up a test user
   - Call `get-recommendations` to see Tavily products
   - Call `calculate-sustainability` to see K2-Think scoring

3. **Build Frontend UI:**
   - Profile setup with style tags
   - Feed with masonry grid
   - Product detail modal with ECO badge
   - Boards and pinning flow

---

## Cost Notes

- **Tavily**: Free tier = 1000 searches/mo (1hr cache reduces calls)
- **Dedalus**: Sponsor credits (ask them)
- **K2-Think**: $0.001/sec on Modal A100-80GB (~$3.60/hr active)
- **Enter Cloud**: Free tier includes auth, database, and edge functions

Keep Modal container idle timeout at 5 min to save credits between demos.

---

## Type Safety

TypeScript types are auto-generated in `src/integrations/supabase/types.ts` and kept in sync with your database schema. Import them as needed:

```typescript
import type { Database } from '@/integrations/supabase/types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Product = Database['public']['Tables']['products']['Row']
```

---

## Differences from Kizaki

| Feature | Kizaki (Original) | Enter Cloud (Now) |
|---|---|---|
| Language | Inspire schema | SQL migrations |
| Functions | `@expose` decorators | Edge Functions (Deno) |
| Auth | Built-in | Supabase Auth |
| Deploy | `kizaki deploy` | Auto-deployed |
| Secrets | `kizaki secrets set` | Added via UI |
| Client | Generated SDK | `@supabase/supabase-js` |

Your business logic remains identical - only the platform changed!

---

## Troubleshooting

**Edge function errors:**
- Check logs in Supabase Dashboard → Edge Functions → Logs
- Verify secrets are set correctly
- Ensure API keys have correct permissions

**Database errors:**
- Check RLS policies if queries return empty
- Profile is auto-created on signup via trigger
- Use `maybeSingle()` instead of `single()` for optional rows

**Tavily rate limits:**
- Free tier: 1000 searches/month
- 1hr cache is enabled to minimize calls
- Mock fallback prevents empty feeds

---

## Support

If you need help:
1. Check Edge Function logs in Supabase Dashboard
2. Verify all 4 secrets are configured
3. Test with mock data first (works without any API keys)
4. Gradually enable live services (Tavily → Dedalus → K2-Think)
