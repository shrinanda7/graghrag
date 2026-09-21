"""Ollama LLM and Embeddings Client with token tracking, latency logging, and error handling."""
import time
import logging
from typing import Dict, Any, List, Optional, Tuple
import httpx
from pydantic import BaseModel, Field

from backend.config import settings

logger = logging.getLogger("graphrag.llm")

class LLMCallLog(BaseModel):
    call_type: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: float = 0.0
    status: str = "success"
    error_message: Optional[str] = None

class OllamaClient:
    """Client for interacting with local Ollama service for completions and embeddings."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.small_model = settings.OLLAMA_SMALL_MODEL
        self.large_model = settings.OLLAMA_LARGE_MODEL
        self.embed_model = settings.OLLAMA_EMBED_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT
        self.call_logs: List[LLMCallLog] = []

    def check_health(self) -> Dict[str, Any]:
        """Check if Ollama is accessible and list available models."""
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name", "") for m in data.get("models", [])]
                    return {
                        "status": "connected",
                        "base_url": self.base_url,
                        "available_models": models,
                        "has_small_model": any(self.small_model in m for m in models),
                        "has_large_model": any(self.large_model in m for m in models),
                        "has_embed_model": any(self.embed_model in m for m in models),
                    }
                return {
                    "status": "error",
                    "base_url": self.base_url,
                    "error": f"HTTP {res.status_code}: {res.text}"
                }
        except Exception as e:
            return {
                "status": "unreachable",
                "base_url": self.base_url,
                "error": str(e),
                "suggestion": f"Ensure Ollama is running (`ollama serve`) and models ({self.small_model}, {self.large_model}, {self.embed_model}) are pulled."
            }

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        system: Optional[str] = None,
        temperature: float = 0.2,
        format_json: bool = False,
    ) -> Tuple[str, LLMCallLog]:
        """Generate response via Ollama /api/generate with latency and token telemetry."""
        target_model = model or self.large_model
        payload: Dict[str, Any] = {
            "model": target_model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system
        if format_json:
            payload["format"] = "json"

        start_time = time.time()
        call_log = LLMCallLog(call_type="generate", model=target_model)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(f"{self.base_url}/api/generate", json=payload)
                elapsed_ms = (time.time() - start_time) * 1000.0
                call_log.latency_ms = round(elapsed_ms, 2)

                if res.status_code == 200:
                    data = res.json()
                    response_text = data.get("response", "")
                    prompt_tokens = data.get("prompt_eval_count", len(prompt.split()) * 4 // 3)
                    completion_tokens = data.get("eval_count", len(response_text.split()) * 4 // 3)
                    call_log.prompt_tokens = prompt_tokens
                    call_log.completion_tokens = completion_tokens
                    call_log.total_tokens = prompt_tokens + completion_tokens
                    call_log.status = "success"
                    self.call_logs.append(call_log)
                    return response_text, call_log
                else:
                    call_log.status = "failed"
                    call_log.error_message = f"HTTP {res.status_code}: {res.text}"
                    self.call_logs.append(call_log)
                    return "", call_log
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000.0
            call_log.latency_ms = round(elapsed_ms, 2)
            call_log.status = "error"
            call_log.error_message = str(e)
            self.call_logs.append(call_log)
            logger.warning(f"Ollama call to {target_model} failed: {e}")
            return "", call_log

    async def get_embedding(self, text: str, model: Optional[str] = None) -> Tuple[List[float], LLMCallLog]:
        """Generate text embedding vector with telemetry."""
        target_model = model or self.embed_model
        payload = {"model": target_model, "prompt": text}
        start_time = time.time()
        call_log = LLMCallLog(call_type="embedding", model=target_model)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(f"{self.base_url}/api/embeddings", json=payload)
                elapsed_ms = (time.time() - start_time) * 1000.0
                call_log.latency_ms = round(elapsed_ms, 2)

                if res.status_code == 200:
                    data = res.json()
                    embedding = data.get("embedding", [])
                    call_log.prompt_tokens = len(text.split()) * 4 // 3
                    call_log.total_tokens = call_log.prompt_tokens
                    call_log.status = "success"
                    self.call_logs.append(call_log)
                    return embedding, call_log
                else:
                    call_log.status = "failed"
                    call_log.error_message = f"HTTP {res.status_code}: {res.text}"
                    self.call_logs.append(call_log)
                    return [], call_log
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000.0
            call_log.latency_ms = round(elapsed_ms, 2)
            call_log.status = "fallback"
            call_log.error_message = str(e)
            self.call_logs.append(call_log)
            # Deterministic pseudo-embedding for testing when Ollama daemon is offline
            import hashlib, math
            vec = [0.0] * 64
            for word in text.lower().split():
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                idx = h % 64
                sign = 1.0 if (h >> 6) & 1 else -1.0
                vec[idx] += sign
            norm = math.sqrt(sum(x * x for x in vec)) or 1.0
            norm_vec = [round(x / norm, 4) for x in vec]
            return norm_vec, call_log

# Singleton instance
ollama_client = OllamaClient()
