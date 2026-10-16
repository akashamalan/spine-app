"""
SPINE — FastAPI backend.

Every other company brain waits to be asked. This one asks you.
"""
import os
import json
import time
import uuid
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import logging

from fastapi import Depends, FastAPI, Query, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

try:  # FalkorDB speaks the Redis protocol; its failures surface as redis errors.
    import redis.exceptions as _redis_errors
    _GRAPH_ERRORS: tuple = (_redis_errors.RedisError,)
except ImportError:  # pragma: no cover
    _GRAPH_ERRORS = ()

from backend.auth import User, current_user, require_admin
from backend.utils.graph import ro_query, query, now_epoch
from backend.utils.confidence import compute_confidence, format_confidence
from backend.utils.embeddings import embed_text
from backend.tools.answer_tools import (
    find_entry_points, neighbours, path_between,
    blast_radius, who_knows, decision_chain,
    check_findings, broken_path,
    resolve_entity, claims_about, replaced_claims_about,
)
from backend.agents.reflex_agents import run_all_reflexes, recheck_findings
from backend.tools import subgraph as sg
from backend.utils.llm import (
    chat, chat_json, LLMError, llm_status,
    ANSWER_MODEL, CONTRADICTION_MODEL,
)


# ── Errors + request log ──────────────────────────────────────────────────

_request_log = logging.getLogger("spine.request")
if not _request_log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(message)s"))
    _request_log.addHandler(_h)
    _request_log.setLevel(logging.INFO)
    _request_log.propagate = False

# Shown to the user verbatim, so plain words, not stack traces.
_FRIENDLY = {
    "graph_unavailable": "I couldn't reach the knowledge graph. Check that FalkorDB is running and the FALKORDB_* settings in .env are right.",
    "llm_unavailable": "The language model is unavailable right now.",
    "internal_error": "Something went wrong on the SPINE server.",
}


def classify_error(e: BaseException) -> str:
    """Map an exception to a stable error kind the frontend can switch on."""
    if _GRAPH_ERRORS and isinstance(e, _GRAPH_ERRORS):
        return "graph_unavailable"
    if isinstance(e, (ConnectionError, TimeoutError, OSError)):
        return "graph_unavailable"
    if isinstance(e, LLMError):
        return "llm_unavailable"
    return "internal_error"


def error_payload(e: BaseException) -> dict:
    kind = classify_error(e)
    return {"error": kind, "message": _FRIENDLY[kind], "detail": str(e)[:300]}


def _log_request(request: Request, status: int, started: float, outcome: str):
    """One structured key=value line per request."""
    ms = round((time.perf_counter() - started) * 1000)
    person = json.dumps(request.headers.get("x-spine-person", "-"))
    role = json.dumps(request.headers.get("x-spine-role", "-"))
    # A handler can report what really happened (e.g. an SSE stream that
    # ended on a graph error, or an answer that fell back to the template)
    # even though the HTTP layer saw a normal 200.
    outcome = getattr(request.state, "spine_outcome", None) or outcome
    _request_log.info(
        f"route=\"{request.method} {request.url.path}\" person={person} "
        f"role={role} ms={ms} status={status} outcome={outcome}"
    )


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

@app.middleware("http")
async def log_and_guard(request: Request, call_next):
    """
    Logs one line per request and turns any unhandled exception into a
    clean JSON error — never a 500 HTML page — so the frontend can say
    "I couldn't reach the graph" instead of hanging.

    Streaming responses are logged when the stream ends (or the client
    disconnects), so `ms` is the real duration, not time-to-first-byte.
    """
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as e:
        payload = error_payload(e)
        status = 503 if payload["error"] != "internal_error" else 500
        _log_request(request, status, started, payload["error"])
        return JSONResponse(payload, status_code=status)

    if response.headers.get("content-type", "").startswith("text/event-stream"):
        body = response.body_iterator

        async def logged_stream():
            outcome = "ok"
            try:
                async for chunk in body:
                    yield chunk
            except (asyncio.CancelledError, GeneratorExit):
                outcome = "client_disconnected"
                raise
            except Exception as e:
                outcome = classify_error(e)
                raise
            finally:
                _log_request(request, response.status_code, started, outcome)

        response.body_iterator = logged_stream()
    else:
        outcome = "ok" if response.status_code < 400 else f"http_{response.status_code}"
        _log_request(request, response.status_code, started, outcome)

    return response


from backend.simulate import router as simulate_router  # noqa: E402
app.include_router(simulate_router)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(
        {"error": "http_error", "message": str(exc.detail), "detail": exc.detail},
        status_code=exc.status_code,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        {"error": "invalid_request", "message": "The request body was not valid.",
         "detail": jsonable_encoder(exc.errors())},
        status_code=422,
    )


# Added last so it is the outermost layer: CORS headers are applied even to
# the JSON error responses produced above.
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
    # Who answered. Optional until roles land (Job 2); falls back to the
    # X-Spine-Person header.
    answered_by: str | None = None


class FeedbackRequest(BaseModel):
    """👎 on an answer."""
    question: str
    answer: str | None = None
    # The evidence claims the person doubts — the UI sends the answer's
    # evidence[].claim_id. At least one is required: a doubt needs a target.
    claim_ids: list[str] = Field(default_factory=list)
    reason: str | None = None
    person: str | None = None


class VeraAskRequest(BaseModel):
    """Admin asks Vera to verify specific claims now."""
    claim_ids: list[str] = Field(default_factory=list)
    note: str | None = None
    requested_by: str | None = None


# ── Health ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """
    Liveness for both dependencies. `status` is "ok" only when the graph
    AND the LLM are usable; "degraded" means the graph works but answers
    will fall back to templates — which used to happen silently.
    """
    graph: dict
    try:
        result = ro_query("MATCH (n) RETURN count(n) AS nodes")
        nodes = result.result_set[0][0] if result.result_set else 0
        result2 = ro_query("MATCH ()-[r]->() RETURN count(r) AS edges")
        edges = result2.result_set[0][0] if result2.result_set else 0
        graph = {"ok": True, "nodes": nodes, "edges": edges}
    except Exception as e:
        graph = {"ok": False, **error_payload(e)}

    llm = await asyncio.to_thread(llm_status)

    if not graph["ok"]:
        status = "error"
    elif not llm["ok"]:
        status = "degraded"
    else:
        status = "ok"

    body = {"status": status, "graph": graph, "llm": llm}
    # Kept at top level for existing callers.
    if graph["ok"]:
        body.update(nodes=graph["nodes"], edges=graph["edges"])
    return JSONResponse(body, status_code=200 if graph["ok"] else 503)


# ── Graph stats ───────────────────────────────────────────────────────────

@app.get("/api/graph/stats")
async def graph_stats():
    """
    Node/edge counts by type, plus what needs attention: open (unresolved)
    findings by severity and open Vera probes.
    """
    nodes = ro_query("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC")
    edges = ro_query("MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC")
    severities = ro_query(
        """MATCH (f:Finding) WHERE f.state <> 'resolved'
           RETURN f.severity, count(f)"""
    )
    open_tasks = ro_query(
        "MATCH (vt:VerifyTask) WHERE vt.status = 'open' RETURN count(vt)"
    )

    by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for sev, cnt in severities.result_set:
        by_severity[sev or "unknown"] = by_severity.get(sev or "unknown", 0) + cnt

    return {
        "nodes": {row[0]: row[1] for row in nodes.result_set},
        "edges": {row[0]: row[1] for row in edges.result_set},
        "open_findings_by_severity": by_severity,
        "open_findings": sum(by_severity.values()),
        "open_verify_tasks": open_tasks.result_set[0][0] if open_tasks.result_set else 0,
    }


# ── Findings feed (SSE) ──────────────────────────────────────────────────

@app.get("/api/graph/overview")
async def graph_overview():
    """
    The whole company for the idle map: people, teams, services and
    documents with the relationships between them. No claims, no findings.
    Same {nodes, edges} shape as the subgraph on /api/ask hop events.
    """
    return await asyncio.to_thread(sg.overview)


@app.get("/api/findings/stream")
async def findings_stream():
    """SSE stream of findings — The Pulse."""
    def graph_error_event(e: BaseException) -> str:
        # Named event: EventSource.onmessage ignores it, so it can never be
        # mistaken for a Finding; the UI listens for "graph_error" explicitly.
        return f"event: graph_error\ndata: {json.dumps(error_payload(e))}\n\n"

    async def generate() -> AsyncGenerator[str, None]:
        # Send all existing findings first
        try:
            result = ro_query(
                """MATCH (f:Finding)
                   WHERE f.state <> 'resolved'
                   OPTIONAL MATCH (f)-[:FLAGS]->(target)
                   RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                          target.id, labels(target)[0],
                          CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END
                   ORDER BY f.found_at DESC"""
            )
            rows = result.result_set
            last_check = now_epoch()
        except Exception as e:
            yield graph_error_event(e)
            rows = []
            last_check = 0  # once the graph is back, stream everything

        for row in rows:
            event = {
                "finding_id": row[0], "kind": row[1], "basis": row[2],
                "state": row[3], "severity": row[4], "detail": row[5],
                "found_at": row[6], "target_id": row[7],
                "target_type": row[8], "target_name": row[9],
            }
            yield f"data: {json.dumps(event)}\n\n"

        # Then poll for new findings every 5 seconds
        while True:
            await asyncio.sleep(5)
            try:
                new_result = ro_query(
                    """MATCH (f:Finding)
                       WHERE f.found_at > $since
                          OR (f.resolved_at IS NOT NULL AND f.resolved_at > $since)
                       OPTIONAL MATCH (f)-[:FLAGS]->(target)
                       RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                              target.id, labels(target)[0],
                              CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END,
                              f.resolved_at
                       ORDER BY f.found_at ASC""",
                    {"since": last_check}
                )
            except Exception as e:
                yield graph_error_event(e)
                continue
            for row in new_result.result_set:
                event = {
                    "finding_id": row[0], "kind": row[1], "basis": row[2],
                    "state": row[3], "severity": row[4], "detail": row[5],
                    "found_at": row[6], "target_id": row[7],
                    "target_type": row[8], "target_name": row[9],
                    "resolved_at": row[10],
                }
                yield f"data: {json.dumps(event)}\n\n"
                last_check = max(last_check, row[6] or 0, row[10] or 0)

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Answer helpers ────────────────────────────────────────────────────────

INTENT_SYSTEM = """You classify questions asked against a company knowledge graph \
containing Systems, People, Teams, Projects, Decisions and Claims.

Return JSON with exactly two keys:
{"intent": "...", "entities": [...]}

intent must be one of:
- "greeting"  — hi, hello, thanks, how are you, who are you
- "off_topic" — not about this company's systems/people/processes (weather, trivia, math)
- "ownership" — who owns / maintains / is responsible for / who should I ask about X
- "impact"    — what breaks if X fails, what depends on X, blast radius
- "process"   — how do we do X: deploys, rollbacks, on-call, release steps
- "general"   — anything else about the company

entities: the proper nouns the user named, as written, e.g. ["billing service"].
Use [] when none are named. Never invent entities that were not mentioned."""

ANSWER_SYSTEM = """You answer questions about a company's internal systems for a new employee.

Answer in 2-4 plain sentences a new employee can understand.
Use ONLY the evidence provided. Never invent names or facts.
If a fact's confidence is below 60%, say it may be outdated.
If the evidence does not answer the question, say so honestly and say who might know.
Write plain prose. Do not use bullet points, markdown, or confidence percentages."""

GREETING_ANSWER = (
    "Hi! I answer questions about Northwind's systems, people and processes. "
    "Try: Who owns the billing service?"
)


def _classify_intent(question: str) -> dict:
    """Classify the question. Raises LLMError if Groq is unavailable."""
    data = chat_json(CONTRADICTION_MODEL, [
        {"role": "system", "content": INTENT_SYSTEM},
        {"role": "user", "content": question},
    ])

    intent = data.get("intent")
    if intent not in ("greeting", "off_topic", "ownership", "impact", "process", "general"):
        intent = "general"

    entities = data.get("entities") or []
    if not isinstance(entities, list):
        entities = []
    entities = [str(e) for e in entities if str(e).strip()]

    return {"intent": intent, "entities": entities}


def _compose_fallback_answer(evidence: list[dict], gap_explanation: str | None,
                             findings: list[dict]) -> str:
    """
    Deterministic answer used when Groq is unavailable.

    This is the pre-LLM behaviour, kept so the demo never breaks.
    """
    parts = []
    for e in evidence[:3]:
        stale_mark = " ⚠ (may be outdated)" if e["stale"] else ""
        parts.append(f"• {e['text']}{stale_mark}")

    if gap_explanation:
        parts.append(f"\n⚠ OWNERSHIP GAP: {gap_explanation}")

    for f in findings[:3]:
        parts.append(f"\n🔍 Finding: {f['detail'][:120]}")

    if not parts:
        return "No relevant information found in the knowledge graph."

    return "\n".join(parts)


# ── Answer endpoint (SSE walk) ────────────────────────────────────────────

@app.post("/api/ask")
async def ask_question(req: AskRequest, request: Request):
    """
    Answer a question by walking the graph. Returns SSE with each hop.

    Each event is a tool invocation with the Cypher query and results,
    so the frontend can animate the traversal hop by hop.
    """
    async def _walk() -> AsyncGenerator[str, None]:
        question = req.question
        evidence: list[dict] = []
        gap_explanation: str | None = None
        open_findings: list[dict] = []
        tool_evidence: dict = {}
        hop = 1

        def sse(payload: dict) -> str:
            # Additive: every event carries the part of the graph it touched
            # (empty when a step touches none), for the graph panel.
            if payload.get("subgraph") is None:
                payload["subgraph"] = {"nodes": [], "edges": []}
            return f"data: {json.dumps(payload)}\n\n"

        # ── Hop 1: Understand the question ───────────────────────────────
        yield sse({"hop": hop, "action": "checking", "tool": "classify_intent",
                   "description": "Understanding your question..."})
        await asyncio.sleep(0.4)

        try:
            parsed = await asyncio.to_thread(_classify_intent, question)
            llm_ok = True
        except LLMError as e:
            # No LLM — assume a normal question and walk the graph anyway.
            print(f"⚠ intent classification failed, falling back: {e}")
            parsed = {"intent": "general", "entities": []}
            llm_ok = False

        intent = parsed["intent"]
        named = parsed["entities"]

        yield sse({"hop": hop, "action": "result", "tool": "classify_intent",
                   "intent": intent, "entities": named, "llm": llm_ok,
                   "results": [{"name": f"intent: {intent}"}]
                             + [{"name": n} for n in named]})
        hop += 1

        # Small talk never touches the graph.
        if intent in ("greeting", "off_topic"):
            yield sse({"hop": "final", "action": "answer",
                       "answer": GREETING_ANSWER, "evidence": []})
            return

        # ── Hop 2: Resolve what they're asking about ─────────────────────
        yield sse({"hop": hop, "action": "checking", "tool": "resolve_entity",
                   "description": "Finding that in the graph..."})
        await asyncio.sleep(0.4)

        entity = None
        for name in named:
            entity = await asyncio.to_thread(resolve_entity, name)
            if entity:
                break

        entries = None
        if entity is None:
            # Nothing matched by name — fall back to vector search.
            entries = await asyncio.to_thread(find_entry_points, question, 5)
            if entries["results"]:
                top = entries["results"][0]
                about = ro_query(
                    "MATCH (c:Claim {id: $cid})-[:ABOUT]->(e) "
                    "RETURN e.id, CASE WHEN e.name IS NOT NULL THEN e.name ELSE e.id END, labels(e)[0]",
                    {"cid": top["claim_id"]},
                )
                if about.result_set:
                    r = about.result_set[0]
                    entity = {"id": r[0], "name": r[1], "type": r[2]}

        yield sse({"hop": hop, "action": "result", "tool": "resolve_entity",
                   "entity": entity,
                   "results": [entity] if entity else [],
                   "subgraph": (await asyncio.to_thread(sg.safe, sg.for_entity, entity))
                               if entity else None})
        hop += 1

        if entity is None:
            yield sse({"hop": "final", "action": "answer",
                       "answer": "I couldn't find anything about that in the knowledge graph. "
                                 "Try naming a system, person or team directly.",
                       "evidence": []})
            return

        entity_id = entity["id"]

        # ── Hops 3+: tools chosen by intent ──────────────────────────────
        if intent == "ownership":
            plan = ["who_knows", "broken_path", "check_findings"]
        elif intent == "impact":
            plan = ["blast_radius", "check_findings"]
        else:  # process / general
            plan = ["find_entry_points", "neighbours", "check_findings"]

        DESCRIPTIONS = {
            "who_knows": "Finding who knows about this...",
            "broken_path": "Checking ownership chain...",
            "check_findings": "Checking for open findings...",
            "blast_radius": "Tracing what depends on this...",
            "find_entry_points": "Finding relevant claims...",
            "neighbours": "Gathering context from neighbours...",
        }

        for tool_name in plan:
            yield sse({"hop": hop, "action": "checking", "tool": tool_name,
                       "description": DESCRIPTIONS[tool_name]})
            await asyncio.sleep(0.4)

            if tool_name == "who_knows":
                out = await asyncio.to_thread(who_knows, entity_id)
                tool_evidence["who_knows"] = out["people"]
            elif tool_name == "broken_path":
                out = await asyncio.to_thread(broken_path, question, entity_id)
                gap_explanation = out.get("gap_explanation")
                tool_evidence["ownership"] = out["ownership_records"]
            elif tool_name == "check_findings":
                out = await asyncio.to_thread(check_findings, entity_id)
                open_findings = out["findings"]
                tool_evidence["findings"] = out["findings"]
            elif tool_name == "blast_radius":
                out = await asyncio.to_thread(blast_radius, entity_id)
                tool_evidence["blast_radius"] = out["affected_names"]
            elif tool_name == "neighbours":
                out = await asyncio.to_thread(neighbours, entity_id)
                tool_evidence["neighbours"] = out["edges"][:15]
            elif tool_name == "find_entry_points":
                out = entries or await asyncio.to_thread(find_entry_points, question, 5)
                evidence = out["results"]

            if tool_name == "who_knows":
                picture = await asyncio.to_thread(sg.safe, sg.for_who_knows, entity_id, out)
            elif tool_name == "broken_path":
                picture = await asyncio.to_thread(sg.safe, sg.for_broken_path, entity_id, out)
            elif tool_name == "check_findings":
                picture = await asyncio.to_thread(sg.safe, sg.for_findings, entity_id, out)
            elif tool_name == "blast_radius":
                picture = await asyncio.to_thread(sg.safe, sg.for_blast_radius, entity_id, out)
            elif tool_name == "neighbours":
                picture = await asyncio.to_thread(sg.safe, sg.for_neighbours, entity_id, out)
            else:  # find_entry_points
                picture = await asyncio.to_thread(sg.safe, sg.for_entry_points, out, entity_id)

            yield sse({"hop": hop, "action": "result", **out, "subgraph": picture})
            hop += 1

        # Always attach claim-level evidence for the entity we landed on.
        if not evidence:
            evidence = await asyncio.to_thread(claims_about, entity_id, 5, question)
        tool_evidence["claims"] = evidence

        # ── Final: let the LLM phrase it, graph stays source of truth ────
        answer = None
        try:
            answer = await asyncio.to_thread(chat, ANSWER_MODEL, [
                {"role": "system", "content": ANSWER_SYSTEM},
                {"role": "user", "content": json.dumps({
                    "question": question,
                    "subject": entity,
                    "evidence": tool_evidence,
                }, default=str)},
            ])
        except LLMError as e:
            print(f"⚠ answer generation failed, falling back to template: {e}")
            request.state.spine_outcome = "llm_fallback"

        if not answer:
            answer = _compose_fallback_answer(evidence, gap_explanation, open_findings)

        # History for the UI only — labelled replaced, never shown to the LLM
        # above, never mixed into `evidence`.
        replaced = await asyncio.to_thread(replaced_claims_about, entity_id, 5)

        picture = await asyncio.to_thread(sg.safe, sg.for_evidence, evidence, replaced, entity_id)
        yield sse({"hop": "final", "action": "answer",
                   "answer": answer, "evidence": evidence,
                   "replaced": replaced, "subgraph": picture})

    async def generate() -> AsyncGenerator[str, None]:
        # Headers are already sent once streaming starts, so a failure can't
        # become a JSON error response. End the stream with a final answer
        # event carrying the error instead — the UI shows it, never hangs.
        try:
            async for chunk in _walk():
                yield chunk
        except Exception as e:
            payload = error_payload(e)
            request.state.spine_outcome = payload["error"]
            print(f"⚠ /api/ask failed mid-stream: {payload['error']}: {payload['detail']}")
            final = {"hop": "final", "action": "answer", "answer": payload["message"],
                     "evidence": [], "replaced": [], "error": payload,
                     "subgraph": {"nodes": [], "edges": []}}
            yield f"data: {json.dumps(final)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── All findings (non-streaming) ──────────────────────────────────────────

@app.get("/api/findings")
async def list_findings(include_resolved: bool = Query(False)):
    """
    Findings, newest first. Resolved ones are left out unless asked for:
    they stay in the graph as history, they just stop being reported.
    """
    result = ro_query(
        """MATCH (f:Finding)
           WHERE $include_resolved OR f.state <> 'resolved'
           OPTIONAL MATCH (f)-[:FLAGS]->(target)
           RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at,
                  collect(DISTINCT {id: target.id, type: labels(target)[0],
                          name: CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END}),
                  f.resolved_at
           ORDER BY f.found_at DESC""",
        {"include_resolved": include_resolved}
    )

    findings = []
    for row in result.result_set:
        findings.append({
            "finding_id": row[0], "kind": row[1], "basis": row[2],
            "state": row[3], "severity": row[4], "detail": row[5],
            "found_at": row[6], "targets": row[7],
            "resolved_at": row[8],
        })

    return {"findings": findings, "count": len(findings)}


# ── Reflex trigger ────────────────────────────────────────────────────────

@app.post("/api/reflexes/run")
async def trigger_reflexes(_: User = Depends(require_admin)):
    """Manually trigger all deterministic reflex agents."""
    results = run_all_reflexes()
    return results


# ── Vera endpoints ────────────────────────────────────────────────────────

@app.get("/api/vera/probes")
async def list_probes(user: User = Depends(current_user)):
    """
    Open Vera probes (VerifyTasks needing human answers). Admins see the
    whole inbox; a viewer sees only the questions aimed at them.
    """
    # Exactly one row per VerifyTask, however the joins fan out:
    #  - a finding can FLAG several things (a decay finding flags the claim
    #    and its system), so targets are collected into a list;
    #  - several findings can RAISE the same task (a decay finding plus a
    #    user's 👎 on the same claim), so findings collapse to the first
    #    one, with every kind listed in `finding_kinds`.
    result = ro_query(
        """MATCH (vt:VerifyTask)
           WHERE vt.status = 'open'
           OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(old:Claim {id: vt.claim_id})
           WITH vt, count(newer) AS replaced
           WHERE replaced = 0
           OPTIONAL MATCH (fx:Finding)-[:RAISED_BY]->(vt)
           WITH vt, collect(fx) AS fs
           WITH vt, head(fs) AS f, [x IN fs | x.kind] AS kinds
           OPTIONAL MATCH (f)-[:FLAGS]->(target)
           WHERE NOT target:Claim
           WITH vt, f, kinds,
                collect(DISTINCT {
                  id: target.id,
                  name: CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END
                }) AS targets
           RETURN vt.id, vt.question, vt.created_at, vt.claim_id,
                  f.id, f.kind, f.severity, targets, kinds
           ORDER BY vt.created_at DESC"""
    )

    probes = []
    for row in result.result_set:
        # Drop the empty placeholder collect() yields when there is no target.
        targets = [t for t in (row[7] or []) if t and t.get("id")]
        primary = targets[0] if targets else {}
        probes.append({
            "task_id": row[0], "question": row[1],
            "created_at": row[2], "claim_id": row[3],
            "finding_id": row[4], "finding_kind": row[5],
            "severity": row[6],
            "finding_kinds": [k for k in (row[8] or []) if k],
            "targets": targets,
            # Kept for existing callers.
            "target_id": primary.get("id"),
            "target_name": primary.get("name"),
        })

    audience = _audience([t["id"] for p in probes for t in p["targets"]])
    for p in probes:
        seen: dict[str, dict] = {}
        for t in p["targets"]:
            for person in audience.get(t["id"], []):
                seen.setdefault(person["id"], person)
        p["aimed_at"] = list(seen.values())
        # Name one person only when the question is really theirs (they own it,
        # know it, or it is about them); a team-wide question names nobody.
        first = p["aimed_at"][0] if p["aimed_at"] else None
        p["asked_of"] = first["name"] if first and first["why"] != "is on the team" else None

    if not user.is_admin:
        probes = [p for p in probes
                  if user.person_id and any(a["id"] == user.person_id for a in p["aimed_at"])]

    return {"probes": probes, "count": len(probes)}


def _audience(target_ids: list[str]) -> dict[str, list[dict]]:
    """
    Who a question about each target is really for, owners first: the people
    who currently own a system, then the people who know about it; a team's
    current members; a person is their own audience. People who have left
    are never asked.
    """
    ids = list(dict.fromkeys(i for i in target_ids if i))
    out: dict[str, list[dict]] = {i: [] for i in ids}
    if not ids:
        return out

    def add(tid: str, pid: str, name: str, why: str):
        if not any(x["id"] == pid for x in out[tid]):
            out[tid].append({"id": pid, "name": name, "why": why})

    for tid, pid, name in ro_query(
        """MATCH (p:Person)-[o:OWNS]->(e) WHERE e.id IN $ids AND p.active = true AND o.until IS NULL
           RETURN e.id, p.id, p.name ORDER BY p.name""", {"ids": ids}).result_set:
        add(tid, pid, name, "owns it")
    for tid, pid, name in ro_query(
        """MATCH (p:Person)-[:KNOWS_ABOUT]->(e) WHERE e.id IN $ids AND p.active = true
           RETURN e.id, p.id, p.name ORDER BY p.name""", {"ids": ids}).result_set:
        add(tid, pid, name, "knows about it")
    for tid, pid, name in ro_query(
        """MATCH (p:Person)-[:MEMBER_OF]->(t:Team) WHERE t.id IN $ids AND p.active = true
           RETURN t.id, p.id, p.name ORDER BY p.name""", {"ids": ids}).result_set:
        add(tid, pid, name, "is on the team")
    for tid, pid, name in ro_query(
        """MATCH (p:Person) WHERE p.id IN $ids AND p.active = true RETURN p.id AS tid, p.id AS pid, p.name AS pname""",
        {"ids": ids}).result_set:
        add(tid, pid, name, "is the subject")
    return out


VERDICT_SYSTEM = """You interpret a human's free-text answer to a question about whether \
a stored fact is still true.

Return JSON with exactly three keys:
{"verdict": "...", "corrected_fact": ..., "new_owner_name": ...}

verdict must be one of:
- "confirm" — the human says the stored fact is still correct
- "correct" — the human says it is wrong and gives the new truth
- "unknown" — the human doesn't know, is unsure, or didn't answer

corrected_fact: when verdict is "correct", one complete sentence stating the new
fact, written in the same style as the original. Otherwise null.

new_owner_name: when the human names a different person who now owns//maintains
the thing, that person's name exactly as written. Otherwise null.

Never invent names or facts that the human did not state."""


def _classify_vera_answer(question: str, claim_text: str, human_answer: str) -> dict:
    """Interpret a free-text human answer. Raises LLMError if Groq is down."""
    data = chat_json(ANSWER_MODEL, [
        {"role": "system", "content": VERDICT_SYSTEM},
        {"role": "user", "content": json.dumps({
            "question_asked": question,
            "stored_fact": claim_text,
            "human_answer": human_answer,
        })},
    ])

    verdict = data.get("verdict")
    if verdict not in ("confirm", "correct", "unknown"):
        verdict = "unknown"

    corrected = data.get("corrected_fact")
    corrected = str(corrected).strip() if corrected else None

    owner = data.get("new_owner_name")
    owner = str(owner).strip() if owner else None

    # A "correct" verdict with nothing to correct is unusable.
    if verdict == "correct" and not corrected and not owner:
        verdict = "unknown"

    return {"verdict": verdict, "corrected_fact": corrected, "new_owner_name": owner}


def _literal_verdict(answer: str) -> dict:
    """Fallback when Groq is unavailable — the old literal string matching."""
    if answer.strip().lower() in ("confirm", "still_true", "yes"):
        return {"verdict": "confirm", "corrected_fact": None, "new_owner_name": None}
    return {"verdict": "unknown", "corrected_fact": None, "new_owner_name": None}


@app.post("/api/vera/respond")
async def vera_respond(resp: VeraResponse, request: Request):
    """
    Submit a human answer to a Vera probe.

    This is the ONLY path that can legitimately change Layer 2:
    a human's answer carried by Vera, not Vera's own guess.

    Claims are never edited or deleted — a correction creates a NEW Claim
    that SUPERSEDES the old one and is EXTRACTED_FROM the human's Response,
    so the provenance chain stays intact.
    """
    now = now_epoch()
    changes: list[str] = []

    # Probe + the claim it is about
    vt_result = ro_query(
        """MATCH (vt:VerifyTask {id: $id})
           OPTIONAL MATCH (c:Claim {id: vt.claim_id})
           OPTIONAL MATCH (c)-[:ABOUT]->(target)
           OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
           RETURN vt.claim_id, vt.status, vt.question,
                  c.text, c.fact_type, c.half_life_days,
                  target.id,
                  CASE WHEN target.name IS NOT NULL THEN target.name ELSE target.id END,
                  count(newer) > 0 AS replaced""",
        {"id": resp.probe_id}
    )

    if not vt_result.result_set:
        raise HTTPException(404, "Probe not found")

    row = vt_result.result_set[0]
    claim_id, status, probe_question = row[0], row[1], row[2]
    claim_text, fact_type, half_life = row[3], row[4], row[5]
    target_id, target_name = row[6], row[7]
    already_replaced = bool(row[8])

    if status != "open":
        raise HTTPException(400, "Probe already answered")

    # ── Provenance: always store the raw human text, verbatim ────────────
    response_id = f"resp-{uuid.uuid4().hex[:8]}"
    query(
        """CREATE (r:Response {
            id: $id, answer: $answer, free_text: $free_text,
            raw_text: $raw, answered_at: $now
        })""",
        params={
            "id": response_id, "answer": resp.answer,
            "free_text": resp.free_text, "raw": resp.answer, "now": now,
        }
    )
    query(
        """MATCH (r:Response {id: $rid}), (vt:VerifyTask {id: $vtid})
           CREATE (r)-[:ANSWERED]->(vt)""",
        params={"rid": response_id, "vtid": resp.probe_id}
    )

    # ── Interpret what the human actually said ───────────────────────────
    try:
        parsed = await asyncio.to_thread(
            _classify_vera_answer, probe_question or "", claim_text or "", resp.answer
        )
    except LLMError as e:
        print(f"⚠ Vera verdict classification failed, falling back to literal match: {e}")
        parsed = _literal_verdict(resp.answer)

    verdict = parsed["verdict"]
    corrected_fact = parsed["corrected_fact"]
    new_owner_name = parsed["new_owner_name"]

    # Close the probe regardless of verdict.
    query(
        "MATCH (vt:VerifyTask {id: $id}) SET vt.status = 'resolved', vt.resolved_at = $now",
        {"id": resp.probe_id, "now": now}
    )

    # Everything this answer may have changed. Used below to re-check the
    # findings attached to them, so a problem that is now fixed stops being
    # reported instead of lingering forever.
    touched: list[str] = [claim_id, target_id]

    # ── already replaced: nothing to confirm, and never revive it ────────
    # Confirming a superseded claim would reset its timestamp and make a
    # fact the human already corrected look current again. Record the
    # answer, leave the claim alone.
    if already_replaced:
        verdict = "already_replaced"
        changes.append(
            f"Already replaced by a newer fact, so nothing changed: {(claim_text or claim_id)[:80]}"
        )

    # ── confirm: the stored fact is still true, just stale ───────────────
    elif verdict == "confirm":
        query(
            """MATCH (c:Claim {id: $cid})
               SET c.asserted_at = $now, c.base_conf = 0.98""",
            {"cid": claim_id, "now": now}
        )
        changes.append(f"Confirmed still true: {(claim_text or claim_id)[:80]}")

    # ── correct: supersede with a new claim, never mutate the old one ────
    elif verdict == "correct":
        if corrected_fact:
            new_claim_id = f"claim-{uuid.uuid4().hex[:8]}"
            query(
                """CREATE (c:Claim {
                    id: $id, text: $text, fact_type: $fact_type,
                    half_life_days: $half_life, base_conf: 0.9,
                    asserted_at: $now, valid_from: $now
                })""",
                params={
                    "id": new_claim_id, "text": corrected_fact,
                    "fact_type": fact_type or "general",
                    "half_life": half_life or 270, "now": now,
                }
            )
            query(
                """MATCH (new:Claim {id: $new}), (old:Claim {id: $old})
                   MERGE (new)-[:SUPERSEDES]->(old)""",
                params={"new": new_claim_id, "old": claim_id}
            )
            query(
                """MATCH (new:Claim {id: $new}), (r:Response {id: $rid})
                   MERGE (new)-[:EXTRACTED_FROM]->(r)""",
                params={"new": new_claim_id, "rid": response_id}
            )
            if target_id:
                query(
                    """MATCH (new:Claim {id: $new}), (t {id: $tid})
                       MERGE (new)-[:ABOUT]->(t)""",
                    params={"new": new_claim_id, "tid": target_id}
                )

            # Make the new claim searchable immediately.
            try:
                vec = await asyncio.to_thread(embed_text, corrected_fact)
                query(
                    "MATCH (c:Claim {id: $id}) SET c.embedding = vecf32($vec)",
                    params={"id": new_claim_id, "vec": vec}
                )
            except Exception as e:
                print(f"⚠ could not embed corrected claim {new_claim_id}: {e}")

            # Other probes still asking about the old claim are now moot.
            query(
                """MATCH (vt:VerifyTask {status: 'open', claim_id: $cid})
                   SET vt.status = 'resolved', vt.resolved_at = $now,
                       vt.resolved_by = 'superseded'""",
                {"cid": claim_id, "now": now}
            )

            touched.append(new_claim_id)
            changes.append(f"New fact recorded: {corrected_fact[:100]}")
            changes.append(f"Superseded stale claim: {(claim_text or claim_id)[:80]}")

        # Ownership handover, if the human named a different person.
        if new_owner_name and target_id:
            person = ro_query(
                """MATCH (p:Person)
                   WHERE toLower(p.name) CONTAINS toLower($name)
                   RETURN p.id, p.name LIMIT 1""",
                {"name": new_owner_name}
            )
            if person.result_set:
                new_owner_id, new_owner_label = person.result_set[0]

                prev = ro_query(
                    """MATCH (p:Person)-[o:OWNS]->(t {id: $tid})
                       WHERE o.until IS NULL
                       RETURN p.name""",
                    {"tid": target_id}
                )
                previous_names = [r[0] for r in prev.result_set]

                # Close out any currently-active owner.
                query(
                    """MATCH (p:Person)-[o:OWNS]->(t {id: $tid})
                       WHERE o.until IS NULL
                       SET o.until = $now""",
                    {"tid": target_id, "now": now}
                )
                query(
                    """MATCH (p:Person {id: $pid}), (t {id: $tid})
                       MERGE (p)-[o:OWNS]->(t)
                       SET o.since = $now, o.until = NULL, o.primary = true""",
                    {"pid": new_owner_id, "tid": target_id, "now": now}
                )

                touched.append(new_owner_id)
                prev_label = ", ".join(previous_names) if previous_names else "no active owner"
                changes.append(
                    f"{target_name} owner: {prev_label} → {new_owner_label}"
                )
            else:
                changes.append(
                    f"Could not find a person named '{new_owner_name}' — ownership unchanged"
                )


    # ── unknown: probe closes, finding stays open ────────────────────────
    else:
        changes.append("Recorded — finding stays open for someone else to answer")

    # Now that the graph reflects the human's answer, close any finding
    # whose problem has gone. Layer 3 only — this changes Finding state,
    # never a claim.
    raised = ro_query(
        """MATCH (f:Finding)-[:RAISED_BY]->(vt:VerifyTask {id: $vtid})
           OPTIONAL MATCH (f)-[:FLAGS]->(t)
           RETURN collect(DISTINCT t.id)""",
        {"vtid": resp.probe_id},
    ).result_set
    if raised:
        touched.extend(x for x in (raised[0][0] or []) if x)

    resolved = await asyncio.to_thread(recheck_findings, touched, response_id)
    for item in resolved:
        changes.append(f"Resolved: {item['detail'][:100]}")

    # Provenance for /api/vera/history: what Vera concluded and wrote.
    # This annotates the Response (Layer 1); it does not touch any claim.
    query(
        """MATCH (r:Response {id: $rid})
           SET r.verdict = $verdict, r.changes = $changes,
               r.answered_by = $by""",
        {"rid": response_id, "verdict": verdict, "changes": changes,
         "by": resp.answered_by or request.headers.get("x-spine-person")},
    )

    return {
        "status": "recorded",
        "verdict": verdict,
        "response_id": response_id,
        "changes": changes,
        "resolved_findings": resolved,
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

    # Claims about this entity. Superseded claims are history only: they
    # go in `history`, labelled replaced, never in the current `claims`.
    claims = ro_query(
        """MATCH (c:Claim)-[:ABOUT]->(e {id: $id})
           OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
           RETURN c.id, c.text, c.fact_type, c.base_conf,
                  c.half_life_days, c.asserted_at, newer.text
           ORDER BY c.asserted_at DESC""",
        {"id": entity_id}
    )

    claim_list = []
    history = []
    for cr in claims.result_set:
        conf = compute_confidence(cr[3], cr[4], cr[5], now_epoch=now)
        item = {
            "id": cr[0], "text": cr[1], "fact_type": cr[2],
            "confidence": conf, "confidence_label": format_confidence(conf),
            "asserted_at": cr[5],
        }
        if cr[6] is not None:
            item["replaced"] = True
            item["replaced_by"] = cr[6]
            history.append(item)
        else:
            claim_list.append(item)

    claim_list.sort(key=lambda c: c["confidence"], reverse=True)

    # Get findings
    findings = check_findings(entity_id)

    # Get ownership
    ownership = who_knows(entity_id)

    return {
        "id": row[0], "type": row[1], "label": row[2],
        "claims": claim_list,
        "history": history,
        "findings": findings["findings"],
        "people": ownership["people"],
        "has_active_owner": ownership["has_active_owner"],
    }


# ══════════════════════════════════════════════════════════════════════════
# Job 3.2 — endpoints the UI needs
# ══════════════════════════════════════════════════════════════════════════

def _initials(name: str | None) -> str:
    parts = [p for p in (name or "").replace("-", " ").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _claim_state(claim_id: str) -> tuple[bool, bool, str | None]:
    """(exists, superseded, text) for a claim id."""
    r = ro_query(
        """MATCH (c:Claim {id: $id})
           OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
           RETURN c.text, count(newer) > 0""",
        {"id": claim_id},
    )
    if not r.result_set:
        return False, False, None
    return True, bool(r.result_set[0][1]), r.result_set[0][0]


def _open_task_for_claim(claim_id: str) -> str | None:
    r = ro_query(
        """MATCH (vt:VerifyTask {claim_id: $cid})
           WHERE vt.status = 'open'
           RETURN vt.id LIMIT 1""",
        {"cid": claim_id},
    )
    return r.result_set[0][0] if r.result_set else None


def _raise_probe(finding_id: str, claim_id: str, claim_text: str, now: int,
                 origin: str) -> tuple[str, bool]:
    """
    Link a Vera probe for `claim_id` to `finding_id`. Reuses an already-open
    probe on the same claim rather than asking the same human question
    twice. Layer 3 only. Returns (task_id, newly_created).
    """
    task_id = _open_task_for_claim(claim_id)
    created = False
    if task_id is None:
        task_id = f"vtask-{uuid.uuid4().hex[:8]}"
        query(
            """CREATE (vt:VerifyTask {
                id: $id, status: 'open', question: $q,
                created_at: $now, claim_id: $cid, origin: $origin
            })""",
            {"id": task_id, "q": f'Is this still true? "{claim_text[:100]}"',
             "now": now, "cid": claim_id, "origin": origin},
        )
        created = True
    query(
        """MATCH (f:Finding {id: $fid}), (vt:VerifyTask {id: $vtid})
           MERGE (f)-[:RAISED_BY]->(vt)""",
        {"fid": finding_id, "vtid": task_id},
    )
    return task_id, created


def _flag_claim_and_subject(finding_id: str, claim_id: str):
    """FLAGS the claim and the entity it is ABOUT, like the decay reflex."""
    query(
        """MATCH (f:Finding {id: $fid}), (c:Claim {id: $cid})
           MERGE (f)-[:FLAGS]->(c)""",
        {"fid": finding_id, "cid": claim_id},
    )
    query(
        """MATCH (f:Finding {id: $fid}), (c:Claim {id: $cid})-[:ABOUT]->(e)
           MERGE (f)-[:FLAGS]->(e)""",
        {"fid": finding_id, "cid": claim_id},
    )


@app.get("/api/people")
async def list_people():
    """Every Person: role, team, initials, what they own now, whether they've left."""
    r = ro_query(
        """MATCH (p:Person)
           OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
           WITH p, collect(DISTINCT t.name) AS teams
           OPTIONAL MATCH (p)-[o:OWNS]->(s:System)
           WHERE o.until IS NULL
           WITH p, teams, collect(DISTINCT {id: s.id, name: s.name}) AS owns
           RETURN p.id, p.name, p.role, p.active, p.left_at, teams, owns
           ORDER BY p.name"""
    )
    people = []
    for pid, name, role, active, left_at, teams, owns in r.result_set:
        teams = [t for t in (teams or []) if t]
        owns = [o for o in (owns or []) if o and o.get("id")]
        people.append({
            "id": pid,
            "name": name,
            "role": role,
            "team": teams[0] if teams else None,
            "teams": teams,
            "initials": _initials(name),
            # People who left have active=false and `until` set on their
            # OWNS edges, so they own nothing here.
            "owns": [{"id": o["id"], "name": o["name"]} for o in owns],
            "has_left": active is False,
            "left_at": left_at,
        })
    return {"people": people, "count": len(people)}


@app.get("/api/entities")
async def list_entities():
    """Lightweight list for @mentions and autocomplete."""
    r = ro_query(
        """MATCH (n)
           WHERE n:System OR n:Person OR n:Team OR n:Project OR n:Decision
           RETURN n.id, labels(n)[0],
                  CASE WHEN n.name IS NOT NULL THEN n.name ELSE n.title END"""
    )
    entities = [
        {"id": eid, "type": typ, "name": name}
        for eid, typ, name in r.result_set if name
    ]
    entities.sort(key=lambda e: (e["type"], e["name"].lower()))
    return {"entities": entities, "count": len(entities)}


@app.get("/api/claims")
async def list_claims():
    """
    Every LIVE claim (superseded ones are history and are excluded) with
    the decay inputs and the confidence computed right now.
    """
    r = ro_query(
        """MATCH (c:Claim)
           WHERE NOT (:Claim)-[:SUPERSEDES]->(c)
           OPTIONAL MATCH (c)-[:ABOUT]->(e)
           OPTIONAL MATCH (c)-[:EXTRACTED_FROM]->(src)
           RETURN c.id, c.text, c.fact_type, c.base_conf, c.asserted_at,
                  c.half_life_days, e.id, labels(e)[0],
                  CASE WHEN e.name IS NOT NULL THEN e.name ELSE e.title END,
                  labels(src)[0], src.title
           ORDER BY c.asserted_at DESC"""
    )
    now = now_epoch()
    claims = []
    for (cid, text, fact_type, base_conf, asserted_at, half_life,
         eid, etype, ename, src_type, src_title) in r.result_set:
        # compute_confidence counts one source per claim, and so does this
        # number: it is the exact input behind `confidence`, shown so the
        # arithmetic can be checked.
        source_count = 1
        conf = compute_confidence(base_conf, half_life, asserted_at,
                                  source_count=source_count, now_epoch=now)
        claims.append({
            "id": cid,
            "source_count": source_count,
            "text": text,
            "fact_type": fact_type,
            "base_conf": base_conf,
            "asserted_at": asserted_at,
            "half_life_days": half_life,
            "age_days": round((now - asserted_at) / 86400, 1) if asserted_at else None,
            "confidence": conf,
            "stale": conf < 0.6,
            "about": {"id": eid, "type": etype, "name": ename} if eid else None,
            # A Document title, or "a person's answer" for Vera-written claims.
            "source": src_title or ("a person's answer" if src_type == "Response" else None),
        })
    return {"claims": claims, "count": len(claims)}


@app.post("/api/feedback")
async def submit_feedback(fb: FeedbackRequest, request: Request):
    """
    Thumbs-down on an answer. Records a `user_doubt` Finding on the doubted
    claims and asks Vera to check them. Layer 3 only: a doubt never changes
    a claim; only a human answer through /api/vera/respond can.

    Idempotent per set of claims: doubting the same evidence again bumps
    the count on the existing Finding instead of creating another.
    """
    if not fb.claim_ids:
        raise HTTPException(
            400, "Say which facts you doubt: claim_ids must list at least one "
                 "claim from the answer's evidence."
        )

    now = now_epoch()
    person = fb.person or request.headers.get("x-spine-person")
    targets, skipped = [], []
    for cid in dict.fromkeys(fb.claim_ids):
        exists, superseded, text = _claim_state(cid)
        if not exists:
            skipped.append({"claim_id": cid, "reason": "no such claim"})
        elif superseded:
            skipped.append({"claim_id": cid, "reason": "already replaced by a newer fact"})
        else:
            targets.append((cid, text))

    if not targets:
        raise HTTPException(
            404, "None of those claims are current facts, so there is nothing to doubt."
        )

    key = "|".join(sorted(cid for cid, _ in targets))
    reason = (fb.reason or "").strip()
    detail = f'Someone doubted the answer to "{fb.question[:120]}"' + (
        f": {reason[:200]}" if reason else ".")

    merged = query(
        """MERGE (f:Finding {kind: 'user_doubt', pair_key: $key})
           ON CREATE SET
               f.id = $new_id, f.basis = 'human', f.state = 'suspected',
               f.severity = 'medium', f.detail = $detail, f.found_at = $now,
               f.doubt_count = 1, f.raised_by = $person, f.just_created = true
           ON MATCH SET
               f.found_at = $now, f.detail = $detail, f.state = 'suspected',
               f.doubt_count = coalesce(f.doubt_count, 1) + 1,
               f.just_created = false
           RETURN f.id, f.just_created, f.doubt_count""",
        {"key": key, "new_id": f"finding-{uuid.uuid4().hex[:8]}",
         "detail": detail, "now": now, "person": person},
    )
    finding_id, created, count = merged.result_set[0]

    probes = []
    for cid, text in targets:
        _flag_claim_and_subject(finding_id, cid)
        task_id, new_task = _raise_probe(finding_id, cid, text, now, origin="user_doubt")
        probes.append({"claim_id": cid, "task_id": task_id, "new_question": new_task})

    return {
        "status": "recorded",
        "finding_id": finding_id,
        "new_finding": bool(created),
        "doubt_count": count,
        "probes": probes,
        "skipped": skipped,
    }


@app.get("/api/vera/history")
async def vera_history(limit: int = Query(50, ge=1, le=500)):
    """Answered probes, newest first, with the human's raw words."""
    r = ro_query(
        """MATCH (r:Response)-[:ANSWERED]->(vt:VerifyTask)
           OPTIONAL MATCH (c:Claim {id: vt.claim_id})
           OPTIONAL MATCH (c)-[:ABOUT]->(t)
           OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
           RETURN vt.id, vt.question, c.text,
                  CASE WHEN t.name IS NOT NULL THEN t.name ELSE t.id END,
                  CASE WHEN r.raw_text IS NOT NULL THEN r.raw_text ELSE r.answer END,
                  r.verdict, r.changes, r.answered_by, r.answered_at, newer.text
           ORDER BY r.answered_at DESC
           LIMIT $limit""",
        {"limit": limit},
    )
    items = []
    for (task_id, question, claim_text, subject, raw, verdict, changes,
         by, at, replaced_by) in r.result_set:
        items.append({
            "task_id": task_id,
            "question": question,
            "subject": subject,
            "original_fact": claim_text,
            "human_answer": raw,
            "verdict": verdict,
            "changes": list(changes) if changes else [],
            "answered_by": by,
            "answered_at": at,
            "replaced_by": replaced_by,
        })
    return {"history": items, "count": len(items)}


@app.post("/api/vera/ask")
async def vera_ask(req: VeraAskRequest, request: Request, _: User = Depends(require_admin)):
    """
    Admin asks Vera to verify specific claims now. Creates a
    `verification_requested` Finding plus a probe per claim. Layer 3 only.

    Admin-only (enforced by require_admin).
    """
    if not req.claim_ids:
        raise HTTPException(400, "claim_ids must list at least one claim to verify.")

    now = now_epoch()
    by = req.requested_by or request.headers.get("x-spine-person")
    results = []
    for cid in dict.fromkeys(req.claim_ids):
        exists, superseded, text = _claim_state(cid)
        if not exists:
            results.append({"claim_id": cid, "status": "skipped", "reason": "no such claim"})
            continue
        if superseded:
            results.append({"claim_id": cid, "status": "skipped",
                            "reason": "already replaced by a newer fact"})
            continue

        note = (req.note or "").strip()
        detail = "An admin asked Vera to re-check this fact" + (
            f": {note[:200]}" if note else ".")
        merged = query(
            """MERGE (f:Finding {kind: 'verification_requested', pair_key: $cid})
               ON CREATE SET
                   f.id = $new_id, f.basis = 'human', f.state = 'suspected',
                   f.severity = 'low', f.detail = $detail, f.found_at = $now,
                   f.raised_by = $by
               ON MATCH SET
                   f.state = 'suspected', f.detail = $detail, f.found_at = $now
               RETURN f.id""",
            {"cid": cid, "new_id": f"finding-{uuid.uuid4().hex[:8]}",
             "detail": detail, "now": now, "by": by},
        )
        finding_id = merged.result_set[0][0]
        _flag_claim_and_subject(finding_id, cid)
        task_id, new_task = _raise_probe(finding_id, cid, text, now, origin="admin_request")
        results.append({
            "claim_id": cid,
            "status": "asked" if new_task else "already_open",
            "task_id": task_id,
            "finding_id": finding_id,
        })

    return {"status": "recorded", "results": results}
