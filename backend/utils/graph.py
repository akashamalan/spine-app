"""FalkorDB connection and query helpers."""
import os
import time
from typing import Any
from falkordb import FalkorDB
from dotenv import load_dotenv

load_dotenv()

_db: FalkorDB | None = None
_graph = None


def get_db() -> FalkorDB:
    global _db
    if _db is None:
        ssl = os.getenv("FALKORDB_SSL", "false").lower() in ("1", "true", "yes")
        _db = FalkorDB(
            host=os.getenv("FALKORDB_HOST", "localhost"),
            port=int(os.getenv("FALKORDB_PORT", 6379)),
            username=os.getenv("FALKORDB_USERNAME", "default"),
            password=os.getenv("FALKORDB_PASSWORD") or None,
            ssl=ssl,
        )
    return _db


def get_graph():
    global _graph
    if _graph is None:
        db = get_db()
        _graph = db.select_graph(os.getenv("FALKORDB_GRAPH", "spine"))
    return _graph


def query(cypher: str, params: dict[str, Any] | None = None):
    """Execute a read-write query. Returns the result set."""
    g = get_graph()
    return g.query(cypher, params=params or {})


def ro_query(cypher: str, params: dict[str, Any] | None = None):
    """Execute a read-only query. Returns the result set."""
    g = get_graph()
    return g.ro_query(cypher, params=params or {})


def now_epoch() -> int:
    """Current UTC epoch in seconds."""
    return int(time.time())
