# Releasing

HA-Claw is distributed as a Home Assistant add-on repository. A release is a commit on `main`
with a matching tag — the Supervisor reads `config.yaml` from the default branch, so pushing
is publishing. There is no staging environment.

- [Versioning](#versioning)
- [Checklist](#checklist)
- [What CI enforces](#what-ci-enforces)
- [Writing the changelog entry](#writing-the-changelog-entry)
- [After the release](#after-the-release)

## Versioning

Semantic-ish, pre-1.0:

| Bump | When |
| --- | --- |
| **Patch** (`0.9.5` → `0.9.6`) | Bug fixes, documentation, dependency updates |
| **Minor** (`0.9.5` → `0.10.0`) | New features, new options, behaviour changes users will notice |
| **Major** | Reserved for `1.0.0` — see the [roadmap](roadmap.md#v100--trust-and-hardening) |

The version appears in exactly three places, and CI fails if they disagree:

1. `ha-claw/package.json` → `version`
2. `ha-claw/config.yaml` → `version`
3. `ha-claw/CHANGELOG.md` → the topmost version heading. A leading `## Unreleased` section is
   skipped by the check, so pending entries can accumulate between releases.

Everywhere else it is read at runtime from `package.json`. Do not hardcode it.

## Checklist

Run from `ha-claw/` unless stated otherwise.

**1. Confirm the tree is clean and current**

```bash
git switch main
git pull
git status
```

**2. Bump the version** in `package.json` and `config.yaml`.

**3. Turn `## Unreleased` into the new version heading** in `CHANGELOG.md`, keeping the
`### Added` / `### Changed` / `### Fixed` / `### Security` grouping.

**4. Update the version badge** in `README.md` and `README.de.md`.

**5. Regenerate and verify**

```bash
npm run bundle
npm run verify:bundle
npm run check
npm run lint
npm run format
```

```bash
cd ..
node scripts/check-docs.mjs
```

**6. Check the documentation actually matches** what shipped. Walk the
[documentation map](../AGENTS.md#documentation-map) for every change in this release. This is
the step that gets skipped, and it is the reason the v0.9.3 plan needed a whole phase called
"establish truth".

**7. Build the image once locally** if the release touched dependencies, the Dockerfile or
the build pipeline:

```bash
cd ha-claw
docker build -t ha-claw:local .
```

**8. Commit, tag and push**

```bash
git add .
git commit -m "chore: release v0.9.6"
git tag v0.9.6
git push origin main
git push origin --tags
```

**9. Create the GitHub release**

```bash
gh release create v0.9.6 --title "v0.9.6" --notes-file <(...)
```

Use the CHANGELOG section as the release notes rather than `--generate-notes`; the curated
text is better than a list of commit subjects.

## What CI enforces

Four jobs on every push and pull request
([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

| Job | Checks |
| --- | --- |
| **Types, lint, format** | `verify:bundle`, `tsc --noEmit`, ESLint, Prettier |
| **Documentation links** | Every relative Markdown link and heading anchor resolves |
| **Docker build** | The add-on image builds |
| **Version consistency** | `package.json` = `config.yaml` = newest CHANGELOG heading; model list in `config.yaml` = `src/core/models.ts` |

CI does not verify behaviour. There is no test suite yet — the highest-value one, a table
test over the safety policy, is the first item on the
[v1.0.0 roadmap](roadmap.md#v100--trust-and-hardening). Until then, manual verification before
tagging is the only safety net.

## Writing the changelog entry

The changelog is read by users deciding whether to click Update, and by you in six months
trying to remember why something changed.

- **Lead with the symptom, not the patch.** "Telegram buttons did nothing" tells someone
  whether it affected them; "fixed middleware chain" does not.
- **Say what caused it** when the cause is instructive. The good entries in this changelog do
  exactly that, and they are why the history is still useful.
- **Group under `### Added` / `### Changed` / `### Fixed` / `### Security`.**
- **New entries in English.** Entries from v0.6 to v0.9.5 are largely German and stay as
  written — rewriting shipped release notes destroys the record without helping anyone.
- **Nothing user-invisible.** Refactors that change no behaviour do not belong here.

## After the release

1. Install the update on a real Home Assistant and open the dashboard. The Supervisor builds
   the image on the user's machine, so a broken Dockerfile only shows up here.
2. Send one message through the Web UI and one through Telegram.
3. Check Status → System Health renders.
4. If it is broken, ship a patch release. Do not force-push or move a tag that users may
   already have pulled.
