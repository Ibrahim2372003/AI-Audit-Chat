import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

/**
 * Server-only model configuration for /api/audit-chat.
 *
 * Provider is chosen with AI_PROVIDER ("google" by default, or "anthropic").
 * Keys are read from the environment on the server only; nothing here is
 * exposed to the browser (no NEXT_PUBLIC_ variables are used).
 *
 *   google:    GOOGLE_GENERATIVE_AI_API_KEY (required), GEMINI_MODEL (required)
 *   anthropic: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional)
 *
 * GEMINI_MODEL has no baked-in default on purpose: which Gemini models carry
 * a free quota depends on the account and changes over time, so the model must
 * be one you have confirmed in Google AI Studio.
 *
 * Environment is read at request time (not at import time) and `env` is
 * injectable so this is unit-testable without touching process.env.
 */

export type ProviderName = 'google' | 'anthropic';

type Env = Record<string, string | undefined>;

/**
 * Hard cap on generated tokens per step. Note: for Gemini "thinking" models,
 * reasoning tokens may count toward this cap, so a very small value can cut a
 * reply short.
 */
export const MAX_OUTPUT_TOKENS = 2048;

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

/**
 * Discriminated on a string `status`, not a boolean: this project runs with
 * `"strict": false`, where TypeScript does not narrow unions on boolean
 * literals (it needs strictNullChecks), but does narrow on string literals.
 */
export type ModelResolution =
  | {
      status: 'ready';
      provider: ProviderName;
      modelId: string;
      model: ReturnType<typeof google> | ReturnType<typeof anthropic>;
    }
  | {
      status: 'misconfigured';
      /** Names the missing/invalid variable. Never contains a secret value. */
      detail: string;
    };

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function resolveModel(env: Env = process.env): ModelResolution {
  const provider = (read(env, 'AI_PROVIDER') ?? 'google').toLowerCase();

  if (provider === 'google') {
    if (!read(env, 'GOOGLE_GENERATIVE_AI_API_KEY')) {
      return { status: 'misconfigured', detail: 'GOOGLE_GENERATIVE_AI_API_KEY is not set' };
    }
    const modelId = read(env, 'GEMINI_MODEL');
    if (!modelId) {
      return { status: 'misconfigured', detail: 'GEMINI_MODEL is not set' };
    }
    return { status: 'ready', provider: 'google', modelId, model: google(modelId) };
  }

  if (provider === 'anthropic') {
    if (!read(env, 'ANTHROPIC_API_KEY')) {
      return { status: 'misconfigured', detail: 'ANTHROPIC_API_KEY is not set' };
    }
    const modelId = read(env, 'ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL;
    return { status: 'ready', provider: 'anthropic', modelId, model: anthropic(modelId) };
  }

  return { status: 'misconfigured', detail: 'AI_PROVIDER must be "google" or "anthropic"' };
}
