"""
Truth decay — confidence computation at read time.

FalkorDB has no temporal arithmetic, so we store epoch ints and compute
decay in Python.

Formula:
    age_days   = (now_epoch - claim.asserted_at) / 86400
    decay      = 0.5 ** (age_days / claim.half_life_days)
    corrob     = min(1.5, 1 + 0.15 * log(source_count))
    confidence = claim.base_conf * decay * corrob

Half-life defaults by fact_type:
    ownership:    120 days
    org:          180 days
    process:      270 days
    policy:       365 days
    architecture: 540 days
    historical:   999999 days (never decays)
"""
import math
import time

DAY = 86400

HALF_LIFE_DEFAULTS = {
    "ownership":    120,
    "org":          180,
    "process":      270,
    "policy":       365,
    "architecture": 540,
    "historical":   999999,
}

# Below this floor, a VerifyTask should be created
CONFIDENCE_FLOOR = 0.6


def compute_confidence(
    base_conf: float,
    half_life_days: int,
    asserted_at: int,
    source_count: int = 1,
    now_epoch: int | None = None,
) -> float:
    """Compute current confidence for a claim."""
    if now_epoch is None:
        now_epoch = int(time.time())

    age_days = (now_epoch - asserted_at) / DAY

    if half_life_days <= 0 or half_life_days >= 999990:
        decay = 1.0
    else:
        decay = 0.5 ** (age_days / half_life_days)

    corrob = min(1.5, 1 + 0.15 * math.log(max(1, source_count)))
    confidence = base_conf * decay * corrob

    return round(min(1.0, max(0.0, confidence)), 4)


def is_stale(confidence: float) -> bool:
    """Returns True if confidence is below the verification floor."""
    return confidence < CONFIDENCE_FLOOR


def format_confidence(confidence: float) -> str:
    """Human-readable confidence label."""
    if confidence >= 0.9:
        return f"high ({confidence:.0%})"
    elif confidence >= 0.7:
        return f"moderate ({confidence:.0%})"
    elif confidence >= CONFIDENCE_FLOOR:
        return f"low ({confidence:.0%})"
    else:
        return f"⚠ stale ({confidence:.0%})"
