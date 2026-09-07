# Roadmap and Product Direction

Current version: **1.3.0**. Last reviewed: 2026-09-08.

This document answers three questions: what HA-Claw is for, what gap it fills next to Home
Assistant's own capabilities, and what gets built next. It is opinionated on purpose — a
roadmap that lists every possible feature is not a roadmap.

- [What HA-Claw is for](#what-ha-claw-is-for)
- [Where it fits](#where-it-fits)
- [Where the effort goes](#where-the-effort-goes)
- [Now — first hour and discovery](#now--first-hour-and-discovery)
- [Caretaker depth](#caretaker-depth)
- [v1.0.0 — Trust and hardening](#v100--trust-and-hardening)
- [v1.1 / v1.2 — shipped](#v11--v12--shipped)
- [v1.3 — shipped](#v13--shipped)
- [Exploratory](#exploratory)
- [Deliberately not doing](#deliberately-not-doing)
- [Decided questions](#decided-questions)
- [How this document is maintained](#how-this-document-is-maintained)

## What HA-Claw is for

Home Assistant is excellent at *executing*. It is not designed to *look after itself*.

A Home Assistant installation that is three years old has accumulated things nobody is
tracking. Entities left behind by hardware that went in the bin. Automations that broke
silently when an entity was renamed. Sensors that stopped reporting in March and nobody
noticed. Batteries at 8 %. A backup that has not run since the last update. Motion sensors in
every room and no motion-light automation, because setting one up was on a list somewhere. A
naming scheme that was consistent for the first forty entities.

None of that is a Home Assistant bug. It is entropy, and every hobbyist installation has it.
There is no tool that reads the whole system, notices the drift, explains what it costs you,
and offers to fix it.

**That is what HA-Claw is for: an assistant that maintains and improves your Home Assistant
installation, rather than one that only operates your lights.**

Chat is how you reach it. What it does between your questions is what makes it worth
installing.

## Where it fits

Home Assistant already has excellent built-in voice control. Assist works with local models,
runs on dedicated hardware, and for "turn on the kitchen light" it is faster, cheaper and more
private than anything an add-on can offer. HA-Claw is not an attempt to replace it. If direct
device control is all you are after, Assist is the better answer and you should use it.

The gap is the slow drift. Repairs reports what an integration explicitly raised; nothing
looks at the installation as a whole and says *"these four automations reference an entity you
renamed in March"* or *"you have motion sensors in every room and no motion-light automation"*.
That gap is real, and it widens as an installation ages.

The add-on shape happens to suit that work. A conversation agent lives inside Home Assistant
and is invoked per utterance, so it cannot easily hold state or act on its own. HA-Claw is a
long-running process with its own storage, scheduler and outbound channel. It can run an
analysis at 3 a.m., remember what it found last week, notice that it got worse, and message
you about it.

## Where the effort goes

Everything on this roadmap either extends that caretaking capability or builds the trust
required to let it run.

**Actively developed** — two tracks. Discovery still matters: screenshots of Status / Care /
the weekly digest, a Home Assistant community thread, and pre-built images so install does
not compile TypeScript on a Raspberry Pi. In parallel, **caretaker depth**: coverage and
health should read what the installation actually does, not guess from names. The first
cut is a shared automation-config index so Care stops inventing gaps. Analysis diet, two
new coverage kinds, an automation-quality linter and a few health-trend cards follow.
Lifestyle recipes (buy hardware, install a print server) stay out.

**Maintained rather than expanded** — the caretaking stack that shipped in 1.0–1.3
(health, Care, safe writes, tasks, weekly digest), plus conversational device control, the
chat dashboard and the Telegram bot. They work, bugs get fixed, and pull requests improving
them are welcome. Assist already covers "turn on the light"; a second implementation of it
would help nobody.

**The bottleneck is discovery, not capability.** Trust work through [v1.0.0](#v100--trust-and-hardening)
and [v1.2.0](../ha-claw/CHANGELOG.md#120) was the previous bottleneck; that cut shipped.
A new visitor should understand this is a caretaker, not a second Assist.
[Now](#now--first-hour-and-discovery) is that gap. [Exploratory](#exploratory) stays parked.

---

## Now — first hour and discovery

Capability through [v1.3.0](../ha-claw/CHANGELOG.md#130) is enough to be useful. The next
problems are not missing analysis modules.

1. **Visitors need to see the product.** The add-on store blurb used to say "Local
   AI-powered Smart Home Assistant". That was wrong on local and wrong on the product.
   Copy on the GitHub landing page, the add-on description, GitHub About and the
   dashboard welcome now state the caretaker job. Screenshots of Status, Care and the
   weekly digest are still missing.

2. **Install still compiles on the user's machine.** There is no `image:` key, so a
   Raspberry Pi builds TypeScript on first install.

3. **There is not yet a community.home-assistant.io thread.** Directory listings are not
   that channel. One Share-your-Projects post is the next distribution step.

Do these before any item under [Exploratory](#exploratory). Local models are the one
exploratory item that is also an install question; start them after that forum thread
has replies. [Caretaker depth](#caretaker-depth) is a separate technical track — it
deepens the existing Care/health surfaces, it does not add a new product.

## Caretaker depth

Problem: coverage and the hourly analysis guessed from automation *names* and from
snapshots ("lights on at 14:00"). That invents gaps and hides real ones. Health already
walked UI configs for broken references.

1. **Shared automation index** — one walk of UI automation/script configs, cached for an
   hour, reset on each full health run. Coverage of the three existing kinds
   (`motion_light`, `cover_sun`, `leak_notify`) uses entity refs, sun triggers and notify
   services. Shipped under [Unreleased](../ha-claw/CHANGELOG.md#unreleased).
2. **Analysis diet** — stop writing hardware-absence and snapshot findings to the backlog.
   The hourly job seeds at most three tasks from Care reports. Shipped under
   [Unreleased](../ha-claw/CHANGELOG.md#unreleased).
3. **Two new coverage kinds** on existing inventory only: window+climate pause, presence+
   climate away-setback. Each gap carries named entities and an action sketch. Shipped
   under [Unreleased](../ha-claw/CHANGELOG.md#unreleased).
4. **Automation-quality linter** on Care: `device_id` triggers, `mode: single` on motion
   lights, numeric comparisons written as templates. Shipped under
   [Unreleased](../ha-claw/CHANGELOG.md#unreleased).
5. **Health trends** — ring of the last 24 hourly readings; cards for energy sensors
   missing `state_class`, updates stuck `on` for 14 days, clustered outages per
   integration. Shipped under
   [Unreleased](../ha-claw/CHANGELOG.md#unreleased).

Out of scope here: buy-this-hardware recipes, print servers, one-click automation writes.

Shipped earlier and recorded in the changelog, not here: health cards and the Status
screen ([v0.9.6](../ha-claw/CHANGELOG.md#096)–[v0.10.0](../ha-claw/CHANGELOG.md#0100)),
the trust cut ([v1.0.0](../ha-claw/CHANGELOG.md#100)), safe writes and Care
([v1.2.0](../ha-claw/CHANGELOG.md#120)), language, notifications, export and pagination
([v1.3.0](../ha-claw/CHANGELOG.md#130)).

## v1.0.0 — Trust and hardening

Shipped in [v1.0.0](../ha-claw/CHANGELOG.md#100): a test suite where a bug is expensive, a
pinned non-root image with HEALTHCHECK / watchdog / AppArmor, serialised writes, scheduler
overlap protection, graceful shutdown, tool-argument validation and the Ingress source-IP
allowlist.

## v1.1 / v1.2 — shipped

Shipped together in [v1.2.0](../ha-claw/CHANGELOG.md#120): YAML diff and blast radius before
a config write, snapshot revert, task dry-run, orphan one-click remove, Status → Pflege
(coverage, naming, energy), weekly digest, blueprint guidance.

Config validation is structural (required keys, known fields, valid `mode`). Home Assistant
`check_config` is not used — that call inspects YAML files on disk, not a pending UI
automation. Do not reopen "run check_config before save" without a new HA API that can
validate a UI config that has not been written yet.

## v1.3 — shipped

Shipped in [v1.3.0](../ha-claw/CHANGELOG.md#130): German and English system prompts and Web
UI keyed off the Home Assistant locale (with an `en` / `de` override), a Settings
notification matrix (Telegram, Chat, HA notify, `persistent_notification`), JSON data
export, and chat history pagination (last 30 on screen, 100 on disk).

## Exploratory

Not scheduled. Listed so they are not rediscovered as new ideas.

- **Vision.** Camera images through a vision model: read a meter, check whether the front door
  is actually shut, verify the garage is empty. Genuinely useful and genuinely expensive per
  call. Needs `ha_get_camera_image` and a per-call cost guard.
- **MCP.** Home Assistant ships an MCP server, and MCP is becoming the interop standard.
  Consuming it would reduce bespoke tool code; exposing HA-Claw's own tools over MCP would let
  other agents use them. Neither is urgent, both are directionally right.
- **Local models for tier 1.** Routing cheap state queries to Ollama would cut cost and keep
  routine traffic in the house. Tool-calling quality on small local models is the open
  question. Start this after the community forum thread has replies.
- **Multi-user.** Whitelisted Telegram users are all-or-nothing today. Per-user permissions
  only matter once households actually share an installation.
- **Memory vector search.** Worth doing at roughly 1,000 cards. Realistic counts are dozens.
  Keyword search matches whole tokens in title, tags and content and ranks those hits; it
  does not do stemming or compound matching.
- **HA state cache with a short TTL.** `tool-cache.ts` exists. Fix its invalidation, then
  measure whether repeated reads inside one loop are actually a problem.

## Deliberately not doing

Saying no is the useful half of a roadmap.

| Not doing | Why |
| --- | --- |
| **Local wake word, STT and TTS** | Home Assistant Voice does this properly, with hardware built for it. A parallel stack would duplicate work that is already done better. |
| **Exposing HA-Claw as a conversation agent** | An add-on cannot register one. A companion integration that forwards Assist into the HTTP API would be a second codebase for a maintenance agent people read more than they talk to. Assist stays the voice interface; HA-Claw stays the sidebar and Telegram. |
| **Generating a Lovelace dashboard** | The sidebar panel is enough, and dashboards are something Home Assistant users generally prefer to build themselves. |
| **Supporting every LLM provider directly** | OpenRouter is the abstraction. One integration, every model. |
| **Cloud sync, accounts, hosted anything** | The whole point is that it runs on your hardware. |
| **A plugin or skill marketplace** | Interesting at ten times the current user base. Maintenance burden today. |

## Decided questions

Decided 2026-09-06. Left here so they are not reopened as new ideas. Further input:
[Discussions](https://github.com/unpaved028/ha-claw/discussions) or
[Issues](https://github.com/unpaved028/ha-claw/issues).

1. **The conversation is not the primary interface.** Status, Care and the weekly digest
   are. Chat is how you ask why a card is red and how you approve work. The default tab
   stays Chat only because onboarding is a conversation; after that, the docs send people
   to Status.
2. **Two approvals stay for config writes.** Naming apply and orphan remove stay one-click.
   Zero-approval automations are out: trust is still the reason someone would let this
   rewrite YAML, and undo is not a substitute for reading the diff.
3. **Telegram is optional outbound, not the long-term channel.** [v1.3.0](../ha-claw/CHANGELOG.md#130)
   shipped HA `notify` and `persistent_notification`. No further Telegram features. Bugs
   in the existing bot still get fixed.

## How this document is maintained

Reviewed at every minor release, not continuously.

- A shipped item is **removed**, not ticked and left in place — that is what
  [`CHANGELOG.md`](../ha-claw/CHANGELOG.md) is for. The exception is when knowing it once was
  open prevents someone reproposing it, in which case a one-line strikethrough entry stays.
- A deferred item moves to [Exploratory](#exploratory) or
  [Deliberately not doing](#deliberately-not-doing) **with the reason**. An item that silently
  disappears will be reproposed within six months.
- The "Last reviewed" date at the top gets updated whenever this file is touched.
- New items state the *problem*, not the solution. "Users cannot tell which automations broke
  when they renamed an entity" outlives whatever we build to fix it.
