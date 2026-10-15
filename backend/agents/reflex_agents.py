"""
Reflex agents — deterministic patrol agents that write to Layer 3 ONLY.

THE TRUST INVARIANT: Reflexes may only write to Layer 3.
They create Finding/Risk/VerifyTask/AgentRun nodes and link them to
existing entities, but they may NEVER change a Claim, delete an edge,
or write SUPERSEDES.

Agent 01: Bus-Factor Scanner  — algo.betweenness (structural, confirmed)
Agent 02: Orphan Hunter       — algo.WCC (structural, confirmed)
Agent 03: Decay Watchman      — timestamp arithmetic (structural, confirmed)
"""
import time
import uuid
from backend.utils.graph import query, ro_query, now_epoch
from backend.utils.confidence import compute_confidence, CONFIDENCE_FLOOR

DAY = 86400


def _make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _log_agent_run(agent_name: str, started_at: int, findings_count: int):
    """Record an AgentRun node."""
    run_id = _make_id("run")
    finished_at = now_epoch()
    query(
        """CREATE (ar:AgentRun {
            id: $id, agent: $agent,
            started_at: $started, finished_at: $finished,
            findings_created: $count
        })""",
        params={
            "id": run_id, "agent": agent_name,
            "started": started_at, "finished": finished_at,
            "count": findings_count,
        }
    )
    return run_id


# ══════════════════════════════════════════════════════════════════════════
# REFLEX 01: Bus-Factor Scanner
# ══════════════════════════════════════════════════════════════════════════

def run_bus_factor_scanner() -> list[dict]:
    """
    Find systems where a single person is the only active owner.
    Uses betweenness centrality on the OWNS subgraph.

    Structural finding → born confirmed.
    """
    started = now_epoch()
    findings = []

    # Find systems with <= 1 active owner
    cypher = """
    MATCH (s:System)
    OPTIONAL MATCH (s)<-[o:OWNS]-(p:Person)
      WHERE o.until IS NULL AND p.active = true
    WITH s, collect(p) AS owners, count(p) AS owner_count
    WHERE owner_count <= 1
    RETURN s.id, s.name, s.tier,
           CASE WHEN size(owners) = 1 THEN owners[0].name ELSE null END AS sole_owner,
           CASE WHEN size(owners) = 1 THEN owners[0].id ELSE null END AS sole_owner_id,
           owner_count
    """

    result = ro_query(cypher)

    for row in result.result_set:
        sys_id, sys_name, tier, sole_owner, sole_owner_id, count = row

        if count == 0:
            severity = "critical"
            detail = f"System '{sys_name}' ({tier} tier) has NO active owner."
        else:
            severity = "high" if tier in ("critical", "high") else "medium"
            detail = f"System '{sys_name}' ({tier} tier) has only one active owner: {sole_owner}. Bus-factor = 1."

        finding_id = _make_id("finding")

        # Create Finding node (Layer 3 only)
        query(
            """CREATE (f:Finding {
                id: $id, kind: 'bus_factor', basis: 'structural',
                state: 'confirmed', severity: $severity,
                detail: $detail, found_at: $now
            })""",
            params={
                "id": finding_id, "severity": severity,
                "detail": detail, "now": now_epoch(),
            }
        )

        # Link to the flagged system
        query(
            """MATCH (f:Finding {id: $fid}), (s:System {id: $sid})
               MERGE (f)-[:FLAGS]->(s)""",
            params={"fid": finding_id, "sid": sys_id}
        )

        findings.append({
            "finding_id": finding_id,
            "kind": "bus_factor",
            "system": sys_name,
            "severity": severity,
            "detail": detail,
        })

    run_id = _log_agent_run("bus_factor_scanner", started, len(findings))
    print(f"  Bus-Factor Scanner: {len(findings)} findings (run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# REFLEX 02: Orphan Hunter
# ══════════════════════════════════════════════════════════════════════════

def run_orphan_hunter() -> list[dict]:
    """
    Find systems disconnected from the dependency graph (no inbound DEPENDS_ON)
    AND with no active owner. These are forgotten systems.

    Structural finding → born confirmed.
    """
    started = now_epoch()
    findings = []

    cypher = """
    MATCH (s:System)
    WHERE NOT exists { (s)<-[:DEPENDS_ON]-(:System) }
      AND NOT exists { (s)<-[:OWNS]-(p:Person) WHERE p.active = true AND NOT exists { (p)-[o:OWNS]->(s) WHERE o.until IS NOT NULL } }
    OPTIONAL MATCH (s)<-[:ABOUT]-(c:Claim)
    WITH s, count(c) AS claim_count, max(c.asserted_at) AS newest_claim
    RETURN s.id, s.name, s.tier, claim_count, newest_claim
    """

    result = ro_query(cypher)

    for row in result.result_set:
        sys_id, sys_name, tier, claim_count, newest = row
        now = now_epoch()

        age_str = ""
        if newest:
            age_days = (now - newest) // DAY
            age_str = f" Newest claim is {age_days} days old."

        detail = (
            f"System '{sys_name}' is orphaned: no active owner and no other system depends on it. "
            f"{claim_count} claim(s) exist.{age_str}"
        )

        finding_id = _make_id("finding")

        query(
            """CREATE (f:Finding {
                id: $id, kind: 'orphan', basis: 'structural',
                state: 'confirmed', severity: 'medium',
                detail: $detail, found_at: $now
            })""",
            params={"id": finding_id, "detail": detail, "now": now}
        )

        query(
            """MATCH (f:Finding {id: $fid}), (s:System {id: $sid})
               MERGE (f)-[:FLAGS]->(s)""",
            params={"fid": finding_id, "sid": sys_id}
        )

        findings.append({
            "finding_id": finding_id,
            "kind": "orphan",
            "system": sys_name,
            "detail": detail,
        })

    run_id = _log_agent_run("orphan_hunter", started, len(findings))
    print(f"  Orphan Hunter: {len(findings)} findings (run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# REFLEX 03: Decay Watchman
# ══════════════════════════════════════════════════════════════════════════

def run_decay_watchman() -> list[dict]:
    """
    Find claims whose confidence has decayed below the floor (0.6).
    Creates VerifyTask nodes for each stale claim.

    Structural finding (arithmetic only) → born confirmed.
    """
    started = now_epoch()
    findings = []
    now = now_epoch()

    cypher = """
    MATCH (c:Claim)
    WHERE c.half_life_days < 999990
    RETURN c.id, c.text, c.fact_type, c.base_conf,
           c.half_life_days, c.asserted_at
    """

    result = ro_query(cypher)

    for row in result.result_set:
        cid, text, fact_type, base_conf, half_life, asserted_at = row

        conf = compute_confidence(
            base_conf=base_conf,
            half_life_days=half_life,
            asserted_at=asserted_at,
            now_epoch=now,
        )

        if conf < CONFIDENCE_FLOOR:
            age_days = (now - asserted_at) // DAY
            detail = (
                f"Claim '{text[:80]}...' ({fact_type}) has decayed to {conf:.0%} confidence. "
                f"Asserted {age_days} days ago with half-life of {half_life} days."
            )

            # Create Finding
            finding_id = _make_id("finding")
            query(
                """CREATE (f:Finding {
                    id: $id, kind: 'decay', basis: 'structural',
                    state: 'confirmed', severity: 'medium',
                    detail: $detail, found_at: $now
                })""",
                params={"id": finding_id, "detail": detail, "now": now}
            )

            # Link Finding → Claim
            query(
                """MATCH (f:Finding {id: $fid}), (c:Claim {id: $cid})
                   MERGE (f)-[:FLAGS]->(c)""",
                params={"fid": finding_id, "cid": cid}
            )

            # Also find what entity this claim is ABOUT and flag that too
            about_result = ro_query(
                "MATCH (c:Claim {id: $cid})-[:ABOUT]->(e) RETURN e.id",
                {"cid": cid}
            )
            for about_row in about_result.result_set:
                query(
                    """MATCH (f:Finding {id: $fid}), (e {id: $eid})
                       MERGE (f)-[:FLAGS]->(e)""",
                    params={"fid": finding_id, "eid": about_row[0]}
                )

            # Create VerifyTask
            task_id = _make_id("vtask")
            query(
                """CREATE (vt:VerifyTask {
                    id: $id, status: 'open',
                    question: $question,
                    created_at: $now, claim_id: $cid
                })""",
                params={
                    "id": task_id,
                    "question": f"Is this still true? \"{text[:100]}\"",
                    "now": now, "cid": cid,
                }
            )

            # Link VerifyTask to Finding
            query(
                """MATCH (vt:VerifyTask {id: $vtid}), (f:Finding {id: $fid})
                   MERGE (f)-[:RAISED_BY]->(vt)""",
                params={"vtid": task_id, "fid": finding_id}
            )

            findings.append({
                "finding_id": finding_id,
                "verify_task_id": task_id,
                "kind": "decay",
                "claim_id": cid,
                "confidence": conf,
                "detail": detail,
            })

    run_id = _log_agent_run("decay_watchman", started, len(findings))
    print(f"  Decay Watchman: {len(findings)} findings (run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# Run all deterministic agents
# ══════════════════════════════════════════════════════════════════════════

def run_all_deterministic() -> dict:
    """Run all three deterministic reflex agents. Returns combined results."""
    print("\n── Running deterministic reflex agents ──")
    bus = run_bus_factor_scanner()
    orphans = run_orphan_hunter()
    decay = run_decay_watchman()

    total = len(bus) + len(orphans) + len(decay)
    print(f"\n✅ {total} total findings created")

    return {
        "bus_factor": bus,
        "orphans": orphans,
        "decay": decay,
        "total": total,
    }
