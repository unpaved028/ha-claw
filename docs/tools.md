# Tool Reference

The agent's entire capability surface. If it is not in this list, the agent cannot do it.

47 tools are registered at startup: 16 Home Assistant tools, 30 built-ins, and the
best-practices lookup. The registry lives in
[`src/tools/registry.ts`](../ha-claw/src/tools/registry.ts).

- [How a tool is defined](#how-a-tool-is-defined)
- [Danger flag and complexity](#danger-flag-and-complexity)
- [Home Assistant tools](#home-assistant-tools)
- [Built-in tools](#built-in-tools)
- [Knowledge base](#knowledge-base)
- [Disabling tools](#disabling-tools)

## How a tool is defined

```ts
registry.register({
  name: 'ha_get_state',
  description: '...',      // the LLM reads this — it is the tool's real interface
  parameters: { ... },     // JSON Schema, passed to the model
  handler: async (args) => { ... },
  dangerous: false,        // default false — true routes through the confirmation gate
  complexity: 1,           // default 1 — selects the model tier
});
```

The `description` is not a comment. It is the only thing the model has to decide whether a
tool applies, so changing it changes behaviour. Treat it as an API change.

`executeTool` in the registry checks arguments against the tool's JSON Schema (`type`,
`required`, `properties`, `anyOf`, `items`) and times out after **15 seconds**. Either
failure comes back as a tool error the model can react to. A numeric `limit` argument that
is missing, `NaN` or out of range is clamped (default 1–200) so `slice(0, NaN)` cannot look
like an empty house.

## Danger flag and complexity

**`dangerous: true`** means every call is held until the user confirms it — inline keyboard
in Telegram, modal in the Web UI, auto-denied after 60 seconds. Eight tools are marked
dangerous:

`ha_call_service_dangerous` · `ha_save_automation_config` · `ha_save_script_config` ·
`action_log_rollback` · `store_delete` · `memory_forget` · `backlog_delete` ·
`schedule_delete`

**`complexity`** selects which model handles the rest of the loop once the tool has run. See
[configuration.md § Model tiers](configuration.md#model-tiers). Only four tools are above
tier 1.

## Home Assistant tools

[`src/tools/ha-tools.ts`](../ha-claw/src/tools/ha-tools.ts) — 16 tools.

### Reading state

| Tool | Tier | Description |
| --- | --- | --- |
| `ha_get_state` | 1 | State and attributes for one entity or a batch of entities. |
| `ha_search_entities` | 1 | Search by free text, `domain`, `area`, `floor` or `device_class`. The `device_class` filter is what lets the agent find window contacts regardless of how they are named. |
| `ha_get_entities_by_label` | 1 | Entities carrying a given Home Assistant label. |
| `ha_list_areas` | 1 | Areas with their floor assignment and entity counts. Optional floor filter. |
| `ha_resolve_group` | 1 | Expands a `group.*` entity into its members with current states. |
| `ha_get_config` | 1 | Home Assistant version, timezone, location, unit system. |
| `ha_get_all_entities` | 1 | Entity count per domain — a cheap overview, not a dump. |

### Acting

| Tool | Tier | Dangerous | Description |
| --- | --- | --- | --- |
| `ha_call_service` | 1 | no | Service calls restricted to everyday domains. Captures state before and after, waits, then reports whether the change actually took effect. |
| `ha_call_service_dangerous` | 2 | **yes** | Everything the safe path rejects: locks, alarms, scripts, buttons, guarded covers, domain-wide calls such as `automation.reload`. Requires confirmation. |
| `ha_light_set_scene` | 1 | no | Shorthand for `scene.turn_on`, with the same guarded-entity checks. |
| `ha_light_set_color` | 1 | no | Colour, colour temperature and brightness in one call. |
| `action_log_rollback` | 1 | **yes** | Replays the inverse of a recorded action from `actions.jsonl`. |

Which domains `ha_call_service` accepts, and the `cover`/`scene` special cases, are in
[security.md § Domain allowlist](security.md#domain-allowlist).

### Automations and scripts

| Tool | Tier | Dangerous | Description |
| --- | --- | --- | --- |
| `ha_get_automation_config` | 1 | no | Full triggers, conditions and actions. Resolves the internal automation `id` from entity attributes, so UI-created automations load correctly. |
| `ha_save_automation_config` | 3 | **yes** | Overwrites an automation's configuration. |
| `ha_get_script_config` | 1 | no | Reads a script's sequence. |
| `ha_save_script_config` | 3 | **yes** | Overwrites a script's configuration. |

The two write tools are tier 3 and dangerous. Generating automation YAML is the one task
where model quality visibly matters, and a bad write silently breaks a working automation.

## Built-in tools

[`src/tools/builtins.ts`](../ha-claw/src/tools/builtins.ts) — 30 tools. All tier 1 except
`analyze_home`.

### Time and system

| Tool | Dangerous | Description |
| --- | --- | --- |
| `get_current_time` | no | ISO, local (Europe/Berlin) and Unix time. |
| `get_system_info` | no | Process uptime, memory, Node version. |

### Store

Three collections only: `notes`, `conversations`, `memory`.

| Tool | Dangerous | Description |
| --- | --- | --- |
| `store_list` | no | List records in a collection. |
| `store_read` | no | Read one record by ID. |
| `store_write` | no | Create a record. |
| `store_delete` | **yes** | Delete a record. Irreversible. |
| `notes_add` | no | Shorthand for writing a note. |

### Memory

Long-term memory cards, retrieved by keyword relevance and injected into the system prompt.

| Tool | Dangerous | Description |
| --- | --- | --- |
| `memory_remember` | no | Store a memory card. |
| `memory_recall` | no | Search cards by relevance. |
| `memory_update` | no | Update a card, keeping version history. |
| `memory_list` | no | List card metadata without the bodies. |
| `memory_forget` | **yes** | Delete a card permanently. |

### Tasks (backlog)

| Tool | Dangerous | Description |
| --- | --- | --- |
| `tasks_add` | no | Add a task the user asked for. |
| `backlog_propose` | no | Propose an improvement the agent found itself. |
| `backlog_list` | no | List tasks, optionally filtered by status (including `failed`). |
| `backlog_detail` | no | Full detail for one task, including its proposed solution. |
| `backlog_update` | no | Change status or fields. Drives the approval workflow. |
| `backlog_delete` | **yes** | Delete a task permanently. |

### Scheduler

| Tool | Dangerous | Description |
| --- | --- | --- |
| `schedule_create` | no | Recurring job. Formats below. |
| `schedule_once` | no | One-shot timer or reminder. |
| `schedule_list` | no | List jobs with their next run time. |
| `schedule_toggle` | no | Enable or disable a job. |
| `schedule_delete` | **yes** | Delete a job permanently. |

Accepted schedule strings, exactly as the parser in
[`src/storage/scheduler.ts`](../ha-claw/src/storage/scheduler.ts) implements them:

| Format | Example | Notes |
| --- | --- | --- |
| `every <n>m` / `every <n>h` | `every 5m`, `every 2h` | Also accepts `min`, `hr`, `hour`, with or without a trailing `s`. |
| `daily HH:MM` | `daily 07:00` | |
| `weekdays HH:MM` | `weekdays 08:00` | Monday–Friday. |
| `weekends HH:MM` | `weekends 10:00` | Saturday and Sunday. |
| `weekly <day> HH:MM` | `weekly mon 08:00` | `mon` `tue` `wed` `thu` `fri` `sat` `sun`. |
| `once +<n>h<n>m` | `once +5m`, `once +1h30m` | Relative delay; at least one unit required. |
| `once HH:MM` | `once 14:30` | Today if still in the future, otherwise tomorrow. |

Input is lowercased and trimmed before parsing. `schedule_once` accepts the natural forms
(`"5m"`, `"14:30"`) and converts them. An unrecognised string is rejected with a message
listing the valid formats. The scheduler ticks every 30 seconds and skips jobs while the
LLM circuit breaker is open. Recurring jobs get their next run time advanced *before* the
executor, so a job that lasts longer than the tick cannot fire twice. When the breaker
closes, overdue jobs are jittered by up to 60 seconds so they do not all hit the model at
once.

### Analysis and learning

| Tool | Tier | Description |
| --- | --- | --- |
| `analyze_home` | **2** | Runs the seven proactive analysis modules and writes findings to the backlog. |
| `learn_correction` | 1 | Records a user correction, injected into later prompts. |
| `learn_rule` | 1 | Adds a permanent prompt patch that changes agent behaviour. |
| `detect_patterns` | 1 | Finds recurring actions in the usage history. |
| `list_learned` | 1 | Everything learned so far: corrections, rules, patterns, errors. |
| `action_log_list` | 1 | Recent agent actions from `actions.jsonl`. |

What each analysis module checks is documented in
[architecture.md § Proactive analysis](architecture.md#proactive-analysis-vs-system-health).

### Onboarding

| Tool | Description |
| --- | --- |
| `save_onboarding_profile` | Writes the profile at the end of the setup conversation. |

During onboarding the agent is restricted to three tools — `save_onboarding_profile`,
`get_current_time` and `schedule_create` — so it cannot start controlling devices before it
knows who you are.

## Knowledge base

[`src/tools/ha-best-practices.ts`](../ha-claw/src/tools/ha-best-practices.ts) — 1 tool.

| Tool | Description |
| --- | --- |
| `ha_best_practices` | Retrieves Home Assistant guidance by topic or keyword. |

It reads six reference files from
[`ha-claw/agents/skills/ha-best-practices/`](../ha-claw/agents/skills/ha-best-practices/):
`automation-patterns.md`, `device-control.md`, `helper-selection.md`,
`safe-refactoring.md`, `template-guidelines.md` and `examples.yaml`.

The point is to stop the model inventing Home Assistant YAML from a two-year-old training
snapshot — it consults the shipped guidance instead, which covers things like preferring
`entity_id` over `device_id` and choosing native conditions over Jinja2 templates.

## Disabling tools

**Settings → Tool Vault** in the dashboard, or `PUT /api/tools/toggle`. The disabled set is
persisted to `store/disabled-tools.json` and survives restarts.

A disabled tool is not sent to the model, so it does not consume prompt tokens and cannot be
called. This is the blunt instrument for restricting what the agent can do: switching off
`ha_call_service_dangerous` and the two `*_save_*_config` tools turns HA-Claw into a
read-only assistant.
