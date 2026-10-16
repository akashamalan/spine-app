"""
Groq LLM client.

The graph stays the only source of truth — the LLM never supplies facts,
it only classifies intent and phrases evidence that the graph produced.

Callers are expected to catch LLMError and fall back to deterministic
behaviour, so a missing key or a Groq outage degrades the answer quality
without breaking the endpoint.
"""
import os
import json
from dotenv import dotenv_values, load_dotenv

# Normal precedence for everything: a real environment variable beats .env
# (that is how a host injects config at deploy time).
load_dotenv()

# One exception: if .env defines GROQ_API_KEY, the file wins. A stale key
# left in the shell environment otherwise silently overrides the file and
# looks exactly like an expired key. This is scoped to the key on purpose —
# a blanket override=True would also clobber FALKORDB_* and *_MODEL.
_file_key = dotenv_values().get("GROQ_API_KEY")
if _file_key:
    os.environ["GROQ_API_KEY"] = _file_key

# Hard ceiling per LLM call. Retries are disabled below, because the Groq
# client otherwise retries twice and a "20s" timeout really means ~60s.
TIMEOUT_SECONDS = 20

EXTRACTION_MODEL = os.getenv("EXTRACTION_MODEL", "llama-3.3-70b-versatile")
ANSWER_MODEL = os.getenv("ANSWER_MODEL", "llama-3.3-70b-versatile")
CONTRADICTION_MODEL = os.getenv("CONTRADICTION_MODEL", "llama-3.1-8b-instant")

_client = None


class LLMError(RuntimeError):
    """Raised when the LLM is unavailable or returned something unusable."""


def _get_client():
    global _client
    if _client is not None:
        return _client

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LLMError("GROQ_API_KEY is not set")

    try:
        from groq import Groq
    except ImportError as e:
        raise LLMError(f"groq package not installed: {e}") from e

    _client = Groq(api_key=api_key, timeout=TIMEOUT_SECONDS, max_retries=0)
    return _client


_STATUS_TTL_SECONDS = 60
_status_cache: dict = {"at": 0.0, "value": None}


def llm_status() -> dict:
    """
    Is the LLM actually usable? Reported by /health so a dead key or a
    missing model is visible instead of silently degrading to templates.

    Checks the key is set, that Groq accepts it, and that every configured
    model is available to this account. Cached for 60s so /health stays
    cheap. Never includes the key itself.
    """
    import time

    now = time.time()
    if _status_cache["value"] is not None and now - _status_cache["at"] < _STATUS_TTL_SECONDS:
        return _status_cache["value"]

    configured = {
        "answer": ANSWER_MODEL,
        "extraction": EXTRACTION_MODEL,
        "contradiction": CONTRADICTION_MODEL,
    }
    status: dict = {"ok": False, "provider": "groq", "models": configured}

    if not os.getenv("GROQ_API_KEY"):
        status["error"] = "GROQ_API_KEY is not set — answers will use the template fallback."
    else:
        try:
            available = {m.id for m in _get_client().models.list().data}
            missing = sorted({m for m in configured.values() if m not in available})
            if missing:
                status["error"] = (
                    f"Model(s) not available to this API key: {', '.join(missing)}. "
                    "Update the *_MODEL values in .env."
                )
            else:
                status["ok"] = True
        except Exception as e:
            msg = str(e)
            if "401" in msg or "invalid_api_key" in msg or "expired_api_key" in msg:
                status["error"] = "GROQ_API_KEY is invalid or expired — answers will use the template fallback."
            else:
                status["error"] = f"Could not reach Groq: {msg[:200]}"

    _status_cache.update(at=now, value=status)
    return status


def chat(model: str, messages: list[dict], json_mode: bool = False) -> str:
    """
    Send a chat completion to Groq and return the message content.

    With json_mode=True the model is constrained to emit a JSON object.
    Raises LLMError on any failure so the caller can fall back.
    """
    client = _get_client()

    kwargs = {
        "model": model,
        "messages": messages,
        "timeout": TIMEOUT_SECONDS,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        completion = client.chat.completions.create(**kwargs)
    except Exception as e:
        raise LLMError(f"Groq call failed ({model}): {e}") from e

    if not completion.choices:
        raise LLMError(f"Groq returned no choices ({model})")

    content = completion.choices[0].message.content
    if not content or not content.strip():
        raise LLMError(f"Groq returned empty content ({model})")

    return content.strip()


def chat_json(model: str, messages: list[dict]) -> dict:
    """chat() in JSON mode, parsed. Raises LLMError if it isn't valid JSON."""
    raw = chat(model, messages, json_mode=True)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMError(f"Groq returned invalid JSON ({model}): {raw[:200]}") from e

    if not isinstance(parsed, dict):
        raise LLMError(f"Groq returned non-object JSON ({model})")

    return parsed
