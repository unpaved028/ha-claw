# HA-Claw Documentation

Technical reference for HA-Claw. Written in English and kept next to the code it describes.

**Looking for the user manual?** It ships with the add-on so Home Assistant can render it in
the Documentation tab: [`ha-claw/DOCS.md`](../ha-claw/DOCS.md) —
[deutsche Fassung](../ha-claw/DOCS.de.md).

## Reference

| Document | Contents |
| --- | --- |
| [configuration.md](configuration.md) | Every add-on option, environment variable, model tier and data path |
| [tools.md](tools.md) | All 47 tools the agent can call, with danger flags and complexity tiers |
| [api.md](api.md) | HTTP and SSE API served over Ingress |
| [architecture.md](architecture.md) | Components, data flow, and why the dashboard is generated |
| [security.md](security.md) | Domain allowlist, confirmation gate, threat model, what leaves your network |

## Working on HA-Claw

| Document | Contents |
| --- | --- |
| [development.md](development.md) | Local setup, dashboard build pipeline, debugging, conventions |
| [releasing.md](releasing.md) | Version bump and release checklist |
| [roadmap.md](roadmap.md) | Product vision, what is planned, and what is deliberately deferred |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How to get a change merged |
| [../AGENTS.md](../AGENTS.md) | Instructions for AI coding agents, including the documentation map |

## Reading order

Never seen the codebase before? [architecture.md](architecture.md) →
[tools.md](tools.md) → [development.md](development.md).

Evaluating whether to trust it with your locks? [security.md](security.md) →
[../SECURITY.md](../SECURITY.md).

Wondering where this is going? [roadmap.md](roadmap.md).

## A note on accuracy

Every fact in these documents is supposed to be traceable to a file in the repository. Where
a document states a threshold, a default or a list, it names the source file so you can
verify it. If you find a discrepancy, that is a bug — please
[report it](https://github.com/unpaved028/ha-claw/issues/new?template=bug_report.yml).
