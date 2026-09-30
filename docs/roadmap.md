# Roadmap and Product Direction

Current version: **1.4.0**. Last reviewed: 2026-09-29.

This document answers three questions: what HA-Claw is for, what gap it fills next to Home
Assistant's own capabilities, and what gets built next. It is opinionated on purpose — a
roadmap that lists every possible feature is not a roadmap.

- [What HA-Claw is for](#what-ha-claw-is-for)
- [Where it fits](#where-it-fits)
- [Where the effort goes](#where-the-effort-goes)
- [Next — discovery](#next--discovery)
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

What it does between your questions is what makes it worth installing. Chat is one way to
reach it, and it should be an optional one.

## Where it fits

Home Assistant already has excellent built-in voice control. Assist works with local models,
runs on dedicated hardware, and for "turn on the kitchen light" it is faster, cheaper and more
private than anything an add-on can offer. HA-Claw is not an attempt to replace it. If direct
device control is all you are after, Assist is the better answer and you should use it.

The gap is the slow drift. Repairs reports what an integration explicitly raised. Community
integrations cover single slices: Spook and Watchman report references to entities that no
longer exist, Battery Notes tracks batteries. Nothing looks at the installation as a whole
and says *"these four automations reference an entity you renamed in March"* next to *"you
have motion sensors in every room and no motion-light automation"* — and then offers a fix
you can read before it is applied. That gap is real, and it widens as an installation ages.

A visitor who already runs Spook will ask what this adds. The answer has to fit in one
paragraph: one Status view across health, coverage and naming; a weekly digest that reports
only what got worse; fixes that go through a diff and an approval.

The add-on shape happens to suit that work. A conversation agent lives inside Home Assistant
and is invoked per utterance, so it cannot easily hold state or act on its own. HA-Claw is a
long-running process with its own storage, scheduler and outbound channel. It can run an
analysis at 3 a.m., remember what it found last week, notice that it got worse, and message
you about it.

## Where the effort goes

Trust, a model-optional core, and the caretaker-depth items that were wrong in code are in
[Unreleased](../ha-claw/CHANGELOG.md#unreleased). What is left is discovery, and it leaves
this repository: screenshots of a running install, pre-built images, a forum thread.

**Why discovery is next.** Nobody outside the maintainer's own installation has reported
using HA-Claw yet. A reader can now be told that Status, Care and the digest start without
a key, that chat is what costs money, and that a guarded action in chat waits for a person.
A first impression spent before those answers were true would not have come back.

**Maintained rather than expanded** — health, Care, safe writes, tasks, the weekly digest,
conversational device control, the chat dashboard and the Telegram bot. Bugs get fixed and
pull requests improving them are welcome. Assist already covers "turn on the light"; a second
implementation of it would help nobody.

---

## Next — discovery

1. **Visitors cannot see the product.** Screenshots of Status, Care and the weekly digest are
   missing. The copy already states the caretaker job. They have to come from a running
   installation.
2. **Install still compiles on the user's machine.** There is no `image:` key, so a Raspberry
   Pi builds TypeScript on first install. Pre-built multi-arch images fix that. Publishing
   them needs registry credentials that are not in this repository.
3. **There is no community.home-assistant.io thread.** One Share-your-Projects post, in
   English, is the next distribution step. German-language communities are a second channel,
   not a replacement.

## Exploratory

Not scheduled. Listed so they are not rediscovered as new ideas.

- **Vision.** Camera images through a vision model: read a meter, check whether the front door
  is actually shut, verify the garage is empty. Genuinely useful and genuinely expensive per
  call. Needs `ha_get_camera_image` and a per-call cost guard.
- **MCP.** Home Assistant ships an MCP server, and MCP is becoming the interop standard.
  Exposing HA-Claw's findings over MCP is the more valuable half: any assistant a user already
  runs could ask what is wrong with the house. Consuming Home Assistant's server would reduce
  bespoke tool code. Neither is urgent.
- **Local models for tier 1.** With the core running without a model, this is about the cost
  of chat, not about install. Tool-calling quality on small local models is the open question.
  Start after the community forum thread has replies.
- **Add-on or integration.** Add-ons need the Supervisor, so Home Assistant Container
  installations cannot run HA-Claw at all. A custom integration could raise native Repairs
  issues. A second codebase is not justified before there are users; revisit when Container
  users ask.
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
| **Coverage from automation names; buy-this-hardware Care cards** | Name matching invented gaps and hid real ones until v1.4.0 replaced it with config references. Shopping and install recipes are not maintenance. |
| **Running `check_config` before a UI config save** | It inspects YAML files on disk, not a pending UI automation. Validation stays structural until Home Assistant offers an API that validates an unwritten UI config. |

## Decided questions

Decided 2026-09-06 unless dated otherwise. Left here so they are not reopened as new ideas.
Further input: [Discussions](https://github.com/unpaved028/ha-claw/discussions) or
[Issues](https://github.com/unpaved028/ha-claw/issues).

1. **The conversation is not the primary interface.** Status, Care and the weekly digest
   are. Chat is how you ask why a card is red and how you approve work. Revised 2026-09-27:
   Status is the default tab. The earlier reason for keeping Chat — onboarding is a
   conversation — did not hold. The Web UI and Telegram both open on Status and the choice
   of notification channel. Neither starts a personality interview.
2. **Two approvals stay for config writes.** Naming apply and orphan remove stay one-click.
   Zero-approval automations are out: trust is still the reason someone would let this
   rewrite YAML, and undo is not a substitute for reading the diff. The three paths that
   bypassed this in 1.4.0 are closed; see [Unreleased](../ha-claw/CHANGELOG.md#unreleased).
3. **Telegram is optional outbound, not the long-term channel.** [v1.3.0](../ha-claw/CHANGELOG.md#130)
   shipped HA `notify` and `persistent_notification`. No further Telegram features. Bugs
   in the existing bot still get fixed.
4. **The caretaker core runs without a model** (2026-09-27). Status, Care, the weekly digest
   and notifications need no API key; a key adds chat and task solutions. The core is already
   deterministic, and requiring a cloud account for it is the largest barrier for a community
   that prefers local.
5. **International audience, two languages** (2026-09-27). English leads for documentation and
   discovery. German stays a complete second language across the UI, the prompts and the
   manual. Nothing shipped may assume one country, one time zone or one house.

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
