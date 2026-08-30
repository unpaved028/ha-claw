# Roadmap and Product Direction

Current version: **0.9.7**. Last reviewed: 2026-08-30.

This document answers three questions: what HA-Claw is for, what gap it fills next to Home
Assistant's own capabilities, and what gets built next. It is opinionated on purpose — a
roadmap that lists every possible feature is not a roadmap.

- [What HA-Claw is for](#what-ha-claw-is-for)
- [Where it fits](#where-it-fits)
- [Where the effort goes](#where-the-effort-goes)
- [Now — 0.9.x](#now--09x)
- [v1.0.0 — Trust and hardening](#v100--trust-and-hardening)
- [v1.1 — Safe change management](#v11--safe-change-management)
- [v1.2 — The maintenance layer](#v12--the-maintenance-layer)
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
only useful if you are willing to let it — and today no automated test covers the code that
decides whether an action needs your approval. That is why [v1.0.0](#v100--trust-and-hardening)
contains no features at all.

---

## Now — 0.9.x

The leftover correctness items (tool timeouts, backlog retry cap, cache invalidation,
retryable LLM errors only, clamped `limit`, escaped area names, full action-log lookup,
honest token-cost label) shipped in [v0.9.6](../ha-claw/CHANGELOG.md#096).
Next scheduled work is [v1.0.0](#v100--trust-and-hardening).

## v1.0.0 — Trust and hardening

**No features.** The version number is a claim about reliability, and right now the project
cannot back it. Everything here removes a reason not to trust the agent with your home.

### Tests

There are none. Optimise for where a bug is expensive, not for coverage:

- [ ] **Safety policy table test** — domain × service × `device_class` against expected
      "needs confirmation: yes/no". *This is the most important test in the project.* It nails
      down the allowlist, the `cover` and `scene` exceptions, and the `entity_id` prefix check.
      Without it, a refactor can silently reopen the `script.turn_on` bypass that was closed in
      v0.9.2.
- [ ] **Schedule parsing** — every accepted format, plus DST transitions and the
      today-or-tomorrow boundary of `once HH:MM`.
- [ ] **Context pruning** — the budget is respected and `tool_calls` stay paired with their
      results. An orphaned tool result is a hard API error, not a degraded answer.
- [ ] **Entity cache compression** — grouping at three or more, and area names containing
      regex metacharacters.
- [ ] **Storage atomicity** — concurrent `upsert` on the same record loses nothing.

### Container

- [ ] Pin the base image by digest. `node:22-alpine` is a floating tag; the same commit does
      not produce the same image twice.
- [ ] Run as non-root (`USER node`, with `/data` ownership handled).
- [ ] Add `HEALTHCHECK` against the existing `/health` endpoint, and a Supervisor `watchdog`.
- [ ] Drop `VOLUME /data` — the Supervisor mounts it already.
- [ ] Ship an `apparmor.txt` profile. It constrains the container and raises the add-on's
      security rating.

### Correctness

- [ ] **Serialise writes.** `learning.ts` and `scheduler.ts` write without temp-and-rename, so
      a crash mid-write costs the whole file. Every monolithic JSON is read-modify-write
      without a lock, so concurrent Web and Telegram requests overwrite each other. One
      single-flight mutex per path, one shared atomic-write helper with unique temp names.
- [ ] **Prevent scheduler overlap.** `nextRunAt` is advanced *after* the executor returns, so a
      job running longer than the tick interval fires twice — double LLM cost, double action,
      double notification. Advance before, and track a per-job running flag. Also jitter
      overdue jobs when the circuit breaker closes instead of releasing them all at once.
- [ ] **Shut down cleanly.** `index.ts` calls `process.exit(0)` without awaiting
      `app.close()`, cutting off in-flight requests, and never clears the cache-refresh or
      analysis intervals.
- [ ] **Validate tool arguments.** The JSON Schema on each tool is documentation only; the
      handler receives whatever the model produced. A type and required-field check before the
      handler runs.
- [ ] **Reject non-Ingress source addresses.** Home Assistant asks add-on servers to accept
      only `172.30.32.2`. HA-Claw relies on the port not being published, which is true but is
      not the same thing.

## v1.1 — Safe change management

The differentiator is that HA-Claw can *change* your installation. Today
`ha_save_automation_config` overwrites an automation after a yes/no prompt that shows raw
JSON. That is not enough to earn the permission it asks for.

- [ ] **Diff before write.** Show a YAML diff of the automation as it is versus as it would
      be. Confirming a diff is a decision; confirming a blob is a coin flip.
- [ ] **Snapshot and one-click revert.** Store the previous configuration with every write, and
      offer "revert this change" in the action log. Rollback already exists for service calls;
      configuration writes need the same.
- [ ] **Validate before saving.** Run the generated YAML through Home Assistant's config check
      and refuse to write if it fails. Never leave the user with a broken automation because
      the model produced plausible-looking nonsense.
- [ ] **Explain the blast radius.** Before rewriting an automation, list what else references
      the entities involved. Renaming or restructuring is where an AI assistant does the most
      damage, and the `safe-refactoring.md` knowledge already describes how to avoid it — it is
      just advice to the model, not an enforced step.
- [ ] **Preview mode for tasks.** Let a task be executed in a mode that reports what it *would*
      do without doing it.

## v1.2 — The maintenance layer

Where the project is heading. Each item is a question a Home Assistant user cannot answer
today without manual work.

- [ ] **Orphan cleanup.** System Health already lists devices `unavailable` for 30 days.
      Offering a one-click remove from that card is still open.
- [ ] **Automation coverage report.** Rooms with motion sensors and no light automation. Covers
      with no sun automation. Leak sensors with no notification. The analysis modules already
      find some of these; make it a coherent report rather than three tasks in a backlog.
- [ ] **Naming and structure hygiene** with bulk proposals. Not "12 entities lack a friendly
      name" but "here are the 12, here are the names I suggest, approve all or edit".
- [ ] **Periodic home review.** A weekly digest: what changed, what degraded, what improved,
      what is worth doing next. One message with substance beats a backlog that fills up.
- [ ] **Energy attribution.** Which devices actually cost you money, using the existing power
      sensors. The standby-waste check hints at this; it deserves to be a real capability.
- [ ] **Blueprint awareness.** When proposing an automation that a well-known blueprint already
      solves, suggest the blueprint instead of generating bespoke YAML.

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
