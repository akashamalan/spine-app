"""
The demo engine: admin-only scenarios that make an honest change to the
graph, run the reflexes, and report what SPINE then noticed.

Nothing here fakes a finding. Each scenario edits real Layer 1 / Layer 2
data the way the world would (someone leaves, time passes, a new document
disagrees, a service appears with no owner) and then the ordinary reflex
agents do the noticing. Every node a scenario creates carries
`simulated: true`, and every edit it makes is tagged, so it can be told
apart from the seeded company. `POST /api/simulate/reset` rebuilds the seed.

All of the people, services and documents here are invented.
"""
import importlib
import threading
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from backend.auth import User, require_admin
from backend.utils.graph import ro_query, query, now_epoch
from backend.utils.embeddings import embed_text
from backend.agents.reflex_agents import run_all_reflexes

router = APIRouter(prefix="/api/simulate", tags=["simulation"])

DAY = 86400
# One scenario at a time: they read, write and then re-read the same graph.
_lock = threading.Lock()


class LeaveBody(BaseModel):
    person_id: str | None = Field(default=None, description="Who leaves; defaults to the person who owns the most.")


class TimeBody(BaseModel):
    days: int = Field(default=183, ge=1, le=1500)


# ── helpers ──────────────────────────────────────────────────────────────

def _embed_claim(claim_id: str, text: str) -> None:
    """New claims get a vector like seeded ones so questions can find them."""
    try:
        vec = embed_text(text)
        query("MATCH (c:Claim {id: $id}) SET c.embedding = vecf32($vec)", {"id": claim_id, "vec": vec})
    except Exception as e:  # the claim is still real without a vector
        print(f"  simulate: could not embed {claim_id}: {e}")


def _new_findings(since: int) -> list[dict]:
    """Findings the reflexes touched since `since`, in the findings-stream shape."""
    rows = ro_query(
        """MATCH (f:Finding)
           WHERE f.found_at >= $since AND f.state <> 'resolved'
           OPTIONAL MATCH (f)-[:FLAGS]->(target)
           RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                  target.id, labels(target)[0],
                  CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END,
                  f.just_created
           ORDER BY f.found_at ASC""",
        {"since": since},
    ).result_set
    out: dict[str, dict] = {}
    for r in rows:
        # A finding can flag several things; keep the first non-claim target.
        cur = out.get(r[0])
        if cur is None or (cur["target_type"] == "Claim" and r[8] != "Claim"):
            out[r[0]] = {
                "finding_id": r[0], "kind": r[1], "basis": r[2], "state": r[3],
                "severity": r[4], "detail": r[5], "found_at": r[6],
                "target_id": r[7], "target_type": r[8], "target_name": r[9],
                "is_new": bool(r[10]),
            }
    return list(out.values())


def _finish(scenario: str, started: int, changed: list[str], extra: dict | None = None) -> dict:
    """Run the reflexes, tag what is new, log the run, and report."""
    reflexes = run_all_reflexes()
    # Findings born during this run came from this scenario.
    query(
        """MATCH (f:Finding) WHERE f.found_at >= $since AND f.just_created = true
           SET f.simulated = true, f.simulated_by = $sc""",
        {"since": started, "sc": scenario},
    )
    findings = _new_findings(started)
    run_id = f"sim-{uuid.uuid4().hex[:8]}"
    query(
        """CREATE (:SimulationRun {id: $id, scenario: $sc, at: $now,
                                   summary: $summary, simulated: true})""",
        {"id": run_id, "sc": scenario, "now": now_epoch(), "summary": " ".join(changed)[:400]},
    )
    return {
        "scenario": scenario,
        "run_id": run_id,
        "changed": changed,
        "findings": findings,
        "new_findings": sum(1 for f in findings if f["is_new"]),
        "reflexes": {k: len(v) for k, v in reflexes.items() if isinstance(v, list)},
        **(extra or {}),
    }


def _default_leaver() -> tuple[str, str] | None:
    r = ro_query(
        """MATCH (p:Person) WHERE p.active = true
           OPTIONAL MATCH (p)-[o:OWNS]->(:System) WHERE o.until IS NULL
           RETURN p.id, p.name, count(o) AS n ORDER BY n DESC, p.name LIMIT 1"""
    ).result_set
    return (r[0][0], r[0][1]) if r else None


# ── scenarios ────────────────────────────────────────────────────────────

def _person_leaves(person_id: str | None) -> dict:
    started = now_epoch()
    if person_id:
        r = ro_query("MATCH (p:Person {id: $id}) RETURN p.id, p.name, p.active", {"id": person_id}).result_set
        if not r:
            raise HTTPException(404, "There is no such person.")
        if r[0][2] is False:
            raise HTTPException(409, f"{r[0][1]} has already left the company.")
        pid, name = r[0][0], r[0][1]
    else:
        picked = _default_leaver()
        if not picked:
            raise HTTPException(409, "Everyone has already left.")
        pid, name = picked

    owned = ro_query(
        """MATCH (p:Person {id: $id})-[o:OWNS]->(s:System) WHERE o.until IS NULL
           RETURN s.id, s.name""", {"id": pid}
    ).result_set
    query(
        """MATCH (p:Person {id: $id})
           SET p.active = false, p.left_at = $now, p.simulated_change = 'person_leaves'""",
        {"id": pid, "now": started},
    )
    query(
        """MATCH (:Person {id: $id})-[o:OWNS]->(:System) WHERE o.until IS NULL
           SET o.until = $now, o.simulated_change = 'person_leaves'""",
        {"id": pid, "now": started},
    )
    changed = [f"{name} left the company."]
    if owned:
        changed.append("They stopped owning: " + ", ".join(s[1] for s in owned) + ".")

    # The facts that name them as an owner are now in doubt, so Vera asks
    # the people who are still around to confirm or correct them.
    from backend import main as m  # imported here: main imports this module
    asked = []
    for sys_id, sys_name in owned:
        claims = ro_query(
            """MATCH (c:Claim)-[:ABOUT]->(:System {id: $sid})
               WHERE c.fact_type = 'ownership' AND c.text CONTAINS $name
                 AND NOT (:Claim)-[:SUPERSEDES]->(c)
               RETURN c.id, c.text""",
            {"sid": sys_id, "name": name},
        ).result_set
        for cid, text in claims:
            f = query(
                """MERGE (f:Finding {kind: 'verification_requested', pair_key: $cid})
                   ON CREATE SET f.id = $fid, f.basis = 'structural', f.state = 'suspected',
                       f.severity = 'high', f.detail = $detail, f.found_at = $now,
                       f.just_created = true
                   ON MATCH SET f.state = 'suspected', f.detail = $detail, f.found_at = $now,
                       f.just_created = false
                   RETURN f.id""",
                {"cid": cid, "fid": f"finding-{uuid.uuid4().hex[:8]}", "now": started,
                 "detail": f"{name} left, so \"{text[:80]}\" may no longer be true."},
            ).result_set[0][0]
            m._flag_claim_and_subject(f, cid)
            task_id, new = m._raise_probe(f, cid, text, started, origin="simulation")
            if new:
                asked.append(sys_name)
    if asked:
        changed.append("Vera now has a question about: " + ", ".join(dict.fromkeys(asked)) + ".")
    return _finish("person_leaves", started, changed, {"person_id": pid, "person_name": name})


def _time_passes(days: int) -> dict:
    started = now_epoch()
    n = query(
        """MATCH (c:Claim) WHERE c.half_life_days < 100000
           SET c.asserted_at = c.asserted_at - $secs,
               c.simulated_shift_days = coalesce(c.simulated_shift_days, 0) + $d
           RETURN count(c)""",
        {"secs": days * DAY, "d": days},
    ).result_set[0][0]
    months = round(days / 30.44)
    changed = [f"{months} {'month' if months == 1 else 'months'} pass. {n} facts are now {days} days older than they were."]
    return _finish("time_passes", started, changed)


SIM_RUNBOOK = (
    "Rollback procedure: redeploy the last tagged container image from ArgoCD. "
    "Never revert git commits and never use feature flags for rollbacks."
)


def _docs_conflict() -> dict:
    started = now_epoch()
    if ro_query("MATCH (c:Claim {simulated: true, fact_type: 'process'}) RETURN c.id LIMIT 1").result_set:
        raise HTTPException(409, "A document that disagrees has already been added. Reset to try it again.")
    suffix = uuid.uuid4().hex[:6]
    doc_id, claim_id = f"doc-sim-{suffix}", f"claim-sim-{suffix}"
    query(
        """CREATE (:Document {id: $id, title: 'Deploy Runbook v5 (draft)', type: 'notion',
                              created_at: $now, url: 'https://notion.northwind.dev/deploy-v5',
                              simulated: true})""",
        {"id": doc_id, "now": started},
    )
    query(
        """CREATE (c:Claim {id: $id, text: $text, fact_type: 'process', half_life_days: 270,
                            base_conf: 0.9, asserted_at: $now, valid_from: $now, simulated: true})""",
        {"id": claim_id, "text": SIM_RUNBOOK, "now": started},
    )
    query(
        """MATCH (c:Claim {id: $cid}), (d:Document {id: $did}), (s:System {id: 'sys-api-gateway'})
           MERGE (c)-[:EXTRACTED_FROM]->(d)
           MERGE (c)-[:ABOUT]->(s)""",
        {"cid": claim_id, "did": doc_id},
    )
    _embed_claim(claim_id, SIM_RUNBOOK)
    changed = ["A new document, Deploy Runbook v5 (draft), says rollbacks must never use git or feature flags. The existing runbooks say the opposite."]
    return _finish("docs_conflict", started, changed)


NEW_SERVICES = ["invoice-archiver", "sms-gateway", "legacy-export-job", "feature-flag-sync", "cron-scheduler"]


def _orphan_service() -> dict:
    started = now_epoch()
    used = {r[0] for r in ro_query("MATCH (s:System) RETURN s.name").result_set}
    name = next((n for n in NEW_SERVICES if n not in used), None)
    if not name:
        raise HTTPException(409, "Every new service has already been added. Reset to start again.")
    suffix = uuid.uuid4().hex[:6]
    sys_id, doc_id, claim_id = f"sys-sim-{suffix}", f"doc-sim-{suffix}", f"claim-sim-{suffix}"
    text = f"The {name} service runs on a schedule and nobody on the team has been assigned to it."
    query(
        """CREATE (:System {id: $sid, name: $name, tier: 'medium', language: 'Python', simulated: true})""",
        {"sid": sys_id, "name": name},
    )
    query(
        """CREATE (:Document {id: $id, title: $title, type: 'notion', created_at: $now,
                              url: $url, simulated: true})""",
        {"id": doc_id, "title": f"{name} README", "now": started,
         "url": f"https://notion.northwind.dev/{name}"},
    )
    query(
        """CREATE (:Claim {id: $id, text: $text, fact_type: 'architecture', half_life_days: 270,
                           base_conf: 0.85, asserted_at: $now, valid_from: $now, simulated: true})""",
        {"id": claim_id, "text": text, "now": started},
    )
    query(
        """MATCH (c:Claim {id: $cid}), (d:Document {id: $did}), (s:System {id: $sid})
           MERGE (c)-[:EXTRACTED_FROM]->(d)
           MERGE (c)-[:ABOUT]->(s)""",
        {"cid": claim_id, "did": doc_id, "sid": sys_id},
    )
    _embed_claim(claim_id, text)
    changed = [f"A new service, {name}, appeared. Nobody owns it and nothing depends on it."]
    return _finish("orphan_service", started, changed, {"system_id": sys_id})


def _reset() -> dict:
    """Rebuild the seeded company exactly as it was first created."""
    started = now_epoch()
    for mod, fn in (("reset_graph", "reset_graph"), ("create_schema", "create_schema"),
                    ("seed_data", "seed"), ("embed_claims", "embed_claims")):
        getattr(importlib.import_module(f"scripts.{mod}"), fn)()
    changed = ["SPINE's company was rebuilt from its seed. All simulated changes are gone."]
    # A fresh seed has no findings yet; the reflexes find the planted faults.
    return _finish("reset", started, changed)


# ── routes (all admin-only) ──────────────────────────────────────────────

async def _guarded(fn, *args) -> dict:
    if not _lock.acquire(blocking=False):
        raise HTTPException(409, "Another simulation is still running. Give it a moment.")
    try:
        return await run_in_threadpool(fn, *args)
    finally:
        _lock.release()


@router.post("/person_leaves")
async def person_leaves(body: LeaveBody | None = None, _: User = Depends(require_admin)):
    return await _guarded(_person_leaves, (body.person_id if body else None))


@router.post("/time_passes")
async def time_passes(body: TimeBody | None = None, _: User = Depends(require_admin)):
    return await _guarded(_time_passes, (body.days if body else 183))


@router.post("/docs_conflict")
async def docs_conflict(_: User = Depends(require_admin)):
    return await _guarded(_docs_conflict)


@router.post("/orphan_service")
async def orphan_service(_: User = Depends(require_admin)):
    return await _guarded(_orphan_service)


@router.post("/reset")
async def reset(_: User = Depends(require_admin)):
    return await _guarded(_reset)
