"""
Embedding generation for SPINE.

Strategy:
- If HuggingFace/sentence-transformers is available: all-MiniLM-L6-v2 (384d)
- Fallback: deterministic hash-based embeddings (384d)
  These produce consistent vectors and reasonable cosine similarity
  for keyword-overlapping texts. Not as good as neural embeddings,
  but sufficient for demo + development.

On your machine with internet, set USE_NEURAL_EMBEDDINGS=1 in .env.
"""
import os
import hashlib
import math
import numpy as np
from typing import Optional

EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))
USE_NEURAL = os.getenv("USE_NEURAL_EMBEDDINGS", "0") == "1"

_neural_model = None


def _try_load_neural():
    """Attempt to load sentence-transformers model."""
    global _neural_model
    if _neural_model is not None:
        return _neural_model

    try:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        _neural_model = SentenceTransformer(model_name)
        return _neural_model
    except Exception:
        return None


def _hash_embed(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """
    Deterministic hash-based embedding.

    Produces a normalized vector from text using:
    1. Tokenize into words
    2. Hash each word to get a seed
    3. Use the seed to generate a sub-vector
    4. Sum all sub-vectors (bag-of-words style)
    5. Normalize to unit length

    This gives reasonable cosine similarity for texts sharing keywords.
    """
    words = text.lower().split()
    vec = np.zeros(dim, dtype=np.float64)

    for word in words:
        # Clean word
        word = ''.join(c for c in word if c.isalnum())
        if not word:
            continue

        # Hash to get a deterministic seed
        h = hashlib.sha256(word.encode()).digest()
        seed = int.from_bytes(h[:4], 'big')

        # Generate a sub-vector from the seed
        rng = np.random.RandomState(seed)
        sub = rng.randn(dim)

        # Weight by inverse document frequency approximation
        # (shorter words = more common = lower weight)
        weight = 1.0 / (1.0 + math.exp(-(len(word) - 4)))
        vec += sub * weight

    # Normalize
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm

    return vec.tolist()


def embed_text(text: str) -> list[float]:
    """Embed a single text string. Returns a list of floats."""
    if USE_NEURAL:
        model = _try_load_neural()
        if model:
            vec = model.encode(text, normalize_embeddings=True)
            return vec.tolist()

    return _hash_embed(text)


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns list of float lists."""
    if USE_NEURAL:
        model = _try_load_neural()
        if model:
            vecs = model.encode(texts, normalize_embeddings=True, batch_size=32)
            return [v.tolist() for v in vecs]

    return [_hash_embed(t) for t in texts]
