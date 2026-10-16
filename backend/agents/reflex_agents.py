"""
Reflex agents — deterministic patrol agents that write to Layer 3 ONLY.

THE TRUST INVARIANT: Reflexes may only write to Layer 3.
They create Finding/Risk/VerifyTask/AgentRun nodes and link them to
existing entities, but they may NEVER change a Claim, delete an edge,
or write SUPERSEDES.

Agent 01: Bus-Factor Scanner     — algo.betweenness (structural, confirmed)
Agent 02: Orphan Hunter          — algo.WCC (structural, confirmed)
Agent 03: Decay Watchman         — timestamp arithmetic (structural, confirmed)
Agent 04: Contradiction Detector — LLM pair comparison (basis='llm', confirmed)

Agents 01-03 are deterministic. Agent 04 asks an LLM whether two claims
conflict, so its findings carry basis='llm' — but it still only writes
Layer 3, and it degrades to a no-op when the LLM is unavailable.
"""
import time
import uuid
import json
import itertools
from backend.utils.graph import query, ro_query, now_epoch
from backend.utils.confidence import compute_confidence, CONFIDENCE_FLOOR
from backend.utils.llm import chat_json, LLMError, CONTRADICTION_MODEL

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

def _bus_factor_wording(sys_name: str, tier: str, owner_count: int,
                        sole_owner: str | None) -> tuple[str, str]:
    """(severity, detail) for a bus-factor finding. The single source of
    this wording — the scanner writes it, the re-check refreshes it."""
    if owner_count == 0:
        return "critical", f"System '{sys_name}' ({tier} tier) has NO active owner."
    return (
        "high" if tier in ("critical", "high") else "medium",
        f"System '{sys_name}' ({tier} tier) has only one active owner: "
        f"{sole_owner}. Bus-factor = 1.",
    )


def run_bus_factor_scanner() -> list[dict]:
    """
    Find systems where a single person is the only active owner.
    Uses betweenness centrality on the OWNS subgraph.

    Structural finding → born confirmed.

    Idempotent: a Finding is keyed on (kind='bus_factor', target system) via
    the MERGE below, so re-running this scanner updates found_at on the
    existing Finding instead of creating a duplicate node.
    """
    started = now_epoch()
    findings = []
    created_count = 0

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

        severity, detail = _bus_factor_wording(sys_name, tier, count, sole_owner)

        # MERGE keyed on (kind, target system) — updates found_at on an
        # existing unresolved Finding instead of duplicating it.
        merge_result = query(
            """MATCH (s:System {id: $sid})
               MERGE (f:Finding {kind: 'bus_factor'})-[:FLAGS]->(s)
               ON CREATE SET
                   f.id = $new_id, f.basis = 'structural', f.state = 'confirmed',
                   f.severity = $severity, f.detail = $detail, f.found_at = $now,
                   f.just_created = true
               ON MATCH SET
                   f.found_at = $now, f.severity = $severity, f.detail = $detail,
                   f.state = 'confirmed', f.resolved_at = NULL,
                   f.just_created = false
               RETURN f.id, f.just_created""",
            params={
                "sid": sys_id, "new_id": _make_id("finding"),
                "severity": severity, "detail": detail, "now": now_epoch(),
            }
        )
        finding_id, just_created = merge_result.result_set[0]
        if just_created:
            created_count += 1

        findings.append({
            "finding_id": finding_id,
            "kind": "bus_factor",
            "system": sys_name,
            "severity": severity,
            "detail": detail,
        })

    run_id = _log_agent_run("bus_factor_scanner", started, created_count)
    print(f"  Bus-Factor Scanner: {len(findings)} findings ({created_count} new, run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# REFLEX 02: Orphan Hunter
# ══════════════════════════════════════════════════════════════════════════

def run_orphan_hunter() -> list[dict]:
    """
    Find systems disconnected from the dependency graph (no inbound DEPENDS_ON)
    AND with no active owner. These are forgotten systems.

    Structural finding → born confirmed.

    Idempotent: a Finding is keyed on (kind='orphan', target system) via the
    MERGE below, so re-running this hunter updates found_at on the existing
    Finding instead of creating a duplicate node.
    """
    started = now_epoch()
    findings = []
    created_count = 0

    cypher = """
    MATCH (s:System)
    WHERE NOT (s)<-[:DEPENDS_ON]-(:System)
    OPTIONAL MATCH (s)<-[o:OWNS]-(p:Person)
    WHERE p.active = true AND o.until IS NULL
    WITH s, count(p) AS active_owner_count
    WHERE active_owner_count = 0
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

        # MERGE keyed on (kind, target system) — updates found_at on an
        # existing unresolved Finding instead of duplicating it.
        merge_result = query(
            """MATCH (s:System {id: $sid})
               MERGE (f:Finding {kind: 'orphan'})-[:FLAGS]->(s)
               ON CREATE SET
                   f.id = $new_id, f.basis = 'structural', f.state = 'confirmed',
                   f.severity = 'medium', f.detail = $detail, f.found_at = $now,
                   f.just_created = true
               ON MATCH SET
                   f.found_at = $now, f.detail = $detail,
                   f.state = 'confirmed', f.resolved_at = NULL,
                   f.just_created = false
               RETURN f.id, f.just_created""",
            params={"sid": sys_id, "new_id": _make_id("finding"), "detail": detail, "now": now}
        )
        finding_id, just_created = merge_result.result_set[0]
        if just_created:
            created_count += 1

        findings.append({
            "finding_id": finding_id,
            "kind": "orphan",
            "system": sys_name,
            "detail": detail,
        })

    run_id = _log_agent_run("orphan_hunter", started, created_count)
    print(f"  Orphan Hunter: {len(findings)} findings ({created_count} new, run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# REFLEX 03: Decay Watchman
# ══════════════════════════════════════════════════════════════════════════

def run_decay_watchman() -> list[dict]:
    """
    Find claims whose confidence has decayed below the floor (0.6).
    Creates VerifyTask nodes for each stale claim.

    Structural finding (arithmetic only) → born confirmed.

    Idempotent: a Finding is keyed on (kind='decay', target claim) via the
    MERGE below, so re-running this watchman updates found_at on the
    existing Finding instead of duplicating it. A new VerifyTask (Vera
    probe) is only created if the existing Finding has no open one —
    otherwise the open probe is reused, so probes don't keep growing.
    """
    started = now_epoch()
    findings = []
    created_count = 0
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

            # MERGE keyed on (kind, target claim) — updates found_at on an
            # existing unresolved Finding instead of duplicating it.
            merge_result = query(
                """MATCH (c:Claim {id: $cid})
                   MERGE (f:Finding {kind: 'decay'})-[:FLAGS]->(c)
                   ON CREATE SET
                       f.id = $new_id, f.basis = 'structural', f.state = 'confirmed',
                       f.severity = 'medium', f.detail = $detail, f.found_at = $now,
                       f.just_created = true
                   ON MATCH SET
                       f.found_at = $now, f.detail = $detail,
                       f.state = 'confirmed', f.resolved_at = NULL,
                       f.just_created = false
                   RETURN f.id, f.just_created""",
                params={"cid": cid, "new_id": _make_id("finding"), "detail": detail, "now": now}
            )
            finding_id, just_created = merge_result.result_set[0]
            if just_created:
                created_count += 1

                # Also find what entity this claim is ABOUT and flag that too
                # (only needed once, on first creation — the claim's ABOUT
                # edges don't change between runs)
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

            # Only raise a new Vera probe if this Finding has no open one —
            # otherwise reuse it, so probes don't keep growing on re-run.
            open_task = ro_query(
                """MATCH (f:Finding {id: $fid})-[:RAISED_BY]->(vt:VerifyTask)
                   WHERE vt.status = 'open'
                   RETURN vt.id
                   LIMIT 1""",
                {"fid": finding_id}
            )

            if open_task.result_set:
                task_id = open_task.result_set[0][0]
            else:
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

    run_id = _log_agent_run("decay_watchman", started, created_count)
    print(f"  Decay Watchman: {len(findings)} findings ({created_count} new, run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# REFLEX 04: Contradiction Detector
# ══════════════════════════════════════════════════════════════════════════

MAX_PAIRS_PER_RUN = 20

CONTRADICTION_SYSTEM = """You compare two statements recorded about the same thing \
at a company and decide whether they contradict each other.

Return JSON with exactly two keys:
{"contradicts": true|false, "reason": "..."}

They contradict only if both cannot be true at the same time — for example two
different procedures given for the same step, or two different people named as
the single owner of the same thing.

They do NOT contradict if they simply describe different aspects, or if one adds
detail to the other.

reason: one sentence naming the specific conflict. If they do not contradict,
give a brief reason why not."""


def run_contradiction_detector() -> list[dict]:
    """
    Compare same-subject, same-fact_type claim pairs and flag conflicts.

    This is the one reflex that uses an LLM, so findings are born with
    basis='llm' rather than 'structural'. It still only writes Layer 3 —
    the claims themselves are never touched.

    Idempotent: the Finding is keyed on the sorted pair of claim ids via
    `pair_key`, so re-running updates found_at instead of duplicating.
    """
    started = now_epoch()
    findings = []
    created_count = 0

    # Superseded claims are excluded: a Vera correction deliberately leaves
    # the old claim in place, and pairing it against its replacement would
    # flag every correction as a fresh contradiction.
    rows = ro_query(
        """MATCH (c:Claim)-[:ABOUT]->(e)
           WHERE c.fact_type IS NOT NULL
             AND NOT (:Claim)-[:SUPERSEDES]->(c)
           RETURN e.id, c.fact_type, c.id, c.text
           ORDER BY e.id, c.fact_type, c.id"""
    ).result_set

    # Group claims by (entity, fact_type) — only those groups can conflict.
    groups: dict[tuple, list[dict]] = {}
    for entity_id, fact_type, claim_id, text in rows:
        groups.setdefault((entity_id, fact_type), []).append(
            {"id": claim_id, "text": text}
        )

    # Build the candidate pair list, capped to limit API calls per run.
    pairs = []
    for (entity_id, fact_type), claims in groups.items():
        if len(claims) < 2:
            continue
        for a, b in itertools.combinations(claims, 2):
            pairs.append((entity_id, fact_type, a, b))

    truncated = len(pairs) > MAX_PAIRS_PER_RUN
    pairs = pairs[:MAX_PAIRS_PER_RUN]

    checked = 0
    for entity_id, fact_type, a, b in pairs:
        try:
            verdict = chat_json(CONTRADICTION_MODEL, [
                {"role": "system", "content": CONTRADICTION_SYSTEM},
                {"role": "user", "content": json.dumps({
                    "subject": entity_id,
                    "fact_type": fact_type,
                    "statement_a": a["text"],
                    "statement_b": b["text"],
                })},
            ])
        except LLMError as e:
            print(f"  Contradiction Detector: LLM unavailable, skipping ({e})")
            break

        checked += 1
        if not verdict.get("contradicts"):
            continue

        reason = str(verdict.get("reason") or "").strip() or "Claims conflict."

        # Sorted pair id keeps the MERGE stable regardless of iteration order.
        pair_key = "|".join(sorted([a["id"], b["id"]]))

        merged = query(
            """MERGE (f:Finding {kind: 'contradiction', pair_key: $key})
               ON CREATE SET
                   f.id = $new_id, f.basis = 'llm', f.state = 'confirmed',
                   f.severity = 'high', f.detail = $detail, f.found_at = $now,
                   f.just_created = true
               ON MATCH SET
                   f.found_at = $now, f.detail = $detail,
                   f.state = 'confirmed', f.resolved_at = NULL,
                   f.just_created = false
               RETURN f.id, f.just_created""",
            params={
                "key": pair_key, "new_id": _make_id("finding"),
                "detail": reason, "now": now_epoch(),
            }
        )
        finding_id, just_created = merged.result_set[0]
        if just_created:
            created_count += 1

        # Flag both sides of the contradiction.
        for claim_id in (a["id"], b["id"]):
            query(
                """MATCH (f:Finding {id: $fid}), (c:Claim {id: $cid})
                   MERGE (f)-[:FLAGS]->(c)""",
                params={"fid": finding_id, "cid": claim_id}
            )

        findings.append({
            "finding_id": finding_id,
            "kind": "contradiction",
            "claim_ids": [a["id"], b["id"]],
            "subject": entity_id,
            "detail": reason,
        })

    run_id = _log_agent_run("contradiction_detector", started, created_count)
    note = f", {len(pairs)} capped" if truncated else ""
    print(f"  Contradiction Detector: {len(findings)} findings "
          f"({created_count} new, {checked} pairs checked{note}, run {run_id})")
    return findings


# ══════════════════════════════════════════════════════════════════════════
# Run all reflex agents
# ══════════════════════════════════════════════════════════════════════════

def run_all_reflexes() -> dict:
    """Run every reflex agent. Returns combined results."""
    print("\n── Running reflex agents ──")
    bus = run_bus_factor_scanner()
    orphans = run_orphan_hunter()
    decay = run_decay_watchman()
    contradictions = run_contradiction_detector()

    total = len(bus) + len(orphans) + len(decay) + len(contradictions)
    print(f"\n✅ {total} total findings detected (re-runs update existing ones, not duplicate them)")

    return {
        "bus_factor": bus,
        "orphans": orphans,
        "decay": decay,
        "contradictions": contradictions,
        "total": total,
    }


# ══════════════════════════════════════════════════════════════════════════
# Closing findings — the other half of the reflex loop
# ══════════════════════════════════════════════════════════════════════════
#
# Reflexes open findings. Nothing used to close them, so a problem that had
# been fixed kept showing up in the Pulse and in answers forever.
#
# This re-evaluates each finding's own condition and resolves the ones that
# no longer hold. Still Layer 3 only: it sets state/resolved_at on Finding
# nodes and links the Response that caused the change. Findings are never
# deleted, so the history survives.


def _active_owner_count(system_id: str) -> int:
    r = ro_query(
        """MATCH (s {id: $id})
           OPTIONAL MATCH (s)<-[o:OWNS]-(p:Person)
           WHERE o.until IS NULL AND p.active = true
           RETURN count(p)""",
        {"id": system_id},
    )
    return r.result_set[0][0] if r.result_set else 0


def _has_inbound_dependency(system_id: str) -> bool:
    r = ro_query(
        "MATCH (s {id: $id})<-[:DEPENDS_ON]-(:System) RETURN count(*) > 0",
        {"id": system_id},
    )
    return bool(r.result_set and r.result_set[0][0])


def _claim_facts(claim_id: str) -> dict | None:
    """Live confidence, supersede status and age for one claim."""
    r = ro_query(
        """MATCH (c:Claim {id: $id})
           OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
           RETURN c.base_conf, c.half_life_days, c.asserted_at, count(newer) > 0""",
        {"id": claim_id},
    )
    if not r.result_set:
        return None
    base_conf, half_life, asserted_at, superseded = r.result_set[0]
    return {
        "confidence": compute_confidence(
            base_conf=base_conf, half_life_days=half_life, asserted_at=asserted_at
        ),
        "superseded": bool(superseded),
        "asserted_at": asserted_at,
    }


def _still_true(kind: str, pair_key: str | None, found_at: int,
                claim_ids: list[str], system_ids: list[str]) -> bool:
    """
    Does this finding's condition still hold?

    Mirrors each detector's own test, so a finding closes exactly when the
    thing it complained about is fixed. Unknown kinds are left alone — a
    finding is never closed on a guess.
    """
    if kind == "bus_factor":
        # Opened when a system had <= 1 active owner.
        return any(_active_owner_count(sid) <= 1 for sid in system_ids)

    if kind == "missing_owner":
        return any(_active_owner_count(sid) == 0 for sid in system_ids)

    if kind == "orphan":
        # Opened when nothing depended on it AND it had no active owner.
        return any(
            not _has_inbound_dependency(sid) and _active_owner_count(sid) == 0
            for sid in system_ids
        )

    if kind == "decay":
        # Closes when the claim is confirmed fresh again, or replaced.
        for cid in claim_ids:
            facts = _claim_facts(cid)
            if facts and not facts["superseded"] and facts["confidence"] < CONFIDENCE_FLOOR:
                return True
        return False

    if kind == "contradiction":
        # Two claims disagreed. Replacing either one settles it.
        ids = (pair_key or "").split("|") if pair_key else claim_ids
        for cid in [i for i in ids if i]:
            facts = _claim_facts(cid)
            if facts is None or facts["superseded"]:
                return False
        return True

    if kind in ("user_doubt", "verification_requested"):
        # A human asked for these to be checked. They close once every
        # claim involved has been answered for — replaced, or re-asserted
        # after the doubt was raised.
        ids = [i for i in (pair_key or "").split("|") if i] or claim_ids
        for cid in ids:
            facts = _claim_facts(cid)
            if facts is None:
                continue
            answered = facts["superseded"] or (
                facts["asserted_at"] is not None and facts["asserted_at"] >= found_at
            )
            if not answered:
                return True
        return False

    # Unrecognised kind: leave it open rather than guess.
    return True


def _refresh_bus_factor(finding_id: str, system_ids: list[str]) -> None:
    """Rewrite a bus-factor finding's detail from the current owners."""
    for sid in system_ids:
        r = ro_query(
            """MATCH (s:System {id: $id})
               OPTIONAL MATCH (s)<-[o:OWNS]-(p:Person)
               WHERE o.until IS NULL AND p.active = true
               WITH s, collect(p.name) AS owners
               RETURN s.name, s.tier, size(owners),
                      CASE WHEN size(owners) = 1 THEN owners[0] ELSE null END""",
            {"id": sid},
        )
        if not r.result_set:
            continue
        name, tier, count, sole = r.result_set[0]
        severity, detail = _bus_factor_wording(name, tier, count, sole)
        query(
            """MATCH (f:Finding {id: $fid})
               SET f.detail = $detail, f.severity = $severity""",
            {"fid": finding_id, "detail": detail, "severity": severity},
        )


def recheck_findings(target_ids: list[str], response_id: str | None = None) -> list[dict]:
    """
    Re-evaluate every unresolved finding touching these targets and close
    the ones whose problem is gone.

    `target_ids` are node ids — claims, systems, teams, whatever changed.
    Returns the findings that were resolved, for the caller to report.
    """
    ids = [t for t in dict.fromkeys(target_ids) if t]
    if not ids:
        return []

    rows = ro_query(
        """MATCH (f:Finding)-[:FLAGS]->(t)
           WHERE t.id IN $ids AND f.state <> 'resolved'
           WITH DISTINCT f
           OPTIONAL MATCH (f)-[:FLAGS]->(c:Claim)
           WITH f, collect(DISTINCT c.id) AS claim_ids
           OPTIONAL MATCH (f)-[:FLAGS]->(s:System)
           RETURN f.id, f.kind, f.pair_key, f.found_at, f.detail,
                  claim_ids, collect(DISTINCT s.id)""",
        {"ids": ids},
    ).result_set

    now = now_epoch()
    resolved = []

    for fid, kind, pair_key, found_at, detail, claim_ids, system_ids in rows:
        claim_ids = [c for c in (claim_ids or []) if c]
        system_ids = [s for s in (system_ids or []) if s]

        if _still_true(kind, pair_key, found_at or 0, claim_ids, system_ids):
            # Still a problem — but the shape of it may have changed (an
            # owner handover turns "no active owner" into "only one
            # owner"). Refresh the wording so nothing stale is quoted.
            if kind == "bus_factor":
                _refresh_bus_factor(fid, system_ids)
            continue

        query(
            """MATCH (f:Finding {id: $fid})
               SET f.state = 'resolved', f.resolved_at = $now""",
            {"fid": fid, "now": now},
        )
        if response_id:
            # Provenance: which human answer closed this.
            query(
                """MATCH (f:Finding {id: $fid}), (r:Response {id: $rid})
                   MERGE (f)-[:RESOLVED_BY]->(r)""",
                {"fid": fid, "rid": response_id},
            )
        resolved.append({
            "finding_id": fid,
            "kind": kind,
            "detail": detail,
            "resolved_at": now,
        })

    if resolved:
        print(f"  ✓ resolved {len(resolved)} finding(s) that are no longer true")
    return resolved
