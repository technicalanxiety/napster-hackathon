/**
 * Single-page Web_Frontend for the Azure Governance Baseline Advisor.
 *
 * Renders the agent video avatar as the central element with start/end controls
 * and a status indicator (Requirements 15.1, 15.5). The session lifecycle is
 * driven by the pure {@link sessionReducer} state machine; this component owns
 * the side effects (opening the WebRTC connection, the 30s connection timeout,
 * mounting/tearing down the avatar) and dispatches lifecycle events into the
 * reducer (Requirements 15.2, 15.3, 15.4, 15.6, 15.7, 15.9).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  initialSessionState,
  sessionReducer,
  type SessionStatus,
} from "./session";
import { readConfig, type AppConfig } from "./config";
import {
  createWebRtcConnection,
  type AvatarConnection,
  type CreateConnection,
} from "./napster";
import "./app.css";

/** Connection establishment timeout in milliseconds (Requirement 15.6). */
export const CONNECTION_TIMEOUT_MS = 30_000;

/** Human-readable label for each session status shown in the indicator. */
const STATUS_LABEL: Record<SessionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  ended: "Ended",
  error: "Error",
};

/** Props for {@link App}; all optional with production defaults, overridable for tests. */
export interface AppProps {
  /**
   * Pre-resolved configuration. `undefined` means read from `import.meta.env`;
   * `null` explicitly represents missing configuration.
   */
  readonly config?: AppConfig | null;
  /** Connection factory (defaults to the real Napster WebRTC factory). */
  readonly createConnection?: CreateConnection;
  /** Connection timeout override (defaults to {@link CONNECTION_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
}

/**
 * The Advisor frontend application shell.
 */
export function App({
  config: configProp,
  createConnection = createWebRtcConnection,
  timeoutMs = CONNECTION_TIMEOUT_MS,
}: AppProps = {}) {
  // Resolve config once: an explicit prop (object or null) wins; otherwise read
  // from the build-time environment. Memoized so the startup effect is stable.
  const config = useMemo(
    () => (configProp !== undefined ? configProp : readConfig()),
    [configProp],
  );

  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);

  const avatarContainerRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<AvatarConnection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Clear any pending connection timeout. */
  const clearConnectionTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Detect missing configuration at startup: surface an error status and keep
  // the start control disabled (Requirement 15.9).
  useEffect(() => {
    if (config === null) {
      dispatch({ type: "missingConfig" });
    }
  }, [config]);

  // Release timers, the in-flight request, and the connection on unmount.
  useEffect(() => {
    return () => {
      clearConnectionTimeout();
      abortRef.current?.abort();
      connectionRef.current?.close();
    };
  }, [clearConnectionTimeout]);

  const handleStart = useCallback(async () => {
    // Guard: never attempt a connection without configuration.
    if (config === null) {
      dispatch({ type: "missingConfig" });
      return;
    }

    dispatch({ type: "start" });

    const controller = new AbortController();
    abortRef.current = controller;

    // Track whether this attempt timed out so a late resolution/rejection from
    // the connection does not override the already-dispatched timeout.
    let timedOut = false;
    timeoutRef.current = setTimeout(() => {
      timedOut = true;
      controller.abort();
      dispatch({ type: "timeout" });
    }, timeoutMs);

    try {
      const connection = await createConnection(config, {
        signal: controller.signal,
      });
      clearConnectionTimeout();

      if (timedOut) {
        // The timeout already won the race; discard this connection.
        connection.close();
        return;
      }

      connectionRef.current = connection;
      if (avatarContainerRef.current) {
        connection.mount(avatarContainerRef.current);
      }
      dispatch({ type: "established" });
    } catch (caught) {
      clearConnectionTimeout();
      if (timedOut) {
        // Timeout already handled the failure; nothing further to do.
        return;
      }
      const message =
        caught instanceof Error ? caught.message : "A connection error occurred.";
      dispatch({ type: "connectionError", message });
    } finally {
      abortRef.current = null;
    }
  }, [config, createConnection, timeoutMs, clearConnectionTimeout]);

  const handleEnd = useCallback(() => {
    clearConnectionTimeout();
    abortRef.current?.abort();
    abortRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    dispatch({ type: "end" });
  }, [clearConnectionTimeout]);

  return (
    <main className="advisor">
      <h1 className="advisor__title">Azure Governance Baseline Advisor</h1>

      <div
        ref={avatarContainerRef}
        className="advisor__avatar"
        data-testid="avatar-container"
        role="region"
        aria-label="Agent video avatar"
      />

      <div className="advisor__controls">
        <button
          type="button"
          className="advisor__button advisor__button--start"
          onClick={handleStart}
          disabled={!state.startEnabled}
        >
          Start Assessment
        </button>
        <button
          type="button"
          className="advisor__button advisor__button--end"
          onClick={handleEnd}
          disabled={state.status !== "connected"}
        >
          End Session
        </button>
      </div>

      <p
        className="advisor__status"
        role="status"
        aria-live="polite"
        data-status={state.status}
      >
        Status: {STATUS_LABEL[state.status]}
        {state.errorMessage ? ` — ${state.errorMessage}` : ""}
      </p>
    </main>
  );
}
