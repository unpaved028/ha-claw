# Roadmap and Product Direction

Current version: **1.2.0**. Last reviewed: 2026-09-01.

This document answers three questions: what HA-Claw is for, what gap it fills next to Home
Assistant's own capabilities, and what gets built next. It is opinionated on purpose — a
roadmap that lists every possible feature is not a roadmap.

- [What HA-Claw is for](#what-ha-claw-is-for)
- [Where it fits](#where-it-fits)
- [Where the effort goes](#where-the-effort-goes)
- [Now — 0.9.x](#now--09x)
- [v1.0.0 — Trust and hardening](#v100--trust-and-hardening)
- [v1.1 / v1.2 — shipped](#v11--v12--shipped)
- [v1.3 — Reach](#v13--reach)
- [Exploratory](#exploratory)
- [Deliberately not doing](#deliberately-not-doing)
- [Open questions](#open-questions)
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

**Actively developed** — proactive analysis, system health, the task approval workflow, and
safe authoring and refactoring of automations. These are the parts that do work you would
otherwise never get around to.

**Maintained rather than expanded** — conversational device control, the chat dashboard and
the Telegram bot. They work, bugs get fixed, and pull requests improving them are welcome.
They are simply not where new capability is planned, because Assist covers that ground well
and a second implementation of it would help nobody.

**The bottleneck is trust, not capability.** An assistant that can rewrite your automations is
only useful if you are willing to let it. The safety-policy table test pins the allowlist;
[v1.0.0](#v100--trust-and-hardening) shipped the rest of that trust work.
[v1.2.0](../ha-claw/CHANGELOG.md#120) shipped safe config writes and the maintenance
layer. Product work resumes at [v1.3](#v13--reach).

---

## Now — 0.9.x

The leftover correctness items shipped in [v0.9.6](../ha-claw/CHANGELOG.md#096). Health
cards shipped in [v0.9.7](../ha-claw/CHANGELOG.md#097). The rest of that screen — sort
by severity, expandable explanations, last-seen trend, deep links into Home Assistant,
stopped add-ons, recorder, restored-only entities, disabled-entity count, failed scripts,
and a YAML coverage note on broken references — shipped in
[v0.10.0](../ha-claw/CHANGELOG.md#0100). The trust cut shipped in
[v1.0.0](../ha-claw/CHANGELOG.md#100). Safe writes and the maintenance layer shipped in
[v1.2.0](../ha-claw/CHANGELOG.md#120). Next is [v1.3](#v13--reach).

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

## v1.3 — Reach

Currently HA-Claw is reachable from its own sidebar panel and from Telegram, and speaks German
only. Both limit who can use it.

- [ ] **Multi-language system prompt.** `agents/main.md` is German. That is a hard barrier for
      most of the Home Assistant community. Extract the language-dependent parts, ship English
      first, and pick the language from the Home Assistant locale.
- [ ] **English Web UI**, same reasoning.
- [ ] **Home Assistant notifications** as a channel alongside Telegram, via `notify` services.
      Telegram should be an option, not a prerequisite for proactive messages.
- [ ] **Expose HA-Claw as a conversation agent.** An add-on cannot register one directly; a
      thin companion integration could forward Assist conversations to the add-on's HTTP API.
      That makes HA-Claw reachable from voice hardware and the Assist dialog without building
      a parallel voice stack. Evaluate whether the complexity is worth it — the answer depends
      on whether people want to *talk* to a maintenance agent or *read* it.
- [ ] **Data export.** Conversations, memory, tasks and the action log as JSON. It is your
      data.
- [ ] **Chat history pagination.** Load the last 30 messages with a "load more" button.

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
  question.
- **Multi-user.** Whitelisted Telegram users are all-or-nothing today. Per-user permissions
  only matter once households actually share an installation.
- **Memory vector search.** Worth doing at roughly 1,000 cards. Realistic counts are dozens.
  The current keyword search has cheaper, more concrete defects: substring matching means
  `art` matches `start`, and the score threshold in `searchCards` (0.5) contradicts the one in
  `agentic-loop.ts` (0.1), making the second one dead code. Fix those first.
- **HA state cache with a short TTL.** `tool-cache.ts` exists. Fix its invalidation, then
  measure whether repeated reads inside one loop are actually a problem.

## Deliberately not doing

Saying no is the useful half of a roadmap.

| Not doing | Why |
| --- | --- |
| **Local wake word, STT and TTS** | Home Assistant Voice does this properly, with hardware built for it. A parallel stack would duplicate work that is already done better. |
| **Replacing Assist as the voice interface** | An add-on cannot be invoked per utterance the way a conversation agent can. Bridging *to* Assist is the sensible path; competing with it is not. |
| **Generating a Lovelace dashboard** | The sidebar panel is enough, and dashboards are something Home Assistant users generally prefer to build themselves. |
| **Supporting every LLM provider directly** | OpenRouter is the abstraction. One integration, every model. |
| **Cloud sync, accounts, hosted anything** | The whole point is that it runs on your hardware. |
| **A plugin or skill marketplace** | Interesting at ten times the current user base. Maintenance burden today. |

## Open questions

Genuinely undecided. Input welcome in
[Discussions](https://github.com/unpaved028/ha-claw/discussions).

1. **Should the conversation stay the primary interface?** If the value is maintenance, the
   primary surface might be a report you read weekly, with chat as the way to ask follow-up
   questions. That is a different product shape.
2. **How autonomous should it be allowed to be?** The task workflow currently requires two
   approvals. For low-risk fixes — adding a friendly name, enabling an automation that was
   accidentally disabled — is one approval enough? Is zero, with a good undo?
3. **Is Telegram the right channel long term?** It works and it reaches you outside the house,
   but it is a dependency on a third party for something Home Assistant can do natively.

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
