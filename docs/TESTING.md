# Testing

Three levels: **unit** (no infrastructure), **integration** (infrastructure
required, *gated*), **e2e** (stack running, *gated*). Integration and e2e tests are
**skipped automatically** when their environment variables are not set, which lets
them live in the repository without depending on a particular machine.

> ⚠️ **This development machine cannot run the infrastructure** (no Docker
> runtime, hardware constraints). Only the **unit** tests run here.

## Unit tests (no infrastructure): runnable anywhere

```bash
bun run test          # turbo: bun test in each package (@sps/*)
bun test              # everything (unit + gated; the gated ones are skipped)
```

Coverage: `@sps/shared` (ITU taxonomy 6/13, lenses, institutions),
`@sps/scenarios` (progressive release, asymmetry), `@sps/readiness` (0–5 scoring,
composite, causal graph), `@sps/citations`, `@sps/report`, `@sps/storage`,
`@sps/retrieval` (RRF).

Python (chunker, standard library only):

```bash
cd services/ingestion && PYTHONPATH=src python3 tests/test_chunker.py
```

## Integration (*gated* by environment, infrastructure required)

TypeScript:

```bash
MONGO_URL=mongodb://localhost:27017 bun run test:int          # audit (hash chain)
QDRANT_URL=http://localhost:6333 OLLAMA_BASE_URL=http://localhost:11434 \
  bun run test:int                                             # hybrid retrieval
```

Python (pydantic / fastapi / qdrant required, via Docker):

```bash
cd services/ingestion && PYTHONPATH=src pytest tests/ \
  -k "schemas or embeddings or qdrant_store or api"
```

## e2e (*gated*, stack running)

```bash
E2E_BASE_URL=http://localhost:8000 bun run test:e2e
```

Checks `/health`, `POST /v1/scenarios/start` (agenda), the release of one
facilitator tick, and `POST /v1/readiness/report` (13 dimensions scored).

## Recommended CI (outside this machine)

| Job | Command | Infrastructure |
|-----|---------|----------------|
| unit | `bun run typecheck && bun run test && bun run build` | none |
| unit-py | `pytest services/ingestion/tests` | ingestion Docker image |
| integration | `bun run test:int` + `pytest -k integration` | mongo + qdrant + ollama |
| e2e | `docker compose up -d && make models && ./scripts/seed.sh`, then `bun run test:e2e` | full stack |

## Conventions

- TypeScript tests: `*.test.ts` (unit), `*.integration.test.ts` (gated).
- Python tests: `services/<svc>/tests/test_*.py` (pytest).
- Never a network or infrastructure dependency in **unit** tests.
