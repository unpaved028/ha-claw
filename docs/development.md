# Development

Everything you need to run HA-Claw outside the add-on container. For the contribution
process, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

- [Requirements](#requirements)
- [Setup](#setup)
- [Running against a real Home Assistant](#running-against-a-real-home-assistant)
- [npm scripts](#npm-scripts)
- [The dashboard build pipeline](#the-dashboard-build-pipeline)
- [Editing the system prompt](#editing-the-system-prompt)
- [Adding a tool](#adding-a-tool)
- [Adding a config option](#adding-a-config-option)
- [Adding a model](#adding-a-model)
- [Debugging](#debugging)
- [Windows notes](#windows-notes)

## Requirements

- **Node.js 22 or newer** — enforced by `engines` in `package.json`.
- An **OpenRouter API key**. Set a spending limit; development loops burn tokens.
- Optionally a **Home Assistant instance** with a long-lived access token.
- Optionally **Docker**, to reproduce the CI image build.

## Setup

```bash
git clone https://github.com/unpaved028/ha-claw.git
cd ha-claw/ha-claw
npm ci
cp dev-options.json.example dev-options.json
```

Put your key into `dev-options.json`:

```jsonc
{
  "openrouter_api_key": "sk-or-v1-...",
  "openrouter_default_model": "anthropic/claude-haiku-4.5",
  "log_level": "debug"
}
```

The file is gitignored because it holds a real key. Then:

```bash
npm run dev      # tsx watch → http://localhost:3100
```

Without `/data/options.json` the add-on starts in **standalone mode**: `dataPath` becomes
`./data`, the server binds `127.0.0.1`, and the backup health check reports `n/a`. The Web UI,
storage, scheduler and LLM calls all work; the `ha_*` tools fail until you point it at a real
Home Assistant.

Local data lands in `ha-claw/data/store/`, mirroring `/data/store/` in the container. Delete
that directory to reset onboarding, memory and tasks.

## Running against a real Home Assistant

Standalone mode reads `HA_API_URL` and needs a long-lived access token from your Home
Assistant profile page.

```bash
$env:HA_API_URL = "http://homeassistant.local:8123/api"   # PowerShell
npm run dev
```

Use a throwaway or test instance if you can. You are about to let a language model call
services on it.

The alternative — and the only way to exercise Ingress, the Supervisor API and the backup
check for real — is to install the add-on from a local repository on a test Home Assistant.

## npm scripts

All run from `ha-claw/`.

| Script | Does |
| --- | --- |
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run build` | `bundle` (via `prebuild`) then `tsc` |
| `npm start` | `node dist/index.js` |
| `npm run check` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:fix` | Prettier |
| `npm test` | `node:test` suite under `test/` (safety policy, scheduler, pruning, storage) |
| `npm run bundle` | Regenerate `src/web/dashboard.ts` |
| `npm run verify:bundle` | Fail if the generated dashboard drifted |

From the repository root:

```bash
node scripts/check-docs.mjs   # every relative link in every .md resolves
```

CI runs the same set, plus `npm test`, `docker build` and two consistency checks: version
agreement between `package.json`, `config.yaml` and the newest `CHANGELOG.md` heading, and
model list agreement between `config.yaml` and `src/core/models.ts`.

## The dashboard build pipeline

**`src/web/dashboard.ts` is generated. Never edit it.**

| Source | Purpose |
| --- | --- |
| `src/web/ui/dashboard.html` | Structure and placeholders |
| `src/web/ui/style.css` | Themes and layout |
| `src/web/ui/client.js` | Chat, SSE handling, settings, tasks, health |

```bash
npm run bundle
```

Why the artefact is committed and why it exists at all is explained in
[architecture.md § Web UI build](architecture.md#web-ui-build). The short version: Ingress
rewrites URLs, so external `<link>` and `<script src>` tags cannot resolve, and the whole UI
must be inlined into one HTML response.

`dashboard.ts` is pinned to LF in `.gitattributes`. Without that, a Windows checkout gets CRLF
and the next bundle run rewrites the entire file, producing a 4,400-line phantom diff.

`dashboard.html` and `client.js` are in `.prettierignore`. Formatting them is a legitimate
change, but it should be its own commit rather than noise inside a feature diff.

## Editing the system prompt

[`ha-claw/agents/main.md`](../ha-claw/agents/main.md) is the agent's behaviour. It is written
in **German**, because it shapes what the end user reads.

Two placeholders are filled at runtime and must survive any edit:

| Placeholder | Replaced with |
| --- | --- |
| `{{TOOL_LIST}}` | Generated from the tool registry |
| `{{ENTITY_CACHE}}` | The pruned entity cache for the current request |

Do not hand-maintain a tool list in the prompt. That is exactly what drifted until v0.9.2,
when 11 registered tools were missing from it and the model did not know it could use them.

Other prompts: `onboarding.md` (setup conversation, restricted tool set), `cie.md` (deep
analysis), `KI-Systemarchitekt.md`.

## Adding a tool

1. Register it in `src/tools/ha-tools.ts` or `src/tools/builtins.ts`. Write the `description`
   for the model — it is the tool's real interface, not a comment.
2. Set `dangerous: true` if it can lock, unlock, arm, delete, or overwrite a configuration.
   When in doubt, mark it dangerous.
3. Set `complexity` — tier 2 for anything with consequences, tier 3 for generating Home
   Assistant YAML.
4. Add it to [`docs/tools.md`](tools.md) in the right section, with its flag and tier.
5. If it changes what the agent can do to a home, update [`docs/security.md`](security.md).

`{{TOOL_LIST}}` picks the tool up automatically, so `main.md` needs no change.

## Adding a config option

A new option touches six places. Missing any of them produces a half-working option:

1. `ha-claw/config.yaml` → `options:` (the default) **and** `schema:` (the validation).
2. `src/core/config.ts` → read it, including the environment-variable fallback.
3. `ha-claw/translations/en.yaml` and `de.yaml` → without these, the HA config UI shows the
   raw snake_case key.
4. [`docs/configuration.md`](configuration.md).
5. `README.md` and `README.de.md` option tables.
6. `ha-claw/DOCS.md` and `ha-claw/DOCS.de.md`.

`openai_api_key` is the cautionary tale: it was read by the code but missing from
`config.yaml` until v0.9.2, so Telegram voice transcription could not be enabled from the
add-on UI at all.

## Adding a model

`src/core/models.ts` is the single source of truth. Add it there, then mirror it into the
`openrouter_default_model` enum in `config.yaml` — YAML cannot import from TypeScript, and CI
fails if the two lists diverge. Finally update the table in
[`docs/configuration.md`](configuration.md#available-models).

## Debugging

**Set `log_level: debug`.** Tool arguments and results are logged in full. Secrets are
redacted by pattern, which is best-effort — check before pasting a log into an issue.

| Symptom | Look at |
| --- | --- |
| Agent picks the wrong tool | `GET /api/tools/details` — the descriptions the model actually sees |
| Agent cannot find a device | `POST /api/cache/refresh`, then check the entity cache; area and floor detection logs which of its three methods succeeded |
| Action reported as done but nothing moved | Status → Actions. Verification captures state before and after |
| Loop stalls | `GET /api/confirm/pending` — something is waiting for a confirmation |
| LLM calls refused | `GET /api/status/circuit-breaker` |
| Costs look wrong | `/status` in Telegram; cost is estimated from a model→price table, not billed usage |
| System Health looks stale | Last report is cached. `POST /api/system-health/refresh` or Status → Refresh |

The dashboard's Status section surfaces most of this without curl.

## Windows notes

This project is developed on Windows with PowerShell.

- `&&` is not a valid statement separator in Windows PowerShell 5.1. Use `;`, or run the
  commands separately.
- `src/web/dashboard.ts` is pinned to LF via `.gitattributes`. Do not override it.
- Paths in this repository contain spaces. Quote them.
