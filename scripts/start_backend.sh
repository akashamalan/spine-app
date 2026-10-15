#!/bin/bash
# Start the SPINE backend
cd "$(dirname "$0")/.."
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}."
echo "── SPINE Backend ──"
echo "Starting FastAPI on :8000..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
