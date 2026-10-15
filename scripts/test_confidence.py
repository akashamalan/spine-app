"""
Test the truth decay computation — no FalkorDB needed.
Validates the planted faults will be caught.
"""
import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.utils.confidence import compute_confidence, is_stale, format_confidence

DAY = 86400
NOW = int(time.time())

def ts(days_ago):
    return NOW - (days_ago * DAY)

print("── Truth Decay Tests ──\n")

# Test 1: Fresh ownership claim → should be fine
conf = compute_confidence(0.90, 120, ts(30))
print(f"1. Fresh ownership (30 days):  {format_confidence(conf)}")
assert not is_stale(conf), f"Expected fresh, got stale at {conf}"

# Test 2: PLANTED FAULT — Priya's billing ownership, 94 days old, half-life 120
conf = compute_confidence(0.90, 120, ts(94))
print(f"2. Priya billing (94 days):    {format_confidence(conf)}")
# 0.9 * 0.5^(94/120) = 0.9 * 0.576 = 0.518 → below 0.6
assert is_stale(conf), f"Expected stale, got {conf}"
assert conf < 0.6, f"Should be below floor, got {conf}"

# Test 3: PLANTED FAULT — deploy frequency, 311 days old, half-life 270
conf = compute_confidence(0.85, 270, ts(311))
print(f"3. Deploy freq (311 days):     {format_confidence(conf)}")
# 0.85 * 0.5^(311/270) = 0.85 * 0.456 = 0.387 → stale
assert is_stale(conf), f"Expected stale, got {conf}"

# Test 4: Architecture claim, 200 days old, half-life 540 → still fine
conf = compute_confidence(0.95, 540, ts(200))
print(f"4. Architecture (200 days):    {format_confidence(conf)}")
assert not is_stale(conf), f"Expected fresh, got stale at {conf}"

# Test 5: Historical fact → never decays
conf = compute_confidence(0.98, 999999, ts(500))
print(f"5. Historical (500 days):      {format_confidence(conf)}")
assert conf > 0.95, f"Historical shouldn't decay, got {conf}"

# Test 6: Legacy auth claim, 540 days, half-life 540 → borderline
conf = compute_confidence(0.80, 540, ts(540))
print(f"6. Legacy auth (540 days):     {format_confidence(conf)}")
# 0.80 * 0.5^(540/540) = 0.80 * 0.5 = 0.40 → stale
assert is_stale(conf), f"Expected stale, got {conf}"

# Test 7: Corroboration bonus
conf_single = compute_confidence(0.90, 120, ts(30), source_count=1)
conf_multi  = compute_confidence(0.90, 120, ts(30), source_count=5)
print(f"7. Corroboration: 1 source={conf_single:.3f}, 5 sources={conf_multi:.3f}")
assert conf_multi > conf_single, "Corroboration should boost confidence"

print("\n✅ All truth decay tests pass!")
print("\nPlanted faults verified:")
print("  • Priya's billing ownership → stale (will trigger Decay Watchman)")
print("  • Deploy frequency → stale (will trigger Decay Watchman)")
print("  • Legacy auth → stale (will trigger Decay Watchman)")
