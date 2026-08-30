<!--
Thanks for contributing. Keep the change focused; separate refactors from behaviour changes.
Do not bump the version here — releases are cut separately (docs/releasing.md).
-->

## What this changes

<!-- One or two sentences. What behaviour is different after this PR? -->

Closes #

## Why

<!-- The problem this solves. Link the issue or discussion if there is one. -->

## How it was tested

<!--
There is no automated test suite yet, so this section is the review. Be specific:
which message did you send, against which Home Assistant, and what did you observe?
-->

- [ ] Ran locally with `npm run dev` against a real Home Assistant
- [ ] Verified in the Web UI
- [ ] Verified in Telegram
- [ ] Not applicable (docs / tooling only)

## Checks

- [ ] `npm run check` passes (`ha-claw/`)
- [ ] `npm run lint` passes
- [ ] `npm run format` passes
- [ ] `npm run verify:bundle` passes — I edited `src/web/ui/`, never `src/web/dashboard.ts` directly
- [ ] `node scripts/check-docs.mjs` passes (repository root)

## Documentation

<!-- See the documentation map in AGENTS.md. Tick what applies, or state why none apply. -->

- [ ] `ha-claw/CHANGELOG.md` updated under `## Unreleased`
- [ ] `docs/` updated (tools, API, configuration, architecture or security)
- [ ] `ha-claw/DOCS.md` **and** `ha-claw/DOCS.de.md` updated (user-visible change)
- [ ] `config.yaml` schema **and** `translations/en.yaml` + `translations/de.yaml` updated (new option)
- [ ] No documentation change needed, because:

## Safety impact

<!--
Required if you touched src/tools/ha-tools.ts, the confirmation flow, or the whitelist.
State explicitly what this now allows that was previously blocked, or write "none".
-->

none
