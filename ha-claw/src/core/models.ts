/**
 * models.ts – Canonical list of selectable LLM models.
 *
 * This is the single source of truth for the Web UI model dropdowns. It used to
 * be duplicated between config.yaml, web/server.ts and the dashboard, which is
 * why openrouter/free and openrouter/auto were selectable in the add-on config
 * but not in the UI.
 *
 * config.yaml cannot import from TypeScript, so its `openrouter_default_model`
 * enum still lists the same values by hand – the "Model list consistency" job
 * in .github/workflows/ci.yml fails if the two drift apart. Keep one model per
 * line so that check stays simple.
 *
 * This module must stay free of side effects: the CI check and any test may
 * import it without a valid add-on configuration present.
 */

export const AVAILABLE_MODELS: readonly string[] = [
  'openrouter/free',
  'openrouter/auto',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite-preview',
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'deepseek/deepseek-chat',
];

/** Default model used when the user has not chosen one. */
export const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
