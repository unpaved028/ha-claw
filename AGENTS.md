# AGENTS.md

Instructions for AI coding agents working in this repository. Human contributors should read
[`CONTRIBUTING.md`](CONTRIBUTING.md) instead — this file assumes that one and adds the rules
that specifically stop agents from making a mess.

Read this before your first edit. The [documentation map](#documentation-map) is not optional.

- [What this project is](#what-this-project-is)
- [Hard rules](#hard-rules)
- [Where things live](#where-things-live)
- [Documentation map](#documentation-map)
- [Documentation standards](#documentation-standards)
- [Language rules](#language-rules)
- [Before you finish a task](#before-you-finish-a-task)
- [Common tasks](#common-tasks)
- [Environment](#environment)

## What this project is

HA-Claw is a Home Assistant add-on: a TypeScript (ESM) agent that talks to Home Assistant
through the Supervisor API, serves a Web UI over Ingress, and optionally runs a Telegram bot.
It has an agentic loop with tool calling, and it can control devices and rewrite automations.

Read [`docs/architecture.md`](docs/architecture.md) before making a structural change and
[`docs/roadmap.md`](docs/roadmap.md) before proposing a feature. The roadmap says which areas
are actively developed, which are maintained rather than expanded, and which are
[deliberately out of scope](docs/roadmap.md#deliberately-not-doing) — check it before writing
any code for a new capability.

## Hard rules

**1. Never edit `ha-claw/src/web/dashboard.ts`.** It is generated. Edit
`ha-claw/src/web/ui/{dashboard.html,style.css,i18n.js,client.js}` and run `npm run bundle`. CI fails
if the artefact drifts from its sources. The 0.8.1–0.8.5 bug series happened because the
generated file was patched by hand.

**2. Never hand-maintain a tool list in `agents/main.md`.** The `{{TOOL_LIST}}` placeholder is
filled from the registry at runtime. A hand-written list drifted until the model no longer
knew about 11 of its own tools.

**3. Never commit `dev-options.json`, `.env`, or anything containing an API key.** If you need
an example, edit `dev-options.json.example`.

**4. Never widen the safety allowlist without saying so.** Any change to `SAFE_DOMAINS`,
`GUARDED_DOMAINS`, `GUARDED_COVER_CLASSES` or the `entity_id` validation in
`ha-claw/src/tools/ha-tools.ts` must state, in the pull request and in the changelog, exactly
what it now permits that was previously blocked. When in doubt, mark a tool `dangerous: true`.

**5. Never bump the version as part of a feature change.** Releases are cut separately; see
[`docs/releasing.md`](docs/releasing.md). When you *are* cutting a release, bump
`package.json`, `config.yaml` and the `CHANGELOG.md` heading together — CI compares all three.

**6. Never add a runtime dependency without asking.** There are two (`fastify`, `grammy`) and
the image is built on the user's Raspberry Pi.

**7. Never claim something works because it compiles.** `npm run check` passing means the
types line up. `npm test` covers the safety policy, schedule parsing, context pruning,
entity-cache compression, storage locks, tool-argument validation, the Ingress allowlist,
YAML diffs and config validation — not live Home Assistant behaviour. If you cannot
verify something, say so plainly instead of implying you did.

## Where things live

```text
docs/                    Technical reference (English). Architecture, tools, API, security.
AGENTS.md                This file.
CONTRIBUTING.md          Human contributor guide.
SECURITY.md              Vulnerability reporting policy.
scripts/check-docs.mjs   Markdown link checker. CI runs it.

ha-claw/                 The add-on. npm lives here.
  config.yaml            Manifest: version, options, schema.
  DOCS.md / DOCS.de.md   User manual, rendered by the HA add-on UI.
  README.md              Add-on store description.
  CHANGELOG.md           Version history.
  translations/          Option labels for the HA config UI (en, de).
  agents/main.md         German system prompt. Contains {{TOOL_LIST}}, {{ENTITY_CACHE}}.
  agents/main.en.md      English system prompt. Same placeholders.
  src/                   TypeScript source.
  src/web/ui/            Dashboard sources — edit these (including i18n.js).
  src/web/dashboard.ts   GENERATED — never edit.
```

Documentation lives beside what it describes. `docs/` is repository-level; `ha-claw/DOCS.md`
ships inside the add-on because Home Assistant renders it in the Documentation tab.

## Documentation map

**A change to behaviour is not finished until the documentation matches it.** Find the row for
what you touched and update every file in it.

| You changed | You must update |
| --- | --- |
| A tool's name, description, `dangerous` flag or `complexity` | [`docs/tools.md`](docs/tools.md) |
| The domain allowlist, guarded domains, `device_class` exceptions, `entity_id` validation | [`docs/security.md`](docs/security.md), [`SECURITY.md`](SECURITY.md), `ha-claw/DOCS.md` **and** `ha-claw/DOCS.de.md` |
| An HTTP route, its request/response shape, or an SSE event type | [`docs/api.md`](docs/api.md) |
| A config option or `config.yaml` schema entry | `ha-claw/config.yaml` (`options` **and** `schema`), `ha-claw/translations/en.yaml` **and** `de.yaml`, [`docs/configuration.md`](docs/configuration.md), `README.md` **and** `README.de.md`, `ha-claw/DOCS.md` **and** `DOCS.de.md` |
| The model list | `ha-claw/src/core/models.ts` (source of truth), `ha-claw/config.yaml` enum, [`docs/configuration.md`](docs/configuration.md#available-models) |
| A module, file, directory or data path | [`docs/architecture.md`](docs/architecture.md), [`docs/configuration.md`](docs/configuration.md#data-paths) |
| A system health check or its thresholds | [`docs/architecture.md`](docs/architecture.md#proactive-analysis-vs-system-health), `ha-claw/DOCS.md` **and** `DOCS.de.md` |
| A proactive analysis module | [`docs/architecture.md`](docs/architecture.md#proactive-analysis-vs-system-health) |
| A scheduler format | [`docs/tools.md`](docs/tools.md#scheduler), `ha-claw/DOCS.md` **and** `DOCS.de.md` |
| A Telegram command | `ha-claw/DOCS.md` **and** `DOCS.de.md`, the `setMyCommands` list in `bot.ts` |
| The build pipeline, npm scripts or CI | [`docs/development.md`](docs/development.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`docs/releasing.md`](docs/releasing.md) |
| Anything a user would notice | `ha-claw/CHANGELOG.md` under `## Unreleased` |
| A roadmap item you completed | Remove it from [`docs/roadmap.md`](docs/roadmap.md) and record it in the changelog |

Two files always travel together: **`DOCS.md` and `DOCS.de.md`**, and **`README.md` and
`README.de.md`**. Updating one and not the other is how translations rot. If you cannot write
the German, say so in your summary rather than leaving the pair inconsistent.

## Documentation standards

**Write what the code does, not what it was supposed to do.** Before documenting a threshold,
a default or a list, open the file and read it. Several documents in this repository name
their source file precisely so the next agent can verify instead of trusting.

**Never link to a file without checking it exists.** `node scripts/check-docs.mjs` from the
repository root validates every relative link and heading anchor. Run it.

**Delete outdated statements rather than appending corrections.** A document that says "this
used to poll every 30 seconds, but now…" costs the reader more than one that just describes
the current behaviour. Historical context earns its place only when it prevents a mistake —
"the artefact is committed on purpose, here is why" is worth keeping; "in v0.6.2 we changed
this" is not.

**Do not add a new document when an existing one has the right home.** The docs tree is small
on purpose. A new file needs a row in [`docs/README.md`](docs/README.md) and probably a link
from [`README.md`](README.md).

**State limitations.** [`docs/security.md`](docs/security.md) ends with a list of known
weaknesses, and that is deliberate. Do not quietly remove such a list because a change made it
shorter — shorten it accurately.

**No emoji in the technical docs.** The user-facing `DOCS.md` uses the sensor icons that
appear in the product, and that is the only exception.

## Language rules

| Surface | Language |
| --- | --- |
| Source code, identifiers, comments, log messages | English |
| Commit messages ([Conventional Commits](https://www.conventionalcommits.org/)) | English |
| `docs/`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md` | English |
| `ha-claw/DOCS.md`, `ha-claw/README.md` | English |
| `README.de.md`, `ha-claw/DOCS.de.md`, `translations/de.yaml` | German |
| `ha-claw/agents/main.md`, `onboarding.md` | German |
| `ha-claw/agents/main.en.md`, `onboarding.en.md` | English |
| Web UI strings in `src/web/ui/i18n.js` | German **and** English — add both keys |
| HTML fallback copy in `src/web/ui/dashboard.html` | German (shown until `/api/settings` arrives) |
| `CHANGELOG.md` | English for new entries; existing German entries stay as written |

A new UI string is not finished until it exists in both `I18N.de` and `I18N.en`. A prompt
behaviour change is not finished until `main.md` and `main.en.md` (or the onboarding pair)
say the same thing.

## Before you finish a task

Run these. From `ha-claw/`:

```bash
npm run verify:bundle
npm run check
npm run lint
npm run format
npm test
```

From the repository root:

```bash
node scripts/check-docs.mjs
```

Then ask yourself:

1. Did I walk the [documentation map](#documentation-map) for everything I changed?
2. Is there a `## Unreleased` entry in `ha-claw/CHANGELOG.md` for anything user-visible?
3. Did I claim to have verified behaviour I only type-checked?
4. Did I edit `dashboard.ts` by accident?
5. Does anything I wrote reference a file, option or tool that does not exist?

## Common tasks

**Adding a tool** — register it in `ha-claw/src/tools/`, set `dangerous` and `complexity`
honestly, then add it to [`docs/tools.md`](docs/tools.md). `{{TOOL_LIST}}` picks it up
automatically. If it can change the state of a home, update
[`docs/security.md`](docs/security.md).

**Adding a config option** — six places, listed in
[`docs/development.md`](docs/development.md#adding-a-config-option). Missing the
`translations/` entries leaves users looking at a raw snake_case key.

**Changing the dashboard** — edit `src/web/ui/`, run `npm run bundle`, commit both the source
and the regenerated `dashboard.ts`.

**Investigating a bug** — `docs/development.md` has a symptom-to-endpoint table. Reach for
`GET /api/tools/details` when the agent picks the wrong tool, and Status → Actions when it
claims an action succeeded.

**Cutting a release** — follow [`docs/releasing.md`](docs/releasing.md) exactly. Step 6, the
documentation walk-through, is the one that gets skipped.

## Environment

Developed on **Windows with PowerShell**.

- `&&` is not a valid statement separator in Windows PowerShell 5.1. Use `;` or separate
  commands.
- Paths in this repository contain spaces. Quote them.
- `ha-claw/src/web/dashboard.ts` is pinned to LF in `.gitattributes`. Do not override it — a
  CRLF checkout makes the next bundle run rewrite 4,400 lines.
- npm commands run from `ha-claw/`, not from the repository root. `scripts/check-docs.mjs`
  runs from the root.
- Prefer file and search tools over `cat`, `grep`, `sed` and `ls` in the shell.
