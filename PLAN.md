> **Superseded as the teaching contract.** This file is historical notes. The current public surface is README.md, SCHEMA.md, and PITFALLS.md.

# Goyondo OSS plan

Date: 2026-09-10  
Repo: [github.com/agteo/goyondo-oss](https://github.com/agteo/goyondo-oss)  
Local: `/Users/alext/Documents/AI-Projects/goyondo-oss`

## Intent

Publish a **narrower, public** Goyondo surface. Not the full hosted product.

Two layers, on purpose:

1. **Now:** reference agent examples (device auth → `list_trips`, optional cost-safe `create_trip`). Already in this folder.
2. **Later:** a slim open-source app slice, if we still want that after examples are live.

This repo is **not** an SDK. Canonical contracts stay on `https://goyondo.run` (`/api/agent/card`, `/api/agent/capabilities`, `/auth.md`).

## Current state

| Item | Status |
| ---- | ------ |
| Local folder renamed from `goyondo-agent-examples` | Done |
| GitHub repo `agteo/goyondo-oss` | Created (empty / not yet matching this tree until we push) |
| MIT license, `.env.example`, curl / Python / TypeScript quickstarts | In this folder, one local commit |
| Git remote on this clone | Not wired yet — add `origin` and push |
| Goyondo product still links to `github.com/agteo/goyondo-agent-examples` | Stale; update **after** this repo is public and the examples have been run once against a real API |

## Non-goals (keep)

- Do not copy the full Goyondo monolith here.
- Do not publish internal schemas, private endpoints, or secrets.
- Do not ship `goyondo-py` (or any other SDK) in this pass.
- Do not make x402 / autonomous-agent billing a dependency.

## Work remaining

### 1. Land this tree on GitHub

- `git remote add origin https://github.com/agteo/goyondo-oss.git` (if missing)
- Push `main`
- Confirm the GitHub description matches what we are actually shipping in v0 (examples vs “open-sourced Goyondo”)

### 2. Finish v0 examples (this repo)

- Rename leftover “agent-examples” wording in `README.md` to `goyondo-oss`
- Run curl, Python, and TypeScript paths: empty key → device auth → `list_trips`
- Optionally run `--create` with `skip_ai_generation: true`
- Confirm no secrets in git; `.env` stays gitignored
- README already states: not an SDK; empty `list_trips` is valid; keys are one-time reveal

**Done when:** someone can clone, leave `GOYONDO_API_KEY` empty, grant access at `/connect`, and get a successful `list_trips`.

### 3. Retarget the hosted product (Goyondo repo, separate pass)

Replace `https://github.com/agteo/goyondo-agent-examples` with `https://github.com/agteo/goyondo-oss` in:

- `frontend/public/llms.txt`
- `frontend/public/auth.md`
- `frontend/public/agent-quickstart.md`
- `frontend/public/index.md`
- `frontend/src/pages/Developers.tsx`
- `backend/server/a2a/agentCard.js`
- `docs/BUILDING_AN_AGENT_FOR_GOYONDO.md`
- `docs/AGENT_EVALS.md`
- `tests/agent-evals/run-evals.js`

Link only after step 2 has been tested.

### 4. Optional later: narrower OSS *product*

Decide the slice **before** copying app code. A useful default:

| In | Out |
| -- | --- |
| Trip list / get / create (no AI generation required) | Hosted billing, Stripe, quotas as a product |
| Device auth + agent task examples (already here) | Trends scraping, email ingestion, proprietary pipelines |
| Human + agent docs that point at live `goyondo.run` | Internal admin, PostHog, production deploy scripts |

Write a one-page “OSS product boundary” before extracting frontend/backend. Until then, this repo stays examples-only.

## Open questions

- Is v0 **examples only**, or do we extract a runnable slim app in the next pass?
- Test against production (`goyondo.run`) with a throwaway account, or staging?
- Keep MIT here even if the hosted product stays private / ISC-labelled?

## Suggested order

1. Remote + push
2. Smoke-test the three example languages
3. Retarget Goyondo links
4. Only then: OSS product boundary + extract
