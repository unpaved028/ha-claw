# Contributing to HA-Claw

Thanks for taking the time. This document covers everything you need to get a change merged.

- [Ground rules](#ground-rules)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [The one file you must not edit](#the-one-file-you-must-not-edit)
- [Checks that run on every push](#checks-that-run-on-every-push)
- [Conventions](#conventions)
- [Documentation is part of the change](#documentation-is-part-of-the-change)
- [Opening a pull request](#opening-a-pull-request)
- [Reporting bugs](#reporting-bugs)

## Ground rules

- **Discuss before you build.** For anything larger than a bug fix, open an issue first. The
  [roadmap](docs/roadmap.md) explains what the project is deliberately *not* doing yet.
- **Safety changes get extra scrutiny.** Any change to `src/tools/ha-tools.ts` that touches
  the domain allowlist, `entity_id` validation or the confirmation flow must explain what it
  allows that was previously blocked. See [docs/security.md](docs/security.md).
- **No new dependencies without a reason.** The runtime has exactly two (`fastify`,
  `grammy`). That is a feature, not an accident — the add-on image is built on the user's
  Raspberry Pi.

## Repository layout

This is an add-on repository, so the add-on lives in a subdirectory and the root holds
repository-level metadata.

```text
.
├── repository.yaml         # Home Assistant add-on repository manifest
├── README.md               # GitHub landing page (EN) + README.de.md (DE)
├── AGENTS.md               # Instructions for AI coding agents
├── docs/                   # Technical reference (English only)
├── scripts/check-docs.mjs  # Link checker run by CI
└── ha-claw/                # ← the add-on itself
    ├── config.yaml         # Add-on manifest (version, options, schema)
    ├── DOCS.md / DOCS.de.md# User manual shown in the HA add-on UI
    ├── CHANGELOG.md
    ├── translations/       # Localised option labels for the HA config UI
    ├── agents/             # System prompts + best-practice knowledge base
    ├── scripts/            # Dashboard bundler
    └── src/                # TypeScript source
```

`ha-claw/` is where `npm` lives. Every `npm` command in this document runs from there.

## Local development

You need Node.js 22 or newer.

```bash
git clone https://github.com/unpaved028/ha-claw.git
cd ha-claw/ha-claw
npm ci
```

HA-Claw normally reads its configuration from `/data/options.json`, which only exists inside
the add-on container. For local work it falls back to `dev-options.json`:

```bash
cp dev-options.json.example dev-options.json
# then fill in openrouter_api_key
```

`dev-options.json` is gitignored because it holds a real API key. Never commit it.

```bash
npm run dev      # tsx watch, serves the dashboard on http://localhost:3100
```

Without a `SUPERVISOR_TOKEN` the add-on starts in **standalone mode**: the Web UI, storage,
scheduler and LLM calls work, but Home Assistant tools fail because there is no HA to talk
to. Set `HA_API_URL` and a long-lived access token to point a local instance at a real
Home Assistant. Details in [docs/configuration.md](docs/configuration.md).

Local data is written to `ha-claw/data/store/`, mirroring `/data/store/` in the container.

## The one file you must not edit

`ha-claw/src/web/dashboard.ts` is **generated**. Edit these instead:

| Edit this | Not this |
| --- | --- |
| `src/web/ui/dashboard.html` | `src/web/dashboard.ts` |
| `src/web/ui/style.css` | ↑ |
| `src/web/ui/client.js` | ↑ |

Then regenerate:

```bash
npm run bundle          # writes src/web/dashboard.ts
npm run verify:bundle   # fails if the generated file drifted from its sources
```

The generated file is committed on purpose. Home Assistant Ingress serves the UI under a
rotating `/api/hassio_ingress/<token>/` prefix, so relative `<link>` and `<script src>` paths
cannot resolve — the entire dashboard has to be inlined into a single HTML response.
`npm run build` runs the bundler automatically through the `prebuild` hook, so the Docker
image can never ship a stale dashboard. CI fails if you hand-edit the artefact.

## Checks that run on every push

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs four jobs. Run the
equivalent locally before pushing:

```bash
cd ha-claw
npm run verify:bundle   # dashboard.ts matches src/web/ui/
npm run check           # tsc --noEmit
npm run lint            # eslint
npm run format          # prettier --check
npm test                # node:test suite
```

```bash
# from the repository root
node scripts/check-docs.mjs   # every relative link in the docs resolves
```

Plus two consistency jobs you cannot easily run locally:

- **Docker build** — `docker build -t ha-claw:ci .` from `ha-claw/`.
- **Version consistency** — `package.json`, `config.yaml` and the newest `CHANGELOG.md`
  heading must state the same version, and the model list in `config.yaml` must match
  `src/core/models.ts`.

Auto-fix formatting and lint problems with `npm run format:fix` and `npm run lint:fix`.

## Conventions

| Area | Convention |
| --- | --- |
| Source code | English — identifiers, comments, log messages |
| Commit messages | English, [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`) |
| `docs/`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md` | English |
| `ha-claw/DOCS.md` | English, with `DOCS.de.md` as the German mirror |
| Web UI strings and `agents/*.md` prompts | German — this is what the end user reads |
| `CHANGELOG.md` | English for new entries; older German entries stay as written |
| TypeScript | Strict mode, ESM (`"type": "module"`), no `any` without a comment justifying it |
| Versioning | Bump `package.json` **and** `config.yaml` in the same commit |

Comments explain *why*, not *what*. If a comment restates the line below it, delete it.

## Documentation is part of the change

A pull request that changes behaviour without changing the documentation is incomplete. The
mapping between code and docs is defined in [AGENTS.md](AGENTS.md#documentation-map) — it
tells you exactly which files to touch when you change, for example, a tool definition or an
HTTP route.

The short version:

| If you changed… | Update… |
| --- | --- |
| A tool's name, description, `dangerous` flag or complexity | [`docs/tools.md`](docs/tools.md) |
| An HTTP route or SSE event | [`docs/api.md`](docs/api.md) |
| A config option or schema entry | `config.yaml`, `translations/{en,de}.yaml`, [`docs/configuration.md`](docs/configuration.md), both READMEs, both DOCS |
| The safety allowlist or confirmation flow | [`docs/security.md`](docs/security.md), [`SECURITY.md`](SECURITY.md), both DOCS |
| A module, file or data path | [`docs/architecture.md`](docs/architecture.md) |
| Anything user-visible | `ha-claw/CHANGELOG.md` under an `## Unreleased` heading |

## Opening a pull request

1. Branch from `main`.
2. Keep the change focused. Refactors and behaviour changes in one PR are hard to review.
3. Fill in the pull request template — especially **how you tested it**. `npm test` covers
   the safety policy and a handful of other expensive bugs; it does not talk to Home
   Assistant. Manual verification still matters for anything the suite cannot see.
4. Do **not** bump the version in a feature PR. Releases are cut separately; see
   [docs/releasing.md](docs/releasing.md).

## Reporting bugs

Use the [bug report template](https://github.com/unpaved028/ha-claw/issues/new?template=bug_report.yml).
Please include the add-on version, your Home Assistant version, the selected model, and the
relevant add-on log with `log_level: debug`.

**Do not paste API keys.** The logger redacts secrets it recognises, but check before you
post. For anything with a security impact, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE), and to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
