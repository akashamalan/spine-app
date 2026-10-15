"""
Seed SPINE with synthetic company data and PLANTED FAULTS.

This is NOT real company data — it's a synthetic "Northwind Engineering" org
designed so the reflex agents have real things to find:

PLANTED FAULTS:
1. Bus-factor: "billing-service" owned only by Priya, who left 94 days ago
   (active=false). Nobody else has OWNS or KNOWS_ABOUT for it.
2. Orphan: "legacy-auth" system has no OWNS, no DEPENDS_ON inbound, only
   one stale Claim from 540 days ago.
3. Decay: Several claims about "deploy-process" are 300+ days old with
   half_life_days=270 (process type). Their confidence has decayed below 0.6.
4. Contradiction: Two claims about the rollback step in the deploy process
   disagree — one says "rollback via git revert" and the other says
   "rollback via feature flag."
5. Missing owner gap: billing-service's OWNS edge has until != null (set to
   when Priya left), so the broken-path query shows the shape of the hole.
"""
import sys
import os
import time
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.utils.graph import get_graph, now_epoch

# Time constants
DAY = 86400
NOW = now_epoch()


def ts(days_ago: int) -> int:
    """Epoch timestamp for N days ago."""
    return NOW - (days_ago * DAY)


def seed():
    g = get_graph()

    # ══════════════════════════════════════════════════════════════════════
    # LAYER 1 — Source nodes (immutable provenance)
    # ══════════════════════════════════════════════════════════════════════
    documents = [
        {"id": "doc-arch-v2", "title": "Architecture Overview v2", "type": "confluence", "created_at": ts(200), "url": "https://wiki.northwind.dev/arch-v2"},
        {"id": "doc-deploy-runbook-v2", "title": "Deploy Runbook v2", "type": "confluence", "created_at": ts(311), "url": "https://wiki.northwind.dev/deploy-v2"},
        {"id": "doc-deploy-runbook-v4", "title": "Deploy Runbook v4", "type": "confluence", "created_at": ts(80), "url": "https://wiki.northwind.dev/deploy-v4"},
        {"id": "doc-onboarding", "title": "Engineering Onboarding Guide", "type": "notion", "created_at": ts(150), "url": "https://notion.northwind.dev/onboarding"},
        {"id": "doc-billing-design", "title": "Billing Service Design Doc", "type": "gdoc", "created_at": ts(400), "url": "https://docs.google.com/d/billing-design"},
        {"id": "doc-auth-spec", "title": "Auth Service Specification", "type": "confluence", "created_at": ts(540), "url": "https://wiki.northwind.dev/auth-spec"},
        {"id": "doc-incident-2024-03", "title": "Incident Report: Billing Outage March 2024", "type": "confluence", "created_at": ts(220), "url": "https://wiki.northwind.dev/incident-2024-03"},
        {"id": "doc-team-charter", "title": "Platform Team Charter", "type": "notion", "created_at": ts(180), "url": "https://notion.northwind.dev/platform-charter"},
        {"id": "doc-api-gateway", "title": "API Gateway Migration Plan", "type": "confluence", "created_at": ts(45), "url": "https://wiki.northwind.dev/api-gateway"},
        {"id": "doc-q3-retro", "title": "Q3 2024 Retrospective", "type": "confluence", "created_at": ts(60), "url": "https://wiki.northwind.dev/q3-retro"},
    ]

    for d in documents:
        g.query(
            """MERGE (doc:Document {id: $id})
               SET doc.title = $title, doc.type = $type,
                   doc.created_at = $created_at, doc.url = $url""",
            params=d
        )

    print(f"  ✓ {len(documents)} Documents")

    # ══════════════════════════════════════════════════════════════════════
    # LAYER 2 — Semantic: People, Teams, Systems, Projects, Decisions
    # ══════════════════════════════════════════════════════════════════════

    # ── People ──
    people = [
        {"id": "person-priya",  "name": "Priya Sharma",   "role": "Senior Backend Engineer", "active": False, "joined_at": ts(800), "left_at": ts(94)},
        {"id": "person-alex",   "name": "Alex Chen",       "role": "Staff Engineer",          "active": True,  "joined_at": ts(600), "left_at": None},
        {"id": "person-jordan", "name": "Jordan Rivera",   "role": "Backend Engineer",        "active": True,  "joined_at": ts(300), "left_at": None},
        {"id": "person-sam",    "name": "Sam Okafor",      "role": "Platform Engineer",       "active": True,  "joined_at": ts(450), "left_at": None},
        {"id": "person-mei",    "name": "Mei Lin",         "role": "Engineering Manager",     "active": True,  "joined_at": ts(500), "left_at": None},
        {"id": "person-ravi",   "name": "Ravi Patel",      "role": "Frontend Engineer",       "active": True,  "joined_at": ts(200), "left_at": None},
        {"id": "person-dana",   "name": "Dana Kim",        "role": "SRE",                     "active": True,  "joined_at": ts(350), "left_at": None},
        {"id": "person-omar",   "name": "Omar Hassan",     "role": "Junior Backend Engineer", "active": True,  "joined_at": ts(90),  "left_at": None},
    ]

    for p in people:
        left = p["left_at"]
        g.query(
            """MERGE (p:Person {id: $id})
               SET p.name = $name, p.role = $role, p.active = $active,
                   p.joined_at = $joined_at""",
            params={k: v for k, v in p.items() if k != "left_at"}
        )
        if left:
            g.query("MATCH (p:Person {id: $id}) SET p.left_at = $left_at",
                    params={"id": p["id"], "left_at": left})

    print(f"  ✓ {len(people)} People")

    # ── Teams ──
    teams = [
        {"id": "team-platform", "name": "Platform", "mission": "Core infrastructure and developer experience"},
        {"id": "team-product",  "name": "Product Engineering", "mission": "Customer-facing features"},
        {"id": "team-sre",      "name": "SRE", "mission": "Reliability, observability, incident response"},
    ]

    for t in teams:
        g.query("MERGE (t:Team {id: $id}) SET t.name = $name, t.mission = $mission", params=t)

    # Team memberships
    memberships = [
        ("person-priya", "team-platform"), ("person-alex", "team-platform"),
        ("person-sam", "team-platform"), ("person-jordan", "team-product"),
        ("person-mei", "team-platform"), ("person-ravi", "team-product"),
        ("person-dana", "team-sre"), ("person-omar", "team-product"),
    ]
    for pid, tid in memberships:
        g.query(
            "MATCH (p:Person {id: $pid}), (t:Team {id: $tid}) MERGE (p)-[:MEMBER_OF]->(t)",
            params={"pid": pid, "tid": tid}
        )

    print(f"  ✓ {len(teams)} Teams, {len(memberships)} memberships")

    # ── Systems ──
    systems = [
        {"id": "sys-billing",     "name": "billing-service",   "tier": "critical", "language": "Go"},
        {"id": "sys-api-gateway", "name": "api-gateway",       "tier": "critical", "language": "Go"},
        {"id": "sys-user-svc",    "name": "user-service",      "tier": "high",     "language": "Python"},
        {"id": "sys-notification","name": "notification-service","tier": "medium",  "language": "Python"},
        {"id": "sys-frontend",    "name": "web-frontend",      "tier": "high",     "language": "TypeScript"},
        {"id": "sys-legacy-auth", "name": "legacy-auth",       "tier": "low",      "language": "Java"},  # PLANTED FAULT: orphan
        {"id": "sys-data-pipeline","name": "data-pipeline",    "tier": "medium",   "language": "Python"},
        {"id": "sys-search",      "name": "search-service",    "tier": "medium",   "language": "Python"},
    ]

    for s in systems:
        g.query(
            "MERGE (s:System {id: $id}) SET s.name = $name, s.tier = $tier, s.language = $language",
            params=s
        )

    print(f"  ✓ {len(systems)} Systems")

    # ── Projects ──
    projects = [
        {"id": "proj-api-migration", "name": "API Gateway Migration", "status": "in_progress", "started_at": ts(60)},
        {"id": "proj-billing-v2",    "name": "Billing v2",            "status": "completed",   "started_at": ts(400)},
        {"id": "proj-search-reindex","name": "Search Re-index",       "status": "planned",     "started_at": ts(30)},
    ]

    for p in projects:
        g.query(
            "MERGE (p:Project {id: $id}) SET p.name = $name, p.status = $status, p.started_at = $started_at",
            params=p
        )

    print(f"  ✓ {len(projects)} Projects")

    # ── Decisions ──
    decisions = [
        {"id": "dec-go-billing", "title": "Use Go for billing service rewrite", "made_at": ts(400), "rationale": "Performance requirements for payment processing"},
        {"id": "dec-monorepo",   "title": "Move to monorepo",                   "made_at": ts(350), "rationale": "Simplify dependency management"},
        {"id": "dec-k8s",        "title": "Migrate to Kubernetes",              "made_at": ts(300), "rationale": "Standardize deployment across services"},
    ]

    for d in decisions:
        g.query(
            "MERGE (d:Decision {id: $id}) SET d.title = $title, d.made_at = $made_at, d.rationale = $rationale",
            params=d
        )

    print(f"  ✓ {len(decisions)} Decisions")

    # ══════════════════════════════════════════════════════════════════════
    # OWNERSHIP edges — this is where the faults live
    # ══════════════════════════════════════════════════════════════════════

    ownership = [
        # PLANTED FAULT #1 & #5: billing-service owned ONLY by Priya, who left.
        # The OWNS edge has until = ts(94) — not null — so path queries see the gap.
        {"person": "person-priya", "system": "sys-billing", "since": ts(400), "until": ts(94), "primary": True},

        # Normal ownership
        {"person": "person-alex",   "system": "sys-api-gateway",  "since": ts(200), "until": None, "primary": True},
        {"person": "person-sam",    "system": "sys-api-gateway",  "since": ts(150), "until": None, "primary": False},
        {"person": "person-jordan", "system": "sys-user-svc",     "since": ts(300), "until": None, "primary": True},
        {"person": "person-alex",   "system": "sys-user-svc",     "since": ts(400), "until": None, "primary": False},
        {"person": "person-ravi",   "system": "sys-frontend",     "since": ts(200), "until": None, "primary": True},
        {"person": "person-sam",    "system": "sys-notification", "since": ts(300), "until": None, "primary": True},
        {"person": "person-dana",   "system": "sys-data-pipeline","since": ts(350), "until": None, "primary": True},
        {"person": "person-jordan", "system": "sys-search",       "since": ts(100), "until": None, "primary": True},
        # PLANTED FAULT #2: legacy-auth has NO OWNS edges at all → orphan
    ]

    for o in ownership:
        if o["until"] is not None:
            g.query(
                """MATCH (p:Person {id: $person}), (s:System {id: $system})
                   MERGE (p)-[r:OWNS]->(s)
                   SET r.since = $since, r.until = $until, r.primary = $primary""",
                params=o
            )
        else:
            g.query(
                """MATCH (p:Person {id: $person}), (s:System {id: $system})
                   MERGE (p)-[r:OWNS]->(s)
                   SET r.since = $since, r.primary = $primary""",
                params={k: v for k, v in o.items() if k != "until"}
            )

    print(f"  ✓ {len(ownership)} OWNS edges (1 expired = billing fault)")

    # ── DEPENDS_ON edges ──
    dependencies = [
        ("sys-api-gateway", "sys-billing"),
        ("sys-api-gateway", "sys-user-svc"),
        ("sys-frontend",    "sys-api-gateway"),
        ("sys-billing",     "sys-notification"),
        ("sys-billing",     "sys-data-pipeline"),
        ("sys-user-svc",    "sys-notification"),
        ("sys-search",      "sys-data-pipeline"),
        # PLANTED FAULT #2: legacy-auth has NO inbound DEPENDS_ON
    ]

    for src, tgt in dependencies:
        g.query(
            "MATCH (a:System {id: $src}), (b:System {id: $tgt}) MERGE (a)-[:DEPENDS_ON]->(b)",
            params={"src": src, "tgt": tgt}
        )

    print(f"  ✓ {len(dependencies)} DEPENDS_ON edges (legacy-auth missing = orphan)")

    # ── KNOWS_ABOUT edges ──
    knows = [
        ("person-alex", "sys-billing"),  # Alex knows billing but doesn't own it
        ("person-jordan", "sys-api-gateway"),
        ("person-sam", "sys-user-svc"),
        ("person-dana", "sys-billing"),
        ("person-mei", "sys-api-gateway"),
        ("person-omar", "sys-user-svc"),
        # PLANTED: nobody KNOWS_ABOUT legacy-auth either
    ]

    for pid, sid in knows:
        g.query(
            "MATCH (p:Person {id: $pid}), (s:System {id: $sid}) MERGE (p)-[:KNOWS_ABOUT]->(s)",
            params={"pid": pid, "sid": sid}
        )

    print(f"  ✓ {len(knows)} KNOWS_ABOUT edges")

    # ── DRIVEN_BY (Decision→System) ──
    driven = [
        ("sys-billing", "dec-go-billing"),
        ("sys-api-gateway", "dec-k8s"),
    ]
    for sid, did in driven:
        g.query(
            "MATCH (s:System {id: $sid}), (d:Decision {id: $did}) MERGE (s)-[:DRIVEN_BY]->(d)",
            params={"sid": sid, "did": did}
        )

    # ── AUTHORED edges (Document authorship) ──
    authored = [
        ("person-priya", "doc-deploy-runbook-v2"),
        ("person-priya", "doc-billing-design"),
        ("person-alex",  "doc-arch-v2"),
        ("person-alex",  "doc-deploy-runbook-v4"),
        ("person-sam",   "doc-onboarding"),
        ("person-jordan","doc-api-gateway"),
        ("person-dana",  "doc-incident-2024-03"),
        ("person-mei",   "doc-team-charter"),
        ("person-ravi",  "doc-q3-retro"),
    ]

    for pid, did in authored:
        g.query(
            "MATCH (p:Person {id: $pid}), (d:Document {id: $did}) MERGE (p)-[:AUTHORED]->(d)",
            params={"pid": pid, "did": did}
        )

    print(f"  ✓ {len(authored)} AUTHORED edges")

    # ══════════════════════════════════════════════════════════════════════
    # CLAIMS — the atoms of knowledge, with truth decay
    # ══════════════════════════════════════════════════════════════════════

    claims = [
        # ── billing-service claims ──
        {
            "id": "claim-billing-go", "text": "The billing service is written in Go and handles payment processing via Stripe",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.95,
            "asserted_at": ts(400), "valid_from": ts(400), "valid_to": None,
            "source": "doc-billing-design", "about": "sys-billing",
        },
        {
            "id": "claim-billing-owner", "text": "Priya Sharma is the primary owner of the billing service",
            "fact_type": "ownership", "half_life_days": 120, "base_conf": 0.90,
            "asserted_at": ts(400), "valid_from": ts(400), "valid_to": ts(94),  # PLANTED: expired
            "source": "doc-billing-design", "about": "sys-billing",
        },
        {
            "id": "claim-billing-incident", "text": "The billing service experienced a 4-hour outage in March 2024 due to a database connection pool exhaustion",
            "fact_type": "historical", "half_life_days": 999999, "base_conf": 0.98,
            "asserted_at": ts(220), "valid_from": ts(220), "valid_to": None,
            "source": "doc-incident-2024-03", "about": "sys-billing",
        },

        # ── api-gateway claims ──
        {
            "id": "claim-gw-owner", "text": "Alex Chen is the primary owner of the API gateway",
            "fact_type": "ownership", "half_life_days": 120, "base_conf": 0.95,
            "asserted_at": ts(50), "valid_from": ts(200), "valid_to": None,
            "source": "doc-api-gateway", "about": "sys-api-gateway",
        },
        {
            "id": "claim-gw-migration", "text": "The API gateway is being migrated from nginx to Envoy as part of the Kubernetes migration",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.90,
            "asserted_at": ts(45), "valid_from": ts(60), "valid_to": None,
            "source": "doc-api-gateway", "about": "sys-api-gateway",
        },

        # ── deploy process claims — PLANTED FAULT #3 (decay) and #4 (contradiction) ──
        {
            "id": "claim-deploy-v2-rollback", "text": "Rollback procedure: revert the last git commit on the deploy branch and re-run the CI pipeline",
            "fact_type": "process", "half_life_days": 270, "base_conf": 0.90,
            "asserted_at": ts(311), "valid_from": ts(311), "valid_to": None,  # 311 days old → decayed
            "source": "doc-deploy-runbook-v2", "about": "sys-api-gateway",
        },
        {
            "id": "claim-deploy-v4-rollback",
            "text": "Rollback procedure: toggle the feature flag to route traffic back to the previous version, no git operations needed",
            "fact_type": "process", "half_life_days": 270, "base_conf": 0.90,
            "asserted_at": ts(80), "valid_from": ts(80), "valid_to": None,
            "source": "doc-deploy-runbook-v4", "about": "sys-api-gateway",
        },
        {
            "id": "claim-deploy-frequency", "text": "The team deploys to production twice per week, on Tuesday and Thursday",
            "fact_type": "process", "half_life_days": 270, "base_conf": 0.85,
            "asserted_at": ts(311), "valid_from": ts(311), "valid_to": None,  # PLANTED FAULT #3: decayed
            "source": "doc-deploy-runbook-v2", "about": "sys-api-gateway",
        },

        # ── user-service claims ──
        {
            "id": "claim-usersvc-python", "text": "The user service is written in Python using FastAPI and handles authentication and user profiles",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.95,
            "asserted_at": ts(200), "valid_from": ts(300), "valid_to": None,
            "source": "doc-arch-v2", "about": "sys-user-svc",
        },
        {
            "id": "claim-usersvc-owner", "text": "Jordan Rivera owns the user service",
            "fact_type": "ownership", "half_life_days": 120, "base_conf": 0.90,
            "asserted_at": ts(100), "valid_from": ts(300), "valid_to": None,
            "source": "doc-arch-v2", "about": "sys-user-svc",
        },

        # ── legacy-auth claims — PLANTED FAULT #2 (orphan: only one stale claim) ──
        {
            "id": "claim-auth-java", "text": "The legacy authentication service is written in Java and uses LDAP for directory lookups",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.80,
            "asserted_at": ts(540), "valid_from": ts(540), "valid_to": None,
            "source": "doc-auth-spec", "about": "sys-legacy-auth",
        },

        # ── general org claims ──
        {
            "id": "claim-monorepo", "text": "All backend services live in a single monorepo at github.com/northwind/platform",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.95,
            "asserted_at": ts(200), "valid_from": ts(350), "valid_to": None,
            "source": "doc-arch-v2", "about": "team-platform",
        },
        {
            "id": "claim-k8s", "text": "All services run on Kubernetes in AWS EKS, deployed via ArgoCD",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.92,
            "asserted_at": ts(150), "valid_from": ts(300), "valid_to": None,
            "source": "doc-onboarding", "about": "team-platform",
        },
        {
            "id": "claim-oncall", "text": "Platform team runs a weekly on-call rotation: Alex → Sam → Dana → repeat",
            "fact_type": "process", "half_life_days": 270, "base_conf": 0.85,
            "asserted_at": ts(180), "valid_from": ts(180), "valid_to": None,
            "source": "doc-team-charter", "about": "team-platform",
        },
        {
            "id": "claim-search-elastic", "text": "The search service uses Elasticsearch 7.x and needs to be re-indexed quarterly",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.88,
            "asserted_at": ts(100), "valid_from": ts(200), "valid_to": None,
            "source": "doc-arch-v2", "about": "sys-search",
        },
        {
            "id": "claim-notification-email", "text": "The notification service sends emails via SendGrid and push notifications via Firebase",
            "fact_type": "architecture", "half_life_days": 540, "base_conf": 0.90,
            "asserted_at": ts(150), "valid_from": ts(300), "valid_to": None,
            "source": "doc-onboarding", "about": "sys-notification",
        },
    ]

    for c in claims:
        # MERGE each claim node
        params = {k: v for k, v in c.items() if k not in ("source", "about") and v is not None}
        g.query(
            """MERGE (c:Claim {id: $id})
               SET c.text = $text, c.fact_type = $fact_type,
                   c.half_life_days = $half_life_days, c.base_conf = $base_conf,
                   c.asserted_at = $asserted_at, c.valid_from = $valid_from""",
            params=params
        )
        # Set valid_to if present
        if c.get("valid_to") is not None:
            g.query("MATCH (cl:Claim {id: $id}) SET cl.valid_to = $vt",
                    params={"id": c["id"], "vt": c["valid_to"]})

        # EXTRACTED_FROM → source document
        g.query(
            """MATCH (cl:Claim {id: $cid}), (d:Document {id: $did})
               MERGE (cl)-[:EXTRACTED_FROM]->(d)""",
            params={"cid": c["id"], "did": c["source"]}
        )

        # ABOUT → target entity
        g.query(
            """MATCH (cl:Claim {id: $cid}), (target {id: $tid})
               MERGE (cl)-[:ABOUT]->(target)""",
            params={"cid": c["id"], "tid": c["about"]}
        )

    print(f"  ✓ {len(claims)} Claims with EXTRACTED_FROM + ABOUT edges")

    # ── Plant the CONTRADICTS edge between the two rollback claims ──
    g.query(
        """MATCH (c1:Claim {id: 'claim-deploy-v2-rollback'}),
               (c2:Claim {id: 'claim-deploy-v4-rollback'})
           MERGE (c1)-[r:CONTRADICTS]->(c2)
           SET r.detected_at = $now, r.similarity = 0.87, r.state = 'suspected'""",
        params={"now": NOW}
    )
    print("  ✓ CONTRADICTS edge planted between rollback claims")

    # ══════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ══════════════════════════════════════════════════════════════════════
    result = g.ro_query("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC")
    print("\n── Graph summary ──")
    for row in result.result_set:
        print(f"  {row[0]:20s} {row[1]}")

    result = g.ro_query("MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC")
    print("\n── Edge summary ──")
    for row in result.result_set:
        print(f"  {row[0]:20s} {row[1]}")

    print("\n✅ Seed data loaded with 5 planted faults:")
    print("  1. Bus-factor: billing-service → only Priya (inactive)")
    print("  2. Orphan: legacy-auth → no owners, no deps, 1 stale claim")
    print("  3. Decay: deploy process claims → 311 days old, half-life 270")
    print("  4. Contradiction: two rollback procedures disagree")
    print("  5. Missing owner: billing-service OWNS.until is set (gap visible)")


if __name__ == "__main__":
    seed()
