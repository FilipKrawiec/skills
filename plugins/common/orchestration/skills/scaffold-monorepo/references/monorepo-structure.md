# Monorepository Structure Reference

This reference details the folder structure and design rules for Trunk-Based Development monorepos.

## Layout

```text
my-monorepo/
├── .devcontainer/
│   ├── devcontainer.json               # Sandbox environment
│   └── Dockerfile                      # Dev image (just, helm, ansible, sops, kubectl)
├── .helm/                              # Root Helm chart scaffolding
├── .worktrees/                         # Isolated git worktrees directory (gitignored)
├── .env                                # Local dev secrets (gitignored)
├── .env.example                        # Template environment variables
├── AGENTS.md                           # Monorepo architecture invariants & frontmatter
├── README.md                           # Human-facing project introduction
├── justfile                            # Root recipe book (up, down, purge, unit, verify)
├── compose.yaml                        # Local dependency topology
├── compose.test.yaml                   # Integration test topology
│
├── components/                         # Self-contained Bounded Contexts
│   ├── monolith/                       # Monolithic Application Component
│   │   ├── src/
│   │   ├── justfile
│   │   ├── Dockerfile
│   │   └── .deploy/ansible/            # Co-located Ansible playbooks
│   │
│   └── payment-service/                # Microservice Component
│       ├── src/
│       ├── justfile
│       ├── Dockerfile
│       └── .deploy/helm/               # Co-located Helm chart
│
├── deploy/
│   └── umbrella-chart/                # Parent Umbrella Chart
│       ├── Chart.yaml                 # Dependencies to components/*/.deploy/helm
│       └── values.yaml
│
├── docs/                               # All Project Documentation
│   ├── context.md                      # Domain context & ubiquitous language
│   ├── glossary.md                     # Vocabulary definitions
│   ├── event-storming.md               # Event storming workflow records
│   ├── context-map.md                  # Bounded context maps
│   └── adr/                            # Architecture Decision Records
│
└── shared/                             # Local shared libraries
    ├── domain-common/
    └── ansible-roles/
```

## Rules
1. **Co-located Deployment**: Put Helm charts in `components/<service>/.deploy/helm` and Ansible playbooks in `components/<monolith>/.deploy/ansible`.
2. **Umbrella Chart**: The parent chart at `deploy/umbrella-chart/Chart.yaml` references co-located service charts via `file://../../components/<service>/.deploy/helm`.
3. **Docs Directory**: All context, glossary, event storming, and ADR files live in `docs/`.
