# HA-Claw — User Manual

_Deutsche Fassung: [DOCS.de.md](DOCS.de.md)_

- [What HA-Claw does](#what-ha-claw-does)
- [What you should know first](#what-you-should-know-first)
- [Installation](#installation)
- [Configuration options](#configuration-options)
- [Setting up Telegram](#setting-up-telegram)
- [First run](#first-run)
- [Talking to it](#talking-to-it)
- [The dashboard](#the-dashboard)
- [System health](#system-health)
- [Tasks](#tasks)
- [Reminders and schedules](#reminders-and-schedules)
- [Memory and learning](#memory-and-learning)
- [Telegram commands](#telegram-commands)
- [Safety and confirmations](#safety-and-confirmations)
- [Costs](#costs)
- [Data and backups](#data-and-backups)
- [Troubleshooting](#troubleshooting)
- [Getting help](#getting-help)

## What HA-Claw does

HA-Claw is an AI assistant that lives in your Home Assistant sidebar. You talk to it in
ordinary language and it does three kinds of thing:

**It answers questions about your home.** Not just "what is the temperature" but "is a window
open upstairs", "what does the hallway motion automation actually do", "which devices are in
the living room group". It knows your floors, areas, entities and their current states.

**It controls devices, and checks that it worked.** After every service call it reads the
entity state again. If the light did not turn on, it tells you instead of claiming success.

**It looks after your installation.** In the background it checks for devices that went
offline, sensors that stopped reporting, batteries running down, backups that have not run,
and disk space running out. Separately, it looks for improvements — a room with motion sensors
but no motion-light automation, a thermostat set to 24 °C in July, windows open while the
heating runs — and proposes them for your approval.

It can also write automations and scripts. That always requires your explicit confirmation.

## What you should know first

Three things, stated plainly, so there are no surprises.

**Your data goes to an LLM provider.** Every message you send, plus a compressed list of your
areas and entities with their current states, plus the results of anything the assistant
looked up, is sent to a language model through [OpenRouter](https://openrouter.ai). The
_actions_ happen locally on your Home Assistant. The _thinking_ does not. If that is not
acceptable in your household, no setting fixes it — this add-on is the wrong tool for you.

**It costs money.** You bring your own OpenRouter key and pay per request. With the default
model, `anthropic/claude-haiku-4.5`, a normal question costs a fraction of a cent. Background
analysis and task processing also spend tokens. Set a spending limit on your OpenRouter key.

**It can control your home.** The confirmation gate covers locks, alarms, scripts, buttons,
garage doors and automation edits. Everything else — lights, switches, climate, blinds, media
players — it does without asking. That is a deliberate trade-off you should agree with before
you start.

## Installation

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ → Repositories**.
2. Add `https://github.com/unpaved028/ha-claw`.
3. Install **HA-Claw** from the listing that appears.

The image is compiled on your machine at install time. On a Raspberry Pi that takes a few
minutes; this is normal and only happens on install and update.

Requires Home Assistant OS or Supervised on `aarch64` or `amd64`.

## Configuration options

Open the **Configuration** tab of the add-on.

| Option                      | Required | Default                      | What it does                                                                                            |
| --------------------------- | -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `openrouter_api_key`        | **yes**  | —                            | Your key from [openrouter.ai](https://openrouter.ai). The add-on will not start without it.             |
| `openrouter_default_model`  | no       | `anthropic/claude-haiku-4.5` | Which language model to use. Changeable later in the Web UI without a restart.                          |
| `openai_api_key`            | no       | —                            | A separate OpenAI key. **Only** needed for transcribing Telegram voice messages. Leave empty otherwise. |
| `telegram_bot_token`        | no       | —                            | Enables the Telegram bot.                                                                               |
| `telegram_allowed_user_ids` | see note | —                            | Who may use the bot. **Required** once a token is set — the add-on refuses to start otherwise.          |
| `log_level`                 | no       | `info`                       | Set to `debug` when reporting a problem.                                                                |

### Choosing a model

| Model                          | Good for                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| `anthropic/claude-haiku-4.5`   | The default. Fast, cheap, reliable at picking the right tool.  |
| `anthropic/claude-sonnet-5`    | Better reasoning for automations. Noticeably more expensive.   |
| `anthropic/claude-opus-5`      | Heaviest reasoning. Only worth it for complex automation work. |
| `google/gemini-3.7-flash`      | Good value, handles multi-step loops well.                     |
| `google/gemini-3.5-flash-lite` | Cheapest Google option.                                        |
| `openai/gpt-5.6-luna`          | Cheap OpenAI option.                                           |
| `openai/gpt-5.6-sol`           | Stronger OpenAI option for automation work.                    |
| `deepseek/deepseek-v4-flash`   | Very cheap, very large context.                                |
| `x-ai/grok-4.6`                | Strong reasoning.                                              |
| `openrouter/auto`              | Lets OpenRouter pick per request.                              |
| `openrouter/free`              | Free models. Quality and tool support vary a lot.              |

If the assistant behaves strangely — inventing entity IDs, printing odd tool syntax into its
answers — try a stronger model first. Weak models struggle with tool calling.

You can also assign a different model to each complexity tier under **Settings → Model
Forge**: a cheap model for looking things up, a stronger one for writing automations.

## Setting up Telegram

Optional, but it is how you get notifications and how you reach your home from outside.

**1. Create the bot.** Open [@BotFather](https://t.me/BotFather) in Telegram, send
`/newbot`, follow the prompts. Copy the token it gives you into `telegram_bot_token`.

**2. Find your user ID.** Open [@userinfobot](https://t.me/userinfobot) and send it any
message. It replies with your numeric ID. Put that into `telegram_allowed_user_ids`.

For several people, separate the IDs with commas: `123456789,987654321`.

**3. Restart the add-on** and send your bot a message.

Nobody outside that list can use the bot — messages from other accounts are ignored without a
reply. Everyone on the list is a fully trusted operator: there are no per-user restrictions.
Prefer a private chat unless you want everyone in a group chat to be able to unlock your door.

### Voice messages

Telegram voice notes are transcribed with OpenAI Whisper. That needs its own key in
`openai_api_key` — it does **not** go through OpenRouter. Without the key, the bot replies to
voice notes with a note explaining that; text messages are unaffected.

## First run

Start the add-on and open **HA-Claw** from the sidebar. It greets you with a short setup
conversation rather than a form:

- What should the assistant be called?
- What should it call you?
- How should it talk to you — direct or gentle, formal or casual, humorous or dry, brief or
  thorough?

Answer in normal language; it extracts what it needs. Afterwards it introduces its
capabilities and offers to set up a weekly automated home analysis.

You can change all of it later under **Settings → Profile**.

## Talking to it

Some things worth trying, so you get a feel for what it is capable of:

**Questions about state**

> Is a window still open upstairs?
> Which devices are in the living room?
> Show me every room on the upper floor.
> What is the temperature in the bathroom?

**Control**

> Turn off the lights in the basement.
> Set the living room to 21 degrees.
> Close all the blinds on the south side.

**Understanding your setup**

> What does the "hallway motion light" automation actually do?
> Which devices are in the living room group?
> Why did the heating turn on this morning?

**Improvement**

> Analyse my home.
> Is there anything I should fix?
> Set up an automation that closes the blinds at sunset.

**Reminders**

> Remind me in 30 minutes to take the bins out.
> Turn off the basement light in 10 minutes.
> Tell me at 14:30 that the cake is done.

### When it cannot find something

If it says it cannot find a device you know exists, the entity cache is probably stale — it
rebuilds every 30 minutes. Press **Refresh cache** under Settings, or just ask it to look
again.

Devices only appear with the right room if they are assigned to an area in Home Assistant.
Assigning areas is the single biggest improvement you can make to how well HA-Claw
understands your home.

## The dashboard

Three sections in the top navigation.

**Chat** — the conversation. Progress is shown live: which tool is running, what it found,
when it is done. There is a microphone button for voice input (browser-based, German).

**Status** — three tabs:

- _System Health_ — the standing checks described below.
- _Tasks_ — improvement proposals awaiting your decision.
- _Logs_ — the add-on log and, under Actions, every service call with a rollback button.

**Settings** — three sections:

- _Model Forge_ — the default model and one model per complexity tier.
- _Tool Vault_ — switch individual capabilities on and off. A disabled tool is not offered to
  the assistant at all. Turning off the dangerous ones makes HA-Claw read-only.
- _Profile_ — names and conversational style.

Changes take effect on your next message. No restart.

## System health

**Status → System Health** shows standing checks with their current state and what to do about
them. Opening the screen shows the last completed check (timestamp at the bottom). HA-Claw
refreshes the report shortly after start and every hour. **Refresh** runs a new check on
demand — that is the only time the screen waits.

| Check                                     | What it means                                                                      | Yellow                          | Red                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| **Devices unreachable**                   | Physical devices whose entities are `unavailable` for less than 30 days            | 3 or more                       | 15 or more                           |
| **Unreachable for 30 days**               | Same, but last heard from 30 days ago or more — likely hardware that is gone       | any                             | 8 or more                            |
| **Sensors silent for 48 h**               | Temperature, humidity, pressure or air-quality sensor that has not reported        | 5 or more                       | 25 or more                           |
| **Battery below 20 %**                    | Batteries due for replacement                                                      | any                             | 8 or more                            |
| **Broken references**                     | Automations, scripts or scenes that still name an entity that no longer exists     | any                             | 8 or more                            |
| **Automations and scripts with an error** | Latest trace recorded an error, or the automation/script itself is `unavailable`   | any                             | 5 or more                            |
| **Updates waiting**                       | `update.*` entities that report an available update                                | any                             | 8 or more, or Core / OS / Supervisor |
| **Integrations not loading**              | Config entries stuck in setup error or retry. Overlaps Home Assistant Repairs      | any                             | 3 or more                            |
| **Radio going quiet**                     | Zigbee `last_seen` older than 48 h, or link quality at 20 or below                 | 3 or more                       | 10 or more                           |
| **Add-ons not running**                   | Add-ons with autostart that are stopped, plus any add-on in an error state         | any                             | 3 or more                            |
| **Recorder / history**                    | History is not being written, the recorder thread is down, or the backlog is large | backlog ≥ 1 000, or a migration | not recording, or backlog ≥ 10 000   |
| **Restored only**                         | Entities seen only from a restore and not heard from since this boot               | any                             | 15 or more                           |
| **Backup**                                | Days since the newest backup containing Home Assistant                             | 7 days, or local-only storage   | 14 days, or no backup at all         |
| **Disk space**                            | Free space on the Home Assistant data partition                                    | See below                       | See below                            |

Cards are sorted red, then yellow, then green. Each card has an expandable explanation —
including the green ones — and a link into Home Assistant (device page, updates, backups,
entity registry, automation or script editor, add-on, integration). If a value moved, the
card says what it used to be.

**Broken references.** UI automations and scripts are read in full. Automations that live
only in YAML are checked for the `entity_id` attributes they expose, not the whole file.
The card states how many were fully scanned and how many are YAML-only, so green never
means "we did not look".

Counts are **devices, not entities**. A Zigbee window sensor that also exposes battery,
voltage, firmware and an identify button counts once, not twelve times. Expand a card to see
the individual entities beneath the device name.

**Silent sensors.** A closed window, a dry leak sensor or a rain gauge that has not seen rain
is not a fault. This check only looks at sensors that should keep reporting even when the
reading stays the same — temperature, humidity, atmospheric pressure and air quality — and it
uses the last time Home Assistant heard from them, not the last time the value changed.

**Backups.** One copy away from the device is enough. HA-Claw accepts any of: an official
backup location (Home Assistant Cloud, Google Drive, OneDrive, Synology, WebDAV, a NAS mount),
the _Home Assistant Google Drive Backup_ add-on, or _Samba Backup_. It does not nag you to set
up the others. Local-only storage stays yellow even when the backup is fresh — an SD card does
not survive the device it lives in.

**Disk space.** Read from the Supervisor, no extra sensor needed. On flash storage (under
128 GB, so SD card or eMMC) it warns below 5 GB free and turns red below 3 GB. On larger
drives it uses percentages: yellow below 10 % free, red below 5 %. If the drive reports a
lifetime figure, the card also warns from 90 % consumed.

### Why these are not tasks

A task is something that gets finished. A handful of permanently unreachable devices is the
normal state of many installations, and as a task it would sit in the list forever. So these
are computed live and displayed as conditions instead. They are also in `/status` in Telegram.

Telegram only messages you when something gets **worse** — when a check changes level
(green → yellow → red) or when its count has at least doubled since the last message. That
second rule is what catches a genuine new outage in an installation that is permanently red.
Improvements are recorded silently.

If devices stay in the list forever, they are usually leftovers from hardware you removed.
Deleting those entities in Home Assistant is the only way to clear them — HA-Claw cannot tell
the difference between "offline right now" and "thrown away last year".

## Tasks

**Status → Tasks** holds improvement proposals. They come from the periodic analysis or from
asking the assistant directly ("analyse my home"). Each one names the current situation, the
proposed target state, and the expected benefit.

The workflow deliberately asks twice:

1. **Proposed** — you approve, reject or defer it.
2. **Approved** — the assistant works out a concrete solution.
3. **Solution proposed** — you review the actual plan and approve it.
4. **Executing** — the assistant carries it out and reports the result.

If generation or execution fails three times, the task is marked **Failed** instead of
retrying forever. You can try again from Status → Tasks.

The second approval matters: approving the _idea_ of an automation is not the same as
approving the _automation it wrote_. Read the solution before approving it, because at that
point the assistant runs with its full tool set.

Nothing happens while you do not approve anything. An idle system spends no tokens.

### Removing duplicates

Under Tasks there is a **Remove duplicates** button. Before version 0.9.3, the analysis
created a fresh task for the same finding on every run — the comparison used the title, and
titles contain a live number that changes. The button clears those leftovers, along with the
old entries for the three checks that moved to System Health. Your own tasks and your
decisions (approved, rejected, deferred) are left untouched.

## Reminders and schedules

**One-off reminders** — just ask:

> Remind me in 30 minutes to take the bins out.
> Turn off the basement light in 10 minutes.
> At 14:30, tell me the cake is done.

Delivered through Telegram. Relative delays (`5m`, `2h`, `1h30m`) and absolute times
(`14:30`, today or tomorrow) both work.

**Recurring jobs** run through the assistant, so they can do anything a message can:

| Format             | Meaning                      |
| ------------------ | ---------------------------- |
| `every 5m`         | Every 5 minutes              |
| `every 2h`         | Every 2 hours                |
| `daily 07:00`      | Every day at 07:00           |
| `weekdays 08:00`   | Monday to Friday at 08:00    |
| `weekends 10:00`   | Saturday and Sunday at 10:00 |
| `weekly mon 08:00` | Every Monday at 08:00        |

A useful one to start with is a weekly analysis: _"Every Monday at 8, analyse my home and send
me the result."_ Manage jobs under Status, or ask the assistant to list them.

## Memory and learning

**Memory cards** are things worth keeping: "the guest room is the small room on the upper
floor", "the plants get watered on Sundays". Tell it to remember something and it will bring
it back when relevant.

**Corrections** — when you tell it that it got something wrong, it stores that and applies it
next time. "No, the bathroom light is the ceiling one, not the mirror."

**Rules** are permanent instructions: "never turn on the bedroom light after 22:00".

**Patterns** — recurring actions it noticed, which can turn into automation suggestions.

Everything it has learned is visible by asking, and it all lives in your Home Assistant backup.

## Telegram commands

| Command   | Does                                                        |
| --------- | ----------------------------------------------------------- |
| `/help`   | What the bot can do                                         |
| `/status` | Uptime, memory, estimated token cost, system health summary |
| `/rooms`  | Buttons for every area — tap one for its status             |
| `/ping`   | Quick liveness check                                        |
| `/start`  | Welcome message                                             |

Everything else is just conversation. Voice notes work if `openai_api_key` is set. When
something fails there is a **Try again** button.

## Safety and confirmations

Everyday devices — lights, switches, climate, blinds, media players, helpers — are controlled
directly.

**Confirmation is always required for:**

- Locks and alarm panels
- Automations and scripts, including editing them
- Buttons — their effect cannot be checked in advance
- Covers with `device_class` `garage`, `gate` or `door`
- Scenes that include a lock or an alarm panel
- Deleting anything stored

**How you confirm:**

- **Telegram** — Yes/No buttons in the chat. Only the person who triggered the action can
  answer. Automatically denied after 60 seconds.
- **Web UI** — a dialog showing the tool and its exact arguments. Also 60 seconds. Several
  pending requests queue up rather than overwriting each other.

The dialog shows the raw entity ID rather than a friendly description on purpose. The
description would be written by the same assistant whose decision you are checking. Read the
entity ID.

**Everything is logged.** Status → Logs → Actions lists every service call with its result and
a rollback button. After anything unexpected, that is the record of what actually happened.

## Costs

Under **Status** you can see cumulative token usage and an estimated total in US dollars, also
available through `/status` in Telegram.

What costs tokens:

- Every message you send.
- Every background analysis run.
- Every task the assistant works on after you approve it.
- Scheduled jobs, each time they run.

What does not:

- Idling. There is no polling.
- The dashboard, system health checks, and reading the logs.

Keeping it cheap: stay on `anthropic/claude-haiku-4.5` for everyday use, run the analysis
weekly rather than hourly, and assign areas to your entities so it finds things in one step
instead of three.

The figure shown is an estimate from a model price table, not billed usage. Your OpenRouter
dashboard is authoritative.

## Data and backups

Everything lives in `/data/store/` and is included in Home Assistant backups automatically.

| Folder                      | Contents                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| `conversations/`            | Chat history, shared between the Web UI and Telegram                          |
| `memory/`                   | Long-term memory cards                                                        |
| `notes/`                    | Notes                                                                         |
| `backlog/`                  | Tasks                                                                         |
| `learning/`                 | Corrections, rules, patterns, past errors                                     |
| `scheduler.json`            | Reminders and recurring jobs                                                  |
| `actions.jsonl`             | Action log with rollback data, kept for 7 days                                |
| `profile.json`              | Names, conversational style, model choices                                    |
| `system-health.json`        | Last-seen values (so the screen can say what changed) and last notified state |
| `system-health-report.json` | Last full System Health report shown on the Status screen                     |

Restoring a Home Assistant backup restores all of it. To start over, uninstall the add-on
(which clears `/data`) and reinstall.

## Troubleshooting

**The add-on will not start.**
Check the log. The usual cause is a missing `openrouter_api_key`, or a `telegram_bot_token`
without `telegram_allowed_user_ids` — that combination is refused deliberately, because a bot
without a whitelist answers anyone.

**The add-on starts and then the Supervisor restarts it.**
A watchdog hits `/health`. If the HTTP server is not listening within about 40 seconds, or
later goes away, Home Assistant bounces the container. The add-on log is the place to look.

**It cannot find a device that definitely exists.**
Assign the entity to an area in Home Assistant, then press **Refresh cache** under Settings.
Only controllable domains and the important sensor classes (window, door, motion, smoke,
moisture) are in the cache; an obscure diagnostic sensor may need to be searched for by name.

**It says it turned something on but nothing happened.**
That is the verification working — it compares the state before and after. Check the entity in
Home Assistant directly. Usually the device is unreachable, which System Health will confirm.

**Answers contain strange text like `[TOOL_CALLS]` or `tool_code`.**
The model is leaking its internal syntax. Switch to a stronger model; this happens mostly with
free and very small models.

**The Telegram bot does not answer.**
Your user ID is probably not in `telegram_allowed_user_ids`, or has a typo. Non-whitelisted
messages are ignored silently by design. Confirm your ID with
[@userinfobot](https://t.me/userinfobot).

**It stopped responding mid-request.**
Something is waiting for a confirmation. Check the Web UI for an open dialog, or Telegram for
unanswered buttons. Unanswered requests are denied after 60 seconds.

**"Service temporarily unavailable".**
The circuit breaker opened after repeated failures from the LLM provider and is pausing calls
rather than hammering the API. It recovers on its own. Check
[OpenRouter's status](https://status.openrouter.ai) and that your key still has credit.

**The tasks list keeps filling with the same finding.**
That was fixed in 0.9.3. Update, then use **Remove duplicates** under Status → Tasks.

**Something else.**
Set `log_level: debug`, reproduce it, and read the log. Check for API keys before pasting it
anywhere.

## Getting help

- **Bugs and feature requests**: [GitHub Issues](https://github.com/unpaved028/ha-claw/issues)
- **Questions and ideas**: [Discussions](https://github.com/unpaved028/ha-claw/discussions)
- **Security problems**: [report privately](https://github.com/unpaved028/ha-claw/security/advisories/new),
  not as a public issue
- **How it works internally**: [technical documentation](../docs/README.md)
- **What is coming**: [roadmap](../docs/roadmap.md)

When reporting a bug, include the HA-Claw version, your Home Assistant version, the model you
were using, and the relevant log with `log_level: debug`. And check for secrets first — the
logger redacts what it recognises, which is not a guarantee.
