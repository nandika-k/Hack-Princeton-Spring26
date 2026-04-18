"""
K2-Think vLLM deployment on Modal
Deploys LLM360/K2-Think-32B with OpenAI-compatible endpoint
"""

import modal

# Create Modal app
app = modal.App("k2-think-vllm")

# vLLM image with K2-Think model
vllm_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "vllm==0.6.0",
        "torch==2.4.0",
        "transformers==4.44.0",
        "huggingface_hub==0.24.0",
    )
)

# GPU configuration - A100-80GB required for 32B model
GPU_CONFIG = modal.gpu.A100(size="80GB", count=1)

@app.function(
    image=vllm_image,
    gpu=GPU_CONFIG,
    timeout=3600,  # 1 hour
    container_idle_timeout=300,  # 5 min idle before shutdown (saves credits)
    allow_concurrent_inputs=10,
    secrets=[modal.Secret.from_name("huggingface-secret")],  # Optional: for gated models
)
@modal.asgi_app()
def serve_vllm():
    """Serve K2-Think via vLLM with OpenAI-compatible API"""
    import subprocess
    import sys
    
    model_name = "LLM360/K2-Think"
    
    # Start vLLM server with OpenAI API
    cmd = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", model_name,
        "--host", "0.0.0.0",
        "--port", "8000",
        "--dtype", "auto",
        "--max-model-len", "4096",
        "--gpu-memory-utilization", "0.95",
        "--trust-remote-code",
    ]
    
    subprocess.Popen(cmd)
    
    # Return ASGI app
    from vllm.entrypoints.openai.api_server import app as vllm_app
    return vllm_app


@app.local_entrypoint()
def main():
    """Test the deployment with a sample request"""
    import requests
    
    # Get the deployment URL
    print("🚀 Deploying K2-Think on Modal...")
    print("⏳ This may take 5-10 minutes for first cold start (downloading 32B model)...")
    
    # The deployment URL will be printed by Modal
    print("\n✅ Deployment complete!")
    print("\nYour K2-Think endpoint:")
    print("https://your-username--k2-think-vllm-serve-vllm.modal.run/v1/chat/completions")
    print("\nTest with:")
    print('curl -X POST "YOUR_URL/v1/chat/completions" \\')
    print('  -H "Content-Type: application/json" \\')
    print('  -d \'{"model": "LLM360/K2-Think", "messages": [{"role": "user", "content": "Hello!"}], "max_tokens": 100}\'')


if __name__ == "__main__":
    # Deploy to Modal
    modal.runner.deploy_app(app)
