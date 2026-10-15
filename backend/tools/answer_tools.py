"""
Answer agent tools — each wraps a Cypher query pattern.

These are the tools the LLM calls to traverse the graph and build an answer.
Every tool returns structured data + the Cypher it ran (for the Stage UI).
"""
import time
from backend.utils.graph import ro_query, now_epoch
from backend.utils.embeddings import embed_text
from backend.utils.confidence import compute_confidence, is_stale, CONFIDENCE_FLOOR


def find_entry_points(question: str, limit: int = 5) -> dict:
    """Vector search for claims related to the question."""
    vec = embed_text(question)
    cypher = """CALL db.idx.vector.queryNodes(
        'Claim', 'embedding', $k, vecf32($vec)
    ) YIELD node, score
    RETURN node.id, node.text, node.fact_type, node.base_conf,
           node.half_life_days, node.asserted_at, score
    ORDER BY score DESC"""

    result = ro_query(cypher, {"k": limit, "vec": vec})
    now = now_epoch()

    entries = []
    for row in result.result_set:
        conf = compute_confidence(
            base_conf=row[3], half_life_days=row[4],
            asserted_at=row[5], now_epoch=now
        )
        entries.append({
            "claim_id": row[0],
            "text": row[1],
            "fact_type": row[2],
            "confidence": conf,
            "stale": is_stale(conf),
            "similarity": round(row[6], 4),
        })

    return {
        "tool": "find_entry_points",
        "cypher": cypher.strip(),
        "results": entries,
    }


def neighbours(node_id: str, depth: int = 1) -> dict:
    """Get immediate neighbours of a node, with edge types."""
    cypher = """MATCH (n {id: $id})-[r]-(m)
    RETURN n.id, type(r), m.id,
           CASE WHEN m.name IS NOT NULL THEN m.name
                WHEN m.text IS NOT NULL THEN m.text
                WHEN m.title IS NOT NULL THEN m.title
                ELSE m.id END AS label,
           labels(m)[0] AS m_label,
           startNode(r) = n AS outgoing
    LIMIT 30"""

    result = ro_query(cypher, {"id": node_id})

    edges = []
    for row in result.result_set:
        edges.append({
            "from": row[0],
            "rel": row[1],
            "to_id": row[2],
            "to_label": row[3],
            "to_type": row[4],
            "outgoing": row[5],
        })

    return {
        "tool": "neighbours",
        "cypher": cypher.strip(),
        "node_id": node_id,
        "edges": edges,
    }


def path_between(start_id: str, end_id: str, max_hops: int = 6) -> dict:
    """Find shortest path between two nodes using algo.SPpaths."""
    cypher = f"""MATCH (a {{id: $start}}), (b {{id: $end}})
    CALL algo.SPpaths({{sourceNode: a, targetNode: b, maxLen: {max_hops}, pathCount: 1}})
    YIELD path, pathWeight
    RETURN [n IN nodes(path) | n.id] AS node_ids,
           [n IN nodes(path) |
              CASE WHEN n.name IS NOT NULL THEN n.name
                   WHEN n.text IS NOT NULL THEN n.text
                   WHEN n.title IS NOT NULL THEN n.title
                   ELSE n.id END] AS labels,
           [r IN relationships(path) | type(r)] AS rels,
           pathWeight"""

    result = ro_query(cypher, {"start": start_id, "end": end_id})

    paths = []
    for row in result.result_set:
        paths.append({
            "node_ids": row[0],
            "labels": row[1],
            "rels": row[2],
            "weight": row[3],
        })

    return {
        "tool": "path_between",
        "cypher": cypher.strip(),
        "start": start_id,
        "end": end_id,
        "paths": paths,
        "connected": len(paths) > 0,
    }


def blast_radius(system_id: str, max_depth: int = 3) -> dict:
    """BFS from a system to find everything that depends on it."""
    cypher = f"""MATCH (s:System {{id: $id}})
    CALL algo.BFS(s, {max_depth}, 'DEPENDS_ON')
    YIELD nodes, edges
    RETURN [n IN nodes | n.id] AS affected_ids,
           [n IN nodes |
              CASE WHEN n.name IS NOT NULL THEN n.name
                   ELSE n.id END] AS affected_names,
           size(nodes) AS count"""

    result = ro_query(cypher, {"id": system_id})

    if result.result_set:
        row = result.result_set[0]
        return {
            "tool": "blast_radius",
            "cypher": cypher.strip(),
            "system": system_id,
            "affected_ids": row[0],
            "affected_names": row[1],
            "count": row[2],
        }

    return {
        "tool": "blast_radius",
        "cypher": cypher.strip(),
        "system": system_id,
        "affected_ids": [],
        "affected_names": [],
        "count": 0,
    }


def who_knows(entity_id: str) -> dict:
    """Find who knows about an entity — owners + claim authors."""
    cypher = """MATCH (e {id: $entity})
    OPTIONAL MATCH (e)<-[o:OWNS]-(owner:Person)
      WHERE o.until IS NULL AND owner.active = true
    OPTIONAL MATCH (e)<-[:ABOUT]-(c:Claim)-[:EXTRACTED_FROM]->(d)<-[a:AUTHORED]-(au:Person)
      WHERE au.active = true AND ID(a) >= 0
    WITH e, owner, au, count(c) AS wrote
    WITH coalesce(owner, au) AS person, wrote,
         CASE WHEN owner IS NOT NULL THEN 'owner' ELSE 'author' END AS role
    WHERE person IS NOT NULL
    RETURN DISTINCT person.id, person.name, person.role AS job_title,
           role, wrote
    ORDER BY role, wrote DESC"""

    result = ro_query(cypher, {"entity": entity_id})

    people = []
    for row in result.result_set:
        people.append({
            "person_id": row[0],
            "name": row[1],
            "job_title": row[2],
            "relationship": row[3],
            "claims_authored": row[4],
        })

    return {
        "tool": "who_knows",
        "cypher": cypher.strip(),
        "entity": entity_id,
        "people": people,
        "has_active_owner": any(p["relationship"] == "owner" for p in people),
    }


def decision_chain(entity_id: str, max_depth: int = 6) -> dict:
    """Trace the decision chain behind an entity via DRIVEN_BY + SUPERSEDES."""
    cypher = f"""MATCH (e {{id: $id}})
    OPTIONAL MATCH (e)-[:DRIVEN_BY]->(d:Decision)
    OPTIONAL MATCH chain = (d)<-[:SUPERSEDES*0..{max_depth}]-(earlier:Decision)
    RETURN d.id, d.title, d.made_at, d.rationale,
           [n IN nodes(chain) | n.title] AS chain_titles"""

    result = ro_query(cypher, {"id": entity_id})

    decisions = []
    for row in result.result_set:
        if row[0]:
            decisions.append({
                "decision_id": row[0],
                "title": row[1],
                "made_at": row[2],
                "rationale": row[3],
                "chain": row[4],
            })

    return {
        "tool": "decision_chain",
        "cypher": cypher.strip(),
        "entity": entity_id,
        "decisions": decisions,
    }


def check_findings(entity_id: str) -> dict:
    """Check for any active findings (risks, verify tasks) on an entity."""
    cypher = """MATCH (f:Finding)-[:FLAGS]->(e {id: $id})
    WHERE f.state <> 'resolved'
    RETURN f.id, f.kind, f.basis, f.state, f.severity, f.detail, f.found_at
    ORDER BY f.found_at DESC"""

    result = ro_query(cypher, {"id": entity_id})

    findings = []
    for row in result.result_set:
        findings.append({
            "finding_id": row[0],
            "kind": row[1],
            "basis": row[2],
            "state": row[3],
            "severity": row[4],
            "detail": row[5],
            "found_at": row[6],
        })

    return {
        "tool": "check_findings",
        "cypher": cypher.strip(),
        "entity": entity_id,
        "findings": findings,
        "has_open_findings": len(findings) > 0,
    }


def broken_path(question: str, entity_id: str) -> dict:
    """
    The demo beat: ask about ownership and show the SHAPE OF THE HOLE.

    Instead of returning empty, this returns the path that stops dead —
    the owner edge with until != null, the inactive person at the end.
    """
    cypher = """MATCH (e {id: $id})
    OPTIONAL MATCH (e)<-[o:OWNS]-(owner:Person)
    WITH e, o, owner,
         CASE
           WHEN o IS NULL THEN 'no_owner_edge'
           WHEN o.until IS NOT NULL THEN 'owner_expired'
           WHEN owner.active = false THEN 'owner_inactive'
           ELSE 'owner_active'
         END AS ownership_status
    RETURN e.id,
           CASE WHEN e.name IS NOT NULL THEN e.name ELSE e.id END AS entity_name,
           owner.id AS owner_id,
           owner.name AS owner_name,
           owner.active AS owner_active,
           o.since AS owns_since,
           o.until AS owns_until,
           ownership_status"""

    result = ro_query(cypher, {"id": entity_id})

    rows = []
    for row in result.result_set:
        rows.append({
            "entity_id": row[0],
            "entity_name": row[1],
            "owner_id": row[2],
            "owner_name": row[3],
            "owner_active": row[4],
            "owns_since": row[5],
            "owns_until": row[6],
            "status": row[7],
        })

    # Determine if there's a gap
    has_gap = all(r["status"] != "owner_active" for r in rows)

    return {
        "tool": "broken_path",
        "cypher": cypher.strip(),
        "question": question,
        "entity": entity_id,
        "ownership_records": rows,
        "has_gap": has_gap,
        "gap_explanation": (
            f"No active owner found for {rows[0]['entity_name'] if rows else entity_id}. "
            + (f"Last owner was {rows[0]['owner_name']} (left {rows[0]['owns_until']})" if rows and rows[0]['owner_name'] else "No ownership record exists.")
        ) if has_gap else None,
    }
