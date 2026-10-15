"""
Generate embeddings for all Claim nodes and store them in the graph.

Uses all-MiniLM-L6-v2 locally — zero API cost.
Run after seed_data.py.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.utils.graph import get_graph
from backend.utils.embeddings import embed_batch


def embed_claims():
    g = get_graph()

    # Fetch all claims without embeddings (or all claims to refresh)
    result = g.ro_query("MATCH (c:Claim) RETURN c.id, c.text ORDER BY c.id")

    ids = []
    texts = []
    for row in result.result_set:
        ids.append(row[0])
        texts.append(row[1])

    if not texts:
        print("No claims to embed.")
        return

    print(f"Embedding {len(texts)} claims...")
    vectors = embed_batch(texts)

    for claim_id, vec in zip(ids, vectors):
        g.query(
            "MATCH (c:Claim {id: $id}) SET c.embedding = vecf32($vec)",
            params={"id": claim_id, "vec": vec}
        )

    print(f"✓ Embedded {len(ids)} claims ({len(vectors[0])}d vectors)")


if __name__ == "__main__":
    embed_claims()
