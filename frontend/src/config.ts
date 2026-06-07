/**
 * Environment-based configuration for the Web_Frontend (Requirement 15.8).
 *
 * The Napster API key and agent identifier are injected at build time through
 * Vite's `import.meta.env` (`VITE_NAPSTER_API_KEY`, `VITE_AGENT_ID`). This
 * module reads and validates that configuration into a single typed object,
 * returning `null` when either value is absent so the UI can surface the
 * missing-configuration error and disable the start control (Requirement 15.9).
 */

/** Resolved, validated frontend configuration. */
export interface AppConfig {
  /** Napster API key sent as the `X-Api-Key` header on connection requests. */
  readonly apiKey: string;
  /** Identifier of the assembled Advisor_Agent to connect to. */
  readonly agentId: string;
}

/**
 * The subset of environment variables this app consumes. Declared with optional
 * members because, although Vite types them as `string`, either may be absent
 * at runtime when the deployment was not configured.
 */
export interface ConfigEnv {
  readonly VITE_NAPSTER_API_KEY?: string;
  readonly VITE_AGENT_ID?: string;
}

/**
 * Read and validate frontend configuration from the given environment.
 *
 * Whitespace-only values are treated as absent so a blank `.env` entry does not
 * pass as configured.
 *
 * @param env The environment to read (defaults to `import.meta.env`).
 * @returns The resolved {@link AppConfig}, or `null` if either value is missing.
 */
export function readConfig(env: ConfigEnv = import.meta.env): AppConfig | null {
  const apiKey = env.VITE_NAPSTER_API_KEY?.trim();
  const agentId = env.VITE_AGENT_ID?.trim();

  if (!apiKey || !agentId) {
    return null;
  }

  return { apiKey, agentId };
}
