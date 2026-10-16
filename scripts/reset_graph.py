"""
Delete the entire SPINE graph so the seed pipeline can start from scratch.

Destructive: drops every node, edge, and index in the graph named by
FALKORDB_GRAPH. Run this before create_schema.py when you want a clean
slate (e.g. after repeated reflex runs have accumulated Findings).

Usage:
    PYTHONPATH=. python scripts/reset_graph.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.utils.graph import get_db

GRAPH_NAME = os.getenv("FALKORDB_GRAPH", "spine")


def reset_graph():
    db = get_db()

    existing = db.list_graphs()
    if GRAPH_NAME not in existing:
        print(f"  Graph '{GRAPH_NAME}' does not exist — nothing to delete.")
        print("\nGraph reset (was already empty).")
        return

    g = db.select_graph(GRAPH_NAME)
    g.delete()
    print(f"  ✓ Deleted graph '{GRAPH_NAME}'")
    print("\nGraph reset. Run create_schema.py next.")


if __name__ == "__main__":
    reset_graph()
