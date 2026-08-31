# Blueprints first

When the user needs a common automation, prefer a well-known Home Assistant blueprint
over generated YAML. Inventing YAML for a solved pattern is how you get `mode: single`
on a motion light.

## Prefer a blueprint

| Need                                                     | What to suggest                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion or occupancy turns lights on, then off after idle | Official **Motion-activated Light** (`homeassistant/motion_light`). Use `mode: restart`.                                                              |
| Sun elevation or azimuth moves covers                    | No official blueprint required. Trigger on `sun` elevation / azimuth, action `cover.set_cover_position`. Keep conditions native.                      |
| Leak or moisture sensor should notify                    | Native `binary_sensor` trigger (`device_class: moisture` / `leak`) plus `notify` or `persistent_notification`. Do not wrap this in a template sensor. |

## When you still write YAML

- Use `entity_id`, never `device_id`.
- Prefer native triggers and conditions over Jinja2.
- Motion lights: `mode: restart`, not `single`.
- After writing, the confirmation gate shows a YAML diff. If the current config is missing,
  the automation may be YAML-only — say so instead of overwriting blindly.

## Do not

- Do not generate a custom motion-light automation when the official blueprint fits.
- Do not propose three backlog tasks for "motion", "covers" and "leaks". Point at
  Status → Pflege or `home_review`.
