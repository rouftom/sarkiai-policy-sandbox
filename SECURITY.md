# Security policy

## Supported versions

Security fixes land on the integration branch and are promoted to `main`
following the project's workflow:

| Branch | Supported |
| --- | --- |
| `main` (release) | yes |
| `develop` (integration) | yes |
| Topic, feature and release branches | no |

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security
vulnerability.**

Report it privately through GitHub Security Advisories:
<https://github.com/rouftom/sarkiai-policy-sandbox/security/advisories/new>.
If you cannot use that form, open a minimal public issue asking a maintainer for
a private channel, without details of the vulnerability.

Include as much of the following as you can:

- the type of issue (for example injection, cross-site scripting, exposed
  secret, broken access control, server-side request forgery);
- the affected component (web console, API, MCP sidecars, ingestion services,
  deployment);
- the affected version, commit, branch or URL;
- any special configuration required to reproduce it;
- step-by-step reproduction instructions;
- a proof of concept or exploit code, if you have one;
- the impact, including how an attacker might exploit it.

Never include a real credential, token, API key or personal data in a report.
Reference the variable or file name only; if a real secret leaked, say so
immediately so it can be rotated. See [`docs/SECRETS.md`](docs/SECRETS.md).

## What to expect

- We acknowledge the report as soon as possible and keep the discussion private
  until a fix is available.
- We confirm the scope, ask for missing reproduction details, and agree on a
  coordinated disclosure date.
- We credit the reporter in the advisory unless they prefer to stay anonymous.

This project has no bug bounty. Reports are handled on a best-effort basis by
the maintainers.

## Scope

In scope:

- the `apps/web` console and `apps/api` HTTP surface;
- the MCP sidecars under `services/` (`mcp-charts`, `mcp-docx`);
- the local ingestion, OCR and transcription services under `services/`;
- the packages under `packages/`;
- deployment configuration committed to this repository.

Out of scope:

- vulnerabilities in third-party dependencies with no exploitable path in this
  project (report them upstream as well);
- findings that require a compromised operator account;
- social engineering, physical access and denial-of-service by volume;
- missing hardening headers with no demonstrated impact.

## Security controls

- **Model output is sanitized before rendering.** Raw HTML is parsed, then
  filtered through GitHub's allowlist by `rehype-sanitize`; scripts, frames,
  styles, forms and event handlers are dropped. KaTeX math and syntax
  highlighting keep working.
- **The console sets a content-security policy.** `img-src` and `frame-src` are
  restricted to this app, inline data and blobs, the API host and any origin
  listed in `NEXT_PUBLIC_CSP_IMG_SOURCES` / `NEXT_PUBLIC_CSP_FRAME_SOURCES`. An
  injected image URL cannot leak data in its query string.
- **CORS accepts only this project's origins.** They come from configuration;
  loopback is always allowed so an on-premise install behind a LAN name works.
- **The API is rate-limited per caller.** One wide budget covers the
  authenticated surface and a tighter budget covers the routes that spend model
  work. Counters live in one bounded in-process map; `RATE_LIMIT_ENABLED=false`
  removes both budgets.
- **Approval links are signed, expiring and single-use.** The token is an HMAC
  over a JSON payload; the single-use identifier is recorded when the decision
  is taken. The router accepts the token's length instead of rejecting the link.
- **Server-side keys stay server-side.** The MCP proxy resolves a server name
  against a fixed registry, injects the shared key from the API process and
  forwards nothing else; the key never reaches the browser.
- **Containers run unprivileged.** The production images create an `app` user
  (`node` for the console) and drop to it; only the development stages keep
  root, where a bind-mounted source tree must stay writable.
- **The stack makes no outbound model call.** Generation, embeddings and
  reranking run locally; e-mail is written to the API log and the in-console
  outbox instead of being sent. Dependency installation is the only network
  access the build needs.
- **Continuous integration.** Every push and pull request installs from the
  frozen lockfile, runs `bun run typecheck` and `bun test packages apps`; a red
  check blocks the merge.
- **Dependency advisories.** The `audit` job runs `bun audit` on each of the
  three lockfiles: the root workspace, `services/mcp-charts` and
  `services/mcp-docx` (the sidecars sit outside the root workspace). A high or
  critical advisory fails the check. Moderate and low advisories are printed in
  the log and do not block. The job audits lockfiles only, not the built images.

## Known limits

These are deliberate, documented limits rather than findings:

- Rate limits are in-process and per instance. A multi-instance deployment
  needs a shared counter, or accepts the per-instance budget.
- The Python ingestion, OCR and transcription services are not covered by CI:
  no test runner is installed in this image, so their tests run locally only.
- The MCP sidecars share one static key (`MCP_API_KEY`). It is generated per
  install and never leaves the compose network.
- Moderate and low dependency advisories are still reported by `bun audit`:
  KaTeX 0.16 (transitive through `rehype-katex`, which requires that major),
  PrismJS 1.27 (transitive through the e-mail renderer), Hono and `fast-uri`
  (transitive through the MCP SDK and AJV). None of them is reachable as a high
  or critical path in this stack; they are tracked and upgraded when their
  parent package allows it.

## Safe harbour

We will not pursue legal action against researchers who:

- act in good faith and avoid privacy violations, data destruction and service
  disruption;
- only interact with accounts and data they own or have explicit permission to
  use;
- report the issue privately and give us reasonable time to fix it before
  disclosure.

This is a project-level statement, not a legal opinion.
