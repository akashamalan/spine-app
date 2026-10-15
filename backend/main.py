"""
SPINE — FastAPI backend.

Every other company brain waits to be asked. This one asks you.
"""
import os
import json
import time
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.utils.graph import ro_query, query, now_epoch
from backend.utils.confidence import compute_confidence, format_confidence
from backend.tools.answer_tools import (
    find_entry_points, neighbours, path_between,
    blast_radius, who_knows, decision_chain,
    check_findings, broken_path,
)
from backend.agents.reflex_agents import run_all_deterministic


# ── Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify graph connection
    try:
        result = ro_query("RETURN 1")
        print("✓ FalkorDB connected")
    except Exception as e:
        print(f"⚠ FalkorDB connection failed: {e}")
    yield


app = FastAPI(
    title="SPINE",
    description="Answer Engine + Reflex Layer + Vera",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str


class VeraResponse(BaseModel):
    probe_id: str
    answer: str
    free_text: str | None = None


# ── Health ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    try:
        result = ro_query("MATCH (n) RETURN count(n) AS nodes")
        nodes = result.result_set[0][0] if result.result_set else 0
        result2 = ro_query("MATCH ()-[r]->() RETURN count(r) AS edges")
        edges = result2.result_set[0][0] if result2.result_set else 0
        return {"status": "ok", "nodes": nodes, "edges": edges}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── Graph stats ───────────────────────────────────────────────────────────

@app.get("/api/graph/stats")
async def graph_stats():
    """Return node/edge counts by type for the health dashboard."""
    nodes = ro_query("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC")
    edges = ro_query("MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC")

    return {
        "nodes": {row[0]: row[1] for row in nodes.result_set},
        "edges": {row[0]: row[1] for row in edges.result_set},
    }


# ── Findings feed (SSE) ──────────────────────────────────────────────────

@app.get("/api/findings/stream")
async def findings_stream():
    """SSE stream of findings — The Pulse."""
    async def generate() -> AsyncGenerator[str, None]:
        # Send all existing findings first
        result = ro_query(
            """MATCH (f:Finding)
               OPTIONAL MATCH (f)-[:FLAGS]->(target)
               RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                      target.id, labels(target)[0],
                      CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END
               ORDER BY f.found_at DESC"""
        )

        for row in result.result_set:
            event = {
                "finding_id": row[0], "kind": row[1], "basis": row[2],
                "state": row[3], "severity": row[4], "detail": row[5],
                "found_at": row[6], "target_id": row[7],
                "target_type": row[8], "target_name": row[9],
            }
            yield f"data: {json.dumps(event)}\n\n"

        # Then poll for new findings every 5 seconds
        last_check = now_epoch()
        while True:
            await asyncio.sleep(5)
            new_result = ro_query(
                """MATCH (f:Finding)
                   WHERE f.found_at > $since
                   OPTIONAL MATCH (f)-[:FLAGS]->(target)
                   RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                          target.id, labels(target)[0],
                          CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END
                   ORDER BY f.found_at ASC""",
                {"since": last_check}
            )
            for row in new_result.result_set:
                event = {
                    "finding_id": row[0], "kind": row[1], "basis": row[2],
                    "state": row[3], "severity": row[4], "detail": row[5],
                    "found_at": row[6], "target_id": row[7],
                    "target_type": row[8], "target_name": row[9],
                }
                yield f"data: {json.dumps(event)}\n\n"
                last_check = max(last_check, row[6])

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Answer endpoint (SSE walk) ────────────────────────────────────────────

@app.post("/api/ask")
async def ask_question(req: AskRequest):
    """
    Answer a question by walking the graph. Returns SSE with each hop.

    Each event is a tool invocation with the Cypher query and results,
    so the frontend can animate the traversal hop by hop.
    """
    async def generate() -> AsyncGenerator[str, None]:
        question = req.question

        # Hop 1: Find entry points via vector search
        yield f"data: {json.dumps({'hop': 1, 'action': 'searching', 'description': 'Finding relevant claims...'})}\n\n"
        await asyncio.sleep(0.4)  # animation pacing

        entries = find_entry_points(question, limit=5)
        yield f"data: {json.dumps({'hop': 1, 'action': 'result', **entries})}\n\n"

        if not entries["results"]:
            yield f"data: {json.dumps({'hop': 1, 'action': 'done', 'answer': 'No relevant information found in the knowledge graph.'})}\n\n"
            return

        # Hop 2: Check the top entry's entity for findings
        top_claim = entries["results"][0]
        yield f"data: {json.dumps({'hop': 2, 'action': 'checking', 'description': f'Checking findings for top match...'})}\n\n"
        await asyncio.sleep(0.4)

        # Get what entity this claim is about
        about_result = ro_query(
            "MATCH (c:Claim {id: $cid})-[:ABOUT]->(e) RETURN e.id, labels(e)[0]",
            {"cid": top_claim["claim_id"]}
        )

        if about_result.result_set:
            entity_id = about_result.result_set[0][0]
            entity_type = about_result.result_set[0][1]

            # Check for findings
            findings_result = check_findings(entity_id)
            yield f"data: {json.dumps({'hop': 2, 'action': 'result', **findings_result})}\n\n"

            # Hop 3: Who knows about this?
            yield f"data: {json.dumps({'hop': 3, 'action': 'checking', 'description': 'Finding who knows about this...'})}\n\n"
            await asyncio.sleep(0.4)

            who = who_knows(entity_id)
            yield f"data: {json.dumps({'hop': 3, 'action': 'result', **who})}\n\n"

            # Hop 4: Check ownership — the broken-path demo
            yield f"data: {json.dumps({'hop': 4, 'action': 'checking', 'description': 'Checking ownership chain...'})}\n\n"
            await asyncio.sleep(0.4)

            bp = broken_path(question, entity_id)
            yield f"data: {json.dumps({'hop': 4, 'action': 'result', **bp})}\n\n"

            # Hop 5: Neighbours for context
            yield f"data: {json.dumps({'hop': 5, 'action': 'checking', 'description': 'Gathering context from neighbours...'})}\n\n"
            await asyncio.sleep(0.4)

            nbrs = neighbours(entity_id)
            yield f"data: {json.dumps({'hop': 5, 'action': 'result', **nbrs})}\n\n"

        # Final: Compose answer
        answer_parts = []
        for e in entries["results"][:3]:
            stale_mark = " ⚠ (stale)" if e["stale"] else ""
            answer_parts.append(f"• {e['text']} [{e['confidence']:.0%} confidence{stale_mark}]")

        if about_result.result_set and bp.get("has_gap"):
            answer_parts.append(f"\n⚠ OWNERSHIP GAP: {bp['gap_explanation']}")

        if about_result.result_set and findings_result.get("has_open_findings"):
            for f in findings_result["findings"][:3]:
                answer_parts.append(f"\n🔍 Finding: {f['detail'][:120]}")

        answer = "\n".join(answer_parts)
        yield f"data: {json.dumps({'hop': 'final', 'action': 'answer', 'answer': answer})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── All findings (non-streaming) ──────────────────────────────────────────

@app.get("/api/findings")
async def list_findings():
    """Get all findings, newest first."""
    result = ro_query(
        """MATCH (f:Finding)
           OPTIONAL MATCH (f)-[:FLAGS]->(target)
           RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                  collect(DISTINCT {id: target.id, type: labels(target)[0],
                          name: CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END})
           ORDER BY f.found_at DESC"""
    )

    findings = []
    for row in result.result_set:
        findings.append({
            "finding_id": row[0], "kind": row[1], "basis": row[2],
            "state": row[3], "severity": row[4], "detail": row[5],
            "found_at": row[6], "targets": row[7],
        })

    return {"findings": findings, "count": len(findings)}


# ── Reflex trigger ────────────────────────────────────────────────────────

@app.post("/api/reflexes/run")
async def trigger_reflexes():
    """Manually trigger all deterministic reflex agents."""
    results = run_all_deterministic()
    return results


# ── Vera endpoints ────────────────────────────────────────────────────────

@app.get("/api/vera/probes")
async def list_probes():
    """Get all open Vera probes (VerifyTasks needing human answers)."""
    result = ro_query(
        """MATCH (vt:VerifyTask)
           WHERE vt.status = 'open'
           OPTIONAL MATCH (f:Finding)-[:RAISED_BY]->(vt)
           OPTIONAL MATCH (f)-[:FLAGS]->(target)
           RETURN vt.id, vt.question, vt.created_at, vt.claim_id,
                  f.id, f.kind, f.severity,
                  target.id,
                  CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END
           ORDER BY vt.created_at DESC"""
    )

    probes = []
    for row in result.result_set:
        probes.append({
            "task_id": row[0], "question": row[1],
            "created_at": row[2], "claim_id": row[3],
            "finding_id": row[4], "finding_kind": row[5],
            "severity": row[6], "target_id": row[7], "target_name": row[8],
        })

    return {"probes": probes, "count": len(probes)}


@app.post("/api/vera/respond")
async def vera_respond(resp: VeraResponse):
    """
    Submit a human answer to a Vera probe.

    This is the ONLY path that can legitimately change Layer 2:
    a human's answer carried by Vera, not Vera's own guess.
    """
    now = now_epoch()

    # Get the VerifyTask
    vt_result = ro_query(
        "MATCH (vt:VerifyTask {id: $id}) RETURN vt.claim_id, vt.status",
        {"id": resp.probe_id}
    )

    if not vt_result.result_set:
        raise HTTPException(404, "Probe not found")

    claim_id = vt_result.result_set[0][0]
    status = vt_result.result_set[0][1]

    if status != "open":
        raise HTTPException(400, "Probe already answered")

    # Create Response node (Layer 1 — immutable record of what the human said)
    response_id = f"resp-{now}"
    query(
        """CREATE (r:Response {
            id: $id, answer: $answer, free_text: $free_text,
            answered_at: $now
        })""",
        params={
            "id": response_id, "answer": resp.answer,
            "free_text": resp.free_text, "now": now,
        }
    )

    # Link Response → Probe (ANSWERED)
    query(
        """MATCH (r:Response {id: $rid}), (vt:VerifyTask {id: $vtid})
           CREATE (r)-[:ANSWERED]->(vt)""",
        params={"rid": response_id, "vtid": resp.probe_id}
    )

    # Close the VerifyTask
    query(
        "MATCH (vt:VerifyTask {id: $id}) SET vt.status = 'resolved', vt.resolved_at = $now",
        {"id": resp.probe_id, "now": now}
    )

    # If answer confirms the claim is still true, refresh its asserted_at
    if resp.answer in ("confirm", "still_true", "yes"):
        query(
            """MATCH (c:Claim {id: $cid})
               SET c.asserted_at = $now, c.base_conf = 0.98""",
            {"cid": claim_id, "now": now}
        )
        # Resolve the finding too
        query(
            """MATCH (f:Finding)-[:RAISED_BY]->(vt:VerifyTask {id: $vtid})
               SET f.state = 'resolved'""",
            {"vtid": resp.probe_id}
        )

    return {
        "status": "recorded",
        "response_id": response_id,
        "claim_refreshed": resp.answer in ("confirm", "still_true", "yes"),
    }


# ── Entity detail ─────────────────────────────────────────────────────────

@app.get("/api/entity/{entity_id}")
async def get_entity(entity_id: str):
    """Get full detail about any entity — claims, confidence, findings."""
    # Get the entity itself
    entity = ro_query(
        """MATCH (e {id: $id})
           RETURN e.id, labels(e)[0],
                  CASE WHEN e.name IS NOT NULL THEN e.name
                       WHEN e.title IS NOT NULL THEN e.title
                       ELSE e.id END AS label,
                  properties(e) AS props""",
        {"id": entity_id}
    )

    if not entity.result_set:
        raise HTTPException(404, "Entity not found")

    row = entity.result_set[0]
    now = now_epoch()

    # Get claims about this entity
    claims = ro_query(
        """MATCH (c:Claim)-[:ABOUT]->(e {id: $id})
           RETURN c.id, c.text, c.fact_type, c.base_conf,
                  c.half_life_days, c.asserted_at
           ORDER BY c.asserted_at DESC""",
        {"id": entity_id}
    )

    claim_list = []
    for cr in claims.result_set:
        conf = compute_confidence(cr[3], cr[4], cr[5], now_epoch=now)
        claim_list.append({
            "id": cr[0], "text": cr[1], "fact_type": cr[2],
            "confidence": conf, "confidence_label": format_confidence(conf),
            "asserted_at": cr[5],
        })

    # Get findings
    findings = check_findings(entity_id)

    # Get ownership
    ownership = who_knows(entity_id)

    return {
        "id": row[0], "type": row[1], "label": row[2],
        "claims": claim_list,
        "findings": findings["findings"],
        "people": ownership["people"],
        "has_active_owner": ownership["has_active_owner"],
    }
