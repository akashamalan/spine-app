#!/bin/bash
# One-shot setup for SPINE
set -e
cd "$(dirname "$0")/.."

echo "── SPINE Setup ──"
echo ""

# 1. Python deps
echo "1. Installing Python dependencies..."
pip install -r requirements.txt

# 2. Frontend deps
echo ""
echo "2. Installing frontend dependencies..."
cd frontend && npm install && cd ..

# 3. Copy env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "3. Created .env from .env.example"
    echo "   ⚠  Edit .env with your FalkorDB Cloud credentials and Groq API key"
else
    echo ""
    echo "3. .env already exists"
fi

# 4. Schema + seed
echo ""
echo "4. Ready to load schema and seed data."
echo "   Once .env has FalkorDB credentials, run:"
echo "     PYTHONPATH=. python scripts/create_schema.py"
echo "     PYTHONPATH=. python scripts/seed_data.py"
echo "     PYTHONPATH=. python scripts/embed_claims.py"
echo ""
echo "5. To start:"
echo "     Terminal 1: bash scripts/start_backend.sh"
echo "     Terminal 2: cd frontend && npm run dev"
echo ""
echo "✓ Setup complete"
