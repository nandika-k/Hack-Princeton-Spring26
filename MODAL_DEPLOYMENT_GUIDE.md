# K2-Think Modal Deployment Guide

This guide will help you deploy the K2-Think LLM (32B parameters) to Modal for sustainability scoring.

---

## Prerequisites

1. **Modal Account**: Sign up at https://modal.com
2. **Python 3.10+**: Installed locally
3. **Modal Credits**: ~$10-20 for hackathon testing (A100-80GB is $3.60/hr active)

---

## Step 1: Install Modal CLI

```bash
pip install modal
```

---

## Step 2: Authenticate Modal

```bash
modal token new
```

This will open a browser to authenticate. Follow the prompts.

---

## Step 3: Create Modal Secret (Optional)

Only needed if K2-Think is a gated model on HuggingFace:

```bash
modal secret create huggingface-secret HUGGINGFACE_TOKEN=hf_your_token_here
```

Get your token from: https://huggingface.co/settings/tokens

---

## Step 4: Deploy K2-Think

From your project directory:

```bash
modal deploy deploy_k2_modal.py
```

**Expected output:**
```
✓ Initialized. View run at https://modal.com/...
✓ Created objects.
├── 🔨 Created function serve_vllm.
└── 🔨 Created mount /path/to/your/project
✓ App deployed! 🎉

View Deployment: https://modal.com/username/apps/k2-think-vllm
```

---

## Step 5: Get Your Endpoint URL

After deployment, Modal will show you the URL:

```
https://USERNAME--k2-think-vllm-serve-vllm.modal.run
```

Your API endpoint will be:
```
https://USERNAME--k2-think-vllm-serve-vllm.modal.run/v1/chat/completions
```

---

## Step 6: Test the Deployment

### Quick Test (Terminal):

```bash
curl -X POST "YOUR_MODAL_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model": "LLM360/K2-Think", "messages": [{"role": "system", "content": "You are a sustainability expert."}, {"role": "user", "content": "Rate sustainability of secondhand Levis jacket from Depop"}], "max_tokens": 500, "temperature": 0.3}'
```

---

## Step 7: Update Enter Cloud Secret

Once deployed and tested, update your Enter Cloud secret with the Modal URL in Enter.pro

Update IFM_API_URL to your Modal endpoint (the URL from step 5 with /v1/chat/completions)

IFM_API_KEY can be set to "dummy" (vLLM doesn't require auth by default)

---

## Cost Management

### Active Compute Costs:
- **A100-80GB**: $3.60/hour when active
- **Idle timeout**: 5 minutes (configured in script)
- **Cold start**: First request takes 2-3 minutes (downloading model)

### Stop Deployment After Hackathon:
```bash
modal app stop k2-think-vllm
```

### Monitor Usage:
- View logs: `modal app logs k2-think-vllm`
- Check costs: https://modal.com/usage

### Estimated Hackathon Costs:
- **Dev/Testing**: $5-10 (1-2 hours active compute)
- **Live Demo**: $2-5 (demo + pre-warming)
- **Total**: ~$10-15 for entire event

---

## Troubleshooting

### Cold Start Takes Too Long
**Solution**: Pre-warm container 2-3 minutes before demo starts

### Out of Memory Error
**Problem**: K2-Think (32B) requires 80GB GPU  
**Solution**: Verify GPU_CONFIG in script uses A100 80GB

### Model Download Fails
**Problem**: Gated model or network issue  
**Solution**: Check HuggingFace token is set

### API Returns 404
**Problem**: Wrong endpoint format  
**Solution**: Ensure URL ends with /v1/chat/completions

---

## Alternative: Use Smaller Model (Cost Saver)

If A100-80GB is too expensive, you can use a smaller model in the script:

### Option 1: LLM360/K2-7B (Smaller K2 variant)
- Only needs 16GB GPU
- A10G at $1.10/hr

### Option 2: Llama-3.1-8B-Instruct
- A10G at $1.10/hr

**Trade-off**: Smaller models = faster/cheaper but less sophisticated reasoning

---

## Production Checklist

Before sponsor demos:

- [ ] Modal deployment is active
- [ ] Test curl command returns valid JSON
- [ ] IFM_API_URL secret updated in Enter Cloud
- [ ] calculate-sustainability edge function works end-to-end
- [ ] Fallback to heuristic scoring works

---

## Need Help?

1. **Modal Docs**: https://modal.com/docs
2. **vLLM Docs**: https://docs.vllm.ai
3. **K2-Think Model**: https://huggingface.co/LLM360/K2-Think

**Quick Debug**:
```bash
# Check deployment status
modal app list

# View real-time logs
modal app logs k2-think-vllm --follow

# Test locally before deploying
modal run deploy_k2_modal.py
```

---

## Success Indicators

✅ modal deploy completes without errors  
✅ Endpoint returns valid chat completion JSON  
✅ First inference completes in 2-3 min (cold start)  
✅ Subsequent calls respond in 5-10 seconds  
✅ Edge function receives score + explanation  
✅ Frontend shows ECO badge with K2-Think reasoning  

When all green → you're ready for sponsor demos! 🎉
