"""
Subgraphs for the graph panel — additive, read-only.

Every hop of /api/ask carries a `subgraph` describing exactly what that hop
touched, in one shape the UI can draw:

    {"nodes": [{id, type, label, sublabel, confidence, stale, left,
                superseded, asserted_at, is_focus, ...}],
     "edges": [{id, source, target, type, confidence, superseded,
                on_path, ...}]}

Claims are never nodes: a claim becomes the edge it asserts (its source
document MENTIONS its subject, labelled with the claim text). Findings are
nodes of type "finding" with a FLAGS edge to what they are about, so the UI
can pin them as badges.

Nothing here writes to the graph. Every builder is wrapped by `safe()` so a
failure here can only cost the picture, never the answer.
"""
import time
import traceback
from datetime import datetime, timezone

from backend.utils.graph import ro_query, now_epoch
from backend.utils.confidence import compute_confidence, is_stale

EMPTY = {"nodes": [], "edges": []}

_TYPES = {
    "Person": "person",
    "System": "service",
    "Document": "document",
    "Team": "team",
    "Decision": "document",
    "Project": "document",
    "Claim": "claim",
    "Finding": "finding",
}


def _iso(epoch) -> str | None:
    if not epoch:
        return None
    return datetime.fromtimestamp(int(epoch), tz=timezone.utc).date().isoformat()


class Subgraph:
    """Collects nodes and edges by id; later facts about an id merge in."""

    def __init__(self, focus_id: str | None = None):
        self.focus_id = focus_id
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, dict] = {}

    def node(self, node_id: str, **fields) -> None:
        if not node_id:
            return
        n = self.nodes.setdefault(node_id, {
            "id": node_id, "type": "service", "label": node_id, "sublabel": None,
            "confidence": None, "stale": False, "left": False, "superseded": False,
            "asserted_at": None, "is_focus": node_id == self.focus_id,
        })
        for k, v in fields.items():
            if v is not None:
                n[k] = v

    def edge(self, source: str, target: str, type_: str, **fields) -> None:
        if not source or not target:
            return
        eid = f"{source}|{type_}|{target}"
        e = self.edges.get(eid)
        if e is None:
            self.edges[eid] = {
                "id": eid, "source": source, "target": target, "type": type_,
                "confidence": None, "superseded": False, "on_path": False, **fields,
            }
            return
        # Same relationship seen twice: keep the stronger reading of it.
        e["on_path"] = e["on_path"] or fields.get("on_path", False)
        if (fields.get("confidence") or 0) > (e.get("confidence") or 0):
            e.update({k: v for k, v in fields.items() if k != "on_path"})

    def describe(self, ids) -> None:
        """Fill label, sublabel, dates and flags for non-claim nodes."""
        ids = [i for i in dict.fromkeys(ids) if i]
        if not ids:
            return
        r = ro_query(
            """MATCH (n) WHERE n.id IN $ids AND NOT n:Claim AND NOT n:Finding
               OPTIONAL MATCH (n)-[:MEMBER_OF]->(t:Team)
               OPTIONAL MATCH (f:Finding)-[:FLAGS]->(n) WHERE f.state <> 'resolved'
               RETURN n.id, labels(n)[0], n.name, n.title, n.role, n.tier,
                      n.active, n.left_at, n.created_at, n.made_at,
                      t.id, t.name, collect(DISTINCT f.kind)""",
            {"ids": ids},
        )
        for (nid, label, name, title, role, tier, active, left_at, created_at,
             made_at, team_id, team_name, flags) in r.result_set:
            kind = _TYPES.get(label, "service")
            if label == "Person":
                sub = role
            elif label == "System":
                sub = f"{tier} service" if tier else "Service"
            elif label == "Team":
                sub = "Team"
            else:
                sub = label if label in ("Decision", "Project") else "Document"
            gone = label == "Person" and (active is False or bool(left_at))
            self.node(
                nid, type=kind, label=name or title or nid, sublabel=sub,
                left=gone, left_at=_iso(left_at) if gone else None,
                asserted_at=_iso(created_at or made_at),
                team_id=team_id, team=team_name,
                flags=[f for f in flags if f] or None,
            )

    def claim_edges(self, claim_ids, on_path: bool) -> None:
        """Each claim becomes document -MENTIONS-> subject; disagreements become ⚡ edges."""
        claim_ids = [c for c in dict.fromkeys(claim_ids) if c]
        if not claim_ids:
            return
        r = ro_query(
            """MATCH (c:Claim) WHERE c.id IN $ids
               OPTIONAL MATCH (c)-[:ABOUT]->(e)
               OPTIONAL MATCH (c)-[:EXTRACTED_FROM]->(d:Document)
               OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
               RETURN c.id, c.text, c.base_conf, c.half_life_days, c.asserted_at,
                      e.id, d.id, count(newer) > 0""",
            {"ids": claim_ids},
        )
        now = now_epoch()
        touched = []
        for cid, text, base, half, asserted, about, doc, superseded in r.result_set:
            conf = compute_confidence(base, half, asserted, now_epoch=now)
            if about:
                touched.append(about)
            if not (about and doc):
                continue
            touched.append(doc)
            self.edge(doc, about, "MENTIONS", label=text, claim_id=cid,
                      confidence=conf, stale=is_stale(conf),
                      superseded=bool(superseded),
                      on_path=on_path and not superseded,
                      asserted_at=_iso(asserted))

        c = ro_query(
            """MATCH (a:Claim)-[k:CONTRADICTS]-(b:Claim) WHERE a.id IN $ids
               MATCH (a)-[:EXTRACTED_FROM]->(da:Document)
               MATCH (b)-[:EXTRACTED_FROM]->(db:Document)
               WHERE da.id < db.id OR NOT b.id IN $ids
               RETURN DISTINCT da.id, db.id, a.text, b.text""",
            {"ids": claim_ids},
        )
        for da, db, ta, tb in c.result_set:
            if da == db:
                continue
            touched += [da, db]
            src, dst = sorted([da, db])
            self.edge(src, dst, "CONTRADICTS", label=f"{ta} / {tb}", on_path=on_path)
        self.describe(touched)

    def ownership_confidence(self, entity_id: str) -> dict[str, tuple[float, bool]]:
        """Person name → (confidence, superseded) of the ownership claim naming them."""
        r = ro_query(
            """MATCH (c:Claim {fact_type: 'ownership'})-[:ABOUT]->(e {id: $id})
               OPTIONAL MATCH (newer:Claim)-[:SUPERSEDES]->(c)
               RETURN c.text, c.base_conf, c.half_life_days, c.asserted_at, count(newer) > 0""",
            {"id": entity_id},
        )
        now = now_epoch()
        return {
            text: (compute_confidence(b, h, a, now_epoch=now), bool(s))
            for text, b, h, a, s in r.result_set
        }

    def owner_edge(self, person_id, person_name, entity_id, *, active: bool,
                   claims: dict, on_path: bool) -> None:
        conf, superseded = None, not active
        for text, (c, s) in claims.items():
            if person_name and person_name in text:
                conf, superseded = c, s or not active
                break
        self.edge(person_id, entity_id, "OWNS", confidence=conf,
                  stale=conf is not None and is_stale(conf),
                  superseded=superseded, on_path=on_path and active,
                  label="used to own" if not active else "owns")
        if conf is not None and active:
            self.node(person_id, confidence=conf, stale=is_stale(conf))

    def finish(self) -> dict:
        # People without a confidence of their own borrow their strongest link.
        for n in self.nodes.values():
            if n["type"] == "person" and n["confidence"] is None:
                linked = [e["confidence"] for e in self.edges.values()
                          if n["id"] in (e["source"], e["target"])
                          and e["confidence"] is not None and not e["superseded"]]
                if linked:
                    n["confidence"] = max(linked)
                    n["stale"] = is_stale(n["confidence"])
        nodes = [{k: v for k, v in n.items() if v is not None or k in (
            "sublabel", "confidence", "asserted_at")} for n in self.nodes.values()]
        return {"nodes": nodes, "edges": list(self.edges.values())}


# ── One builder per tool ─────────────────────────────────────────────────

def for_entity(entity: dict) -> dict:
    g = Subgraph(entity["id"])
    g.node(entity["id"], label=entity.get("name"), is_focus=True)
    g.describe([entity["id"]])
    return g.finish()


def for_who_knows(entity_id: str, out: dict) -> dict:
    g = Subgraph(entity_id)
    g.node(entity_id, is_focus=True)
    claims = g.ownership_confidence(entity_id)
    people = {p["person_id"]: p for p in out.get("people", [])}
    for pid, p in people.items():
        g.node(pid, type="person", label=p["name"], sublabel=p.get("job_title"))
        if p.get("relationship") == "owner":
            g.owner_edge(pid, p["name"], entity_id, active=True, claims=claims, on_path=True)

    # Authors reach the subject through what they wrote.
    authors = [pid for pid, p in people.items() if p.get("relationship") == "author"]
    if authors:
        r = ro_query(
            """MATCH (au:Person)-[:AUTHORED]->(d:Document)<-[:EXTRACTED_FROM]-(c:Claim)-[:ABOUT]->(e {id: $id})
               WHERE au.id IN $authors AND NOT (:Claim)-[:SUPERSEDES]->(c)
               RETURN au.id, d.id, collect(c.id)""",
            {"id": entity_id, "authors": authors},
        )
        for au, doc, cids in r.result_set:
            g.edge(au, doc, "AUTHORED", on_path=True, label="wrote")
            g.claim_edges(cids, on_path=True)
    g.describe([entity_id, *people])
    return g.finish()


def for_broken_path(entity_id: str, out: dict) -> dict:
    g = Subgraph(entity_id)
    g.node(entity_id, is_focus=True)
    claims = g.ownership_confidence(entity_id)
    ids = [entity_id]
    for rec in out.get("ownership_records", []):
        pid = rec.get("owner_id")
        if not pid:
            continue
        ids.append(pid)
        g.node(pid, type="person", label=rec.get("owner_name"))
        g.owner_edge(pid, rec.get("owner_name"), entity_id,
                     active=rec.get("status") == "owner_active",
                     claims=claims, on_path=True)
    g.describe(ids)
    return g.finish()


def for_findings(entity_id: str, out: dict) -> dict:
    g = Subgraph(entity_id)
    g.node(entity_id, is_focus=True)
    for f in out.get("findings", []):
        g.node(f["finding_id"], type="finding", label=f.get("kind"),
               sublabel=f.get("severity"), stale=False)
        g.edge(f["finding_id"], entity_id, "FLAGS", on_path=False)
    g.describe([entity_id])
    return g.finish()


def for_blast_radius(entity_id: str, out: dict) -> dict:
    """What the walk reached over DEPENDS_ON, each node tagged with its ring."""
    g = Subgraph(entity_id)
    g.node(entity_id, is_focus=True, depth=0)
    ids = [entity_id, *out.get("affected_ids", [])]
    r = ro_query(
        """MATCH (a:System)-[:DEPENDS_ON]->(b:System)
           WHERE a.id IN $ids AND b.id IN $ids
           RETURN a.id, b.id""",
        {"ids": ids},
    )
    pairs = list(r.result_set)
    # Ring = hops from the focus along the edges the walk followed.
    depth = {entity_id: 0}
    frontier = [entity_id]
    while frontier:
        nxt = []
        for a, b in pairs:
            if a in frontier and b not in depth:
                depth[b] = depth[a] + 1
                nxt.append(b)
        frontier = nxt
    for a, b in pairs:
        g.edge(a, b, "DEPENDS_ON", on_path=True, label="depends on")
    for nid in ids:
        g.node(nid, type="service", depth=depth.get(nid))
    g.describe(ids)
    return g.finish()


def for_entry_points(out: dict, focus_id: str | None) -> dict:
    g = Subgraph(focus_id)
    if focus_id:
        g.node(focus_id, is_focus=True)
    g.claim_edges([c["claim_id"] for c in out.get("results", [])], on_path=True)
    g.claim_edges([c["claim_id"] for c in out.get("replaced", [])], on_path=False)
    if focus_id:
        g.describe([focus_id])
    return g.finish()


def for_neighbours(entity_id: str, out: dict) -> dict:
    """Context around the subject. Claims become mentions; nothing here is the path."""
    g = Subgraph(entity_id)
    g.node(entity_id, is_focus=True)
    ids, claims = [entity_id], []
    labels = {"OWNS": "owns", "DEPENDS_ON": "depends on", "MEMBER_OF": "member of",
              "KNOWS_ABOUT": "knows about", "AUTHORED": "wrote", "DRIVEN_BY": "decided by"}
    for e in out.get("edges", []):
        other, rel = e["to_id"], e["rel"]
        if e.get("to_type") == "Claim":
            claims.append(other)
            continue
        if e.get("to_type") in ("Finding", "AgentRun", "VerifyTask", "Response"):
            continue
        ids.append(other)
        src, dst = (entity_id, other) if e.get("outgoing") else (other, entity_id)
        g.edge(src, dst, rel, on_path=False, label=labels.get(rel, rel.lower().replace("_", " ")))
    g.claim_edges(claims, on_path=False)
    g.describe(ids)
    return g.finish()


def for_evidence(evidence: list[dict], replaced: list[dict], focus_id: str | None) -> dict:
    """The facts the answer rests on: the bright path at the end."""
    g = Subgraph(focus_id)
    if focus_id:
        g.node(focus_id, is_focus=True)
        g.describe([focus_id])
    g.claim_edges([e["claim_id"] for e in evidence if e.get("claim_id")], on_path=True)
    g.claim_edges([e["claim_id"] for e in replaced if e.get("claim_id")], on_path=False)
    return g.finish()


def safe(builder, *args) -> dict:
    """Run a builder; on any failure the hop still streams, just without a picture."""
    started = time.time()
    try:
        return builder(*args)
    except Exception as e:  # noqa: BLE001 — the picture must never cost the answer
        print(f"⚠ subgraph {builder.__name__} failed after "
              f"{time.time() - started:.2f}s: {e}")
        traceback.print_exc()
        return {"nodes": [], "edges": []}


# ── The idle company map ─────────────────────────────────────────────────

def overview() -> dict:
    """People, teams, services and documents — no claims, no findings."""
    g = Subgraph()
    r = ro_query(
        """MATCH (n) WHERE n:Person OR n:Team OR n:System OR n:Document
           RETURN n.id"""
    )
    ids = [row[0] for row in r.result_set]
    for nid in ids:
        g.node(nid)
    g.describe(ids)

    rels = ro_query(
        """MATCH (a)-[r]->(b)
           WHERE (a:Person OR a:Team OR a:System OR a:Document)
             AND (b:Person OR b:Team OR b:System OR b:Document)
           RETURN a.id, type(r), b.id, r.until"""
    )
    labels = {"OWNS": "owns", "DEPENDS_ON": "depends on", "MEMBER_OF": "member of",
              "KNOWS_ABOUT": "knows about", "AUTHORED": "wrote"}
    for a, rel, b, until in rels.result_set:
        g.edge(a, b, rel, superseded=rel == "OWNS" and until is not None,
               on_path=False, label=labels.get(rel, rel.lower().replace("_", " ")))
    return g.finish()
