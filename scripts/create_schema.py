"""
SPINE schema creation — three-layer graph model.

Layer 1 (Source): immutable provenance nodes
Layer 2 (Semantic): entities and claims — the company brain
Layer 3 (Meta): questions, findings, agent runs — the reflex layer

Run once against a fresh FalkorDB graph.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.utils.graph import get_graph

EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))


def create_schema():
    g = get_graph()

    # ── Indexes ──────────────────────────────────────────────────────────
    indexes = [
        # Vector indexes for semantic search
        f"""CREATE VECTOR INDEX FOR (c:Claim) ON (c.embedding)
            OPTIONS {{dimension:{EMBEDDING_DIM}, similarityFunction:'cosine', M:32, efConstruction:200}}""",
        f"""CREATE VECTOR INDEX FOR (q:Question) ON (q.embedding)
            OPTIONS {{dimension:{EMBEDDING_DIM}, similarityFunction:'cosine', M:16, efConstruction:100}}""",

        # Full-text indexes
        "CREATE FULLTEXT INDEX FOR (c:Claim) ON (c.text)",
        "CREATE FULLTEXT INDEX FOR (d:Document) ON (d.title)",
        "CREATE FULLTEXT INDEX FOR (p:Person) ON (p.name)",

        # Range indexes for timestamp queries
        "CREATE INDEX FOR (c:Claim) ON (c.asserted_at)",
        "CREATE INDEX FOR (c:Claim) ON (c.valid_from)",
        "CREATE INDEX FOR (c:Claim) ON (c.valid_to)",
        "CREATE INDEX FOR (f:Finding) ON (f.found_at)",
        "CREATE INDEX FOR (f:Finding) ON (f.state)",
        "CREATE INDEX FOR (ar:AgentRun) ON (ar.started_at)",
        "CREATE INDEX FOR (p:Probe) ON (p.sent_at)",
        "CREATE INDEX FOR (vt:VerifyTask) ON (vt.created_at)",
        "CREATE INDEX FOR (vt:VerifyTask) ON (vt.status)",

        # Lookup indexes
        "CREATE INDEX FOR (p:Person) ON (p.active)",
        "CREATE INDEX FOR (s:System) ON (s.name)",
        "CREATE INDEX FOR (t:Team) ON (t.name)",
        "CREATE INDEX FOR (pr:Project) ON (pr.name)",
    ]

    for idx_cypher in indexes:
        try:
            g.query(idx_cypher)
            print(f"  ✓ {idx_cypher[:70]}...")
        except Exception as e:
            err = str(e)
            if "already indexed" in err.lower() or "already exists" in err.lower():
                print(f"  • skip (exists): {idx_cypher[:60]}...")
            else:
                print(f"  ✗ {idx_cypher[:60]}... → {err}")

    print("\nSchema created.")


if __name__ == "__main__":
    create_schema()
