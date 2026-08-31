# Security Policy

HA-Claw can unlock doors, disarm alarms and rewrite automations. Security reports are taken
seriously and get priority over feature work.

## Supported versions

Only the latest release receives fixes. HA-Claw ships as a Home Assistant add-on, so
upgrading is a one-click operation — there are no maintained backport branches.

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| Anything older | ❌ — upgrade first |

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private reporting:
[**Report a vulnerability**](https://github.com/unpaved028/ha-claw/security/advisories/new).

If that is unavailable to you, open a public issue containing only the words "security
report, requesting private contact" and nothing else, and wait to be contacted.

Please include:

- What an attacker can achieve, in one sentence.
- Reproduction steps, including the prompt or request that triggers it.
- Affected version and whether it needs Telegram, the Web UI or neither.
- Whether it requires an already-whitelisted user, or works from outside.

You can expect an acknowledgement within 7 days and a status update within 30 days. Fixes
are released as a patch version with a CHANGELOG entry under `### Security`. Credit is given
in the release notes unless you ask otherwise.

## What is in scope

- Bypassing the confirmation gate for a dangerous domain (`lock`, `alarm_control_panel`,
  `script`, `button`, garage/gate/door covers, automation and script writes).
- Reaching a guarded entity through an unguarded path — for example a scene that includes a
  lock, or an `entity_id` that does not belong to the requested domain.
- One whitelisted Telegram user approving a confirmation they did not trigger.
- Secrets appearing unredacted in logs, in the Web UI, or in a payload sent to the LLM
  provider beyond what is documented in [docs/security.md](docs/security.md).
- Any path that reaches the add-on's HTTP API without going through Home Assistant Ingress
  authentication.
- Supply-chain issues in the add-on's dependencies or Docker build.

## What is out of scope

These are known, documented properties of the design rather than vulnerabilities:

- **Prompt injection changes what the agent says.** Text from your Home Assistant — entity
  names, automation aliases, sensor attributes — is placed into the model's context.
  Malicious text there can steer the model's replies. This is mitigated at the *action*
  boundary, not the *language* boundary: a manipulated model still cannot call a guarded
  domain without your explicit confirmation. A report is in scope only if it shows an
  injected instruction causing a **guarded action to execute without confirmation**.
- **Conversation content reaching the LLM provider.** Sending your messages, entity cache
  and tool results to OpenRouter is the documented operating model, not a leak.
- **A whitelisted user doing damage.** Whitelisted Telegram users are trusted operators.
- **Cost.** An agent that spends more tokens than you expected is a bug, not a vulnerability.
- Issues in Home Assistant, the Supervisor, OpenRouter or Telegram themselves. Report those
  to the respective projects.

## Hardening notes for operators

- **Give the bot its own Telegram chat.** In a group chat, every whitelisted member sees the
  conversation. Confirmations are bound to the user who triggered them, but the transcript
  is not private.
- **Use a scoped OpenRouter key** with a spending limit. HA-Claw never needs more than
  chat-completions access.
- **Keep `openai_api_key` empty** unless you actually use Telegram voice messages.
- **Review proposed tasks before approving.** An approved backlog task is executed by the
  agent with the full tool set.
- **Check the action log** under Status → Actions after unexpected behaviour. Every service
  call is recorded with its rollback payload.

Design details — the domain allowlist, what the confirmation gate covers, and exactly what
leaves your network — are in [docs/security.md](docs/security.md).
