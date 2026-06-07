/**
 * Frontend session state machine for the Azure Governance Baseline Advisor.
 *
 * This module models the WebRTC session lifecycle (Requirement 15) as a pure
 * reducer over a small, explicit set of statuses. Keeping the transition logic
 * pure and free of side effects lets the UI layer (task 12.3) dispatch events
 * without owning lifecycle rules, and lets the property test (task 12.2) verify
 * the status invariant across arbitrary event sequences.
 *
 * State diagram (from design.md, Component 5):
 *
 *   disconnected --start (config present)--> connecting
 *   disconnected --config missing-----------> error (start disabled)
 *   connecting   --established--------------> connected
 *   connecting   --timeout / conn error-----> error (start re-enabled)
 *   connected    --end----------------------> ended
 *   error        --start (retry)------------> connecting
 *   ended        --start--------------------> connecting
 */

/**
 * The complete set of session statuses the frontend can display. Exactly one of
 * these is always the active status (Requirement 15.5 / Property 9).
 */
export type SessionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

/**
 * Observable session state. `startEnabled` drives whether the start control is
 * interactive, and `errorMessage` carries a human-readable indication while in
 * the `error` status.
 */
export interface SessionState {
  readonly status: SessionStatus;
  /** Present only in the `error` status; describes the failure to the user. */
  readonly errorMessage?: string;
  /** Whether the start control should be enabled for the user. */
  readonly startEnabled: boolean;
}

/**
 * Lifecycle events that drive session transitions.
 *
 * - `start`        — user activated the start control (Requirement 15.2).
 * - `established`  — WebRTC connection succeeded (Requirement 15.3).
 * - `end`          — user activated the end control (Requirement 15.4).
 * - `timeout`      — connection not established within 30s (Requirement 15.6).
 * - `connectionError` — a connection error occurred (Requirement 15.7).
 * - `missingConfig`   — required config absent at startup (Requirement 15.9).
 */
export type SessionEvent =
  | { readonly type: "start" }
  | { readonly type: "established" }
  | { readonly type: "end" }
  | { readonly type: "timeout" }
  | { readonly type: "connectionError"; readonly message?: string }
  | { readonly type: "missingConfig" };

/** Default indication shown when a connection does not establish in time. */
const TIMEOUT_MESSAGE = "Connection timed out after 30 seconds. Please try again.";

/** Default indication shown when an unspecified connection error occurs. */
const CONNECTION_ERROR_MESSAGE = "A connection error occurred. Please try again.";

/** Indication shown when required configuration is missing at startup. */
const MISSING_CONFIG_MESSAGE =
  "Missing configuration: set VITE_NAPSTER_API_KEY and VITE_AGENT_ID.";

/**
 * The initial session state before any lifecycle event. The session begins
 * disconnected with the start control enabled.
 */
export const initialSessionState: SessionState = {
  status: "disconnected",
  startEnabled: true,
};

/**
 * Build the `connecting` state. The start control is disabled while a
 * connection attempt is in flight to prevent concurrent starts.
 */
function connecting(): SessionState {
  return { status: "connecting", startEnabled: false };
}

/**
 * Build the `error` state. Connection failures (timeout / connection error)
 * re-enable start so the user can retry (Requirement 15.7); the missing-config
 * failure keeps start disabled (Requirement 15.9).
 */
function error(message: string, startEnabled: boolean): SessionState {
  return { status: "error", errorMessage: message, startEnabled };
}

/**
 * Whether a `start` event is permitted from the given state. Start is honored
 * only when the control is enabled and the status is one a session can begin
 * from: `disconnected`, a retryable `error`, or `ended`.
 */
function canStart(state: SessionState): boolean {
  return (
    state.startEnabled &&
    (state.status === "disconnected" ||
      state.status === "error" ||
      state.status === "ended")
  );
}

/**
 * Pure session reducer. Applies a single lifecycle event to the current state
 * and returns the next state. Transitions that are not valid for the current
 * status leave the state unchanged, guaranteeing the result is always one of
 * the five defined statuses (Property 9).
 */
export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  switch (event.type) {
    case "start":
      return canStart(state) ? connecting() : state;

    case "established":
      return state.status === "connecting"
        ? { status: "connected", startEnabled: false }
        : state;

    case "end":
      return state.status === "connected"
        ? { status: "ended", startEnabled: true }
        : state;

    case "timeout":
      return state.status === "connecting"
        ? error(TIMEOUT_MESSAGE, true)
        : state;

    case "connectionError":
      return state.status === "connecting"
        ? error(event.message ?? CONNECTION_ERROR_MESSAGE, true)
        : state;

    case "missingConfig":
      // Missing config is detected at startup and disables start regardless of
      // the prior status.
      return error(MISSING_CONFIG_MESSAGE, false);

    default: {
      // Exhaustiveness guard: every event variant must be handled above.
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
