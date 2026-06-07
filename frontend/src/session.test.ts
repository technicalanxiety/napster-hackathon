/**
 * Example/unit tests for the frontend session state machine.
 *
 * These complement the property test (session.property.test.ts) by pinning the
 * individual lifecycle transitions of {@link sessionReducer} (Requirement 15):
 *
 *   - start (config present)        -> connecting, start disabled        (15.2)
 *   - established                   -> connected, avatar mounts upstream (15.3)
 *   - end                           -> ended, start re-enabled           (15.4)
 *   - timeout                       -> error, start re-enabled           (15.6)
 *   - connectionError               -> error, start re-enabled           (15.7)
 *   - missingConfig                 -> error, start disabled             (15.9)
 */

import { describe, expect, it } from "vitest";
import {
  initialSessionState,
  sessionReducer,
  type SessionState,
} from "./session";

/** A `connecting` state, the precondition for several transitions. */
const connectingState: SessionState = sessionReducer(initialSessionState, {
  type: "start",
});

/** A `connected` state, the precondition for the `end` transition. */
const connectedState: SessionState = sessionReducer(connectingState, {
  type: "established",
});

describe("sessionReducer transitions", () => {
  it("starts disconnected with the start control enabled", () => {
    expect(initialSessionState.status).toBe("disconnected");
    expect(initialSessionState.startEnabled).toBe(true);
  });

  it("start -> connecting and disables the start control (15.2)", () => {
    expect(connectingState.status).toBe("connecting");
    expect(connectingState.startEnabled).toBe(false);
  });

  it("established -> connected from connecting (15.3)", () => {
    expect(connectedState.status).toBe("connected");
    expect(connectedState.startEnabled).toBe(false);
  });

  it("end -> ended and re-enables start from connected (15.4)", () => {
    const next = sessionReducer(connectedState, { type: "end" });
    expect(next.status).toBe("ended");
    expect(next.startEnabled).toBe(true);
  });

  it("timeout -> error and re-enables start from connecting (15.6)", () => {
    const next = sessionReducer(connectingState, { type: "timeout" });
    expect(next.status).toBe("error");
    expect(next.startEnabled).toBe(true);
    expect(next.errorMessage).toMatch(/timed out/i);
  });

  it("connectionError -> error and re-enables start from connecting (15.7)", () => {
    const next = sessionReducer(connectingState, {
      type: "connectionError",
      message: "boom",
    });
    expect(next.status).toBe("error");
    expect(next.startEnabled).toBe(true);
    expect(next.errorMessage).toBe("boom");
  });

  it("missingConfig -> error and disables start (15.9)", () => {
    const next = sessionReducer(initialSessionState, { type: "missingConfig" });
    expect(next.status).toBe("error");
    expect(next.startEnabled).toBe(false);
    expect(next.errorMessage).toMatch(/configuration/i);
  });

  it("ignores invalid transitions (e.g. established when disconnected)", () => {
    expect(sessionReducer(initialSessionState, { type: "established" })).toBe(
      initialSessionState,
    );
    expect(sessionReducer(initialSessionState, { type: "end" })).toBe(
      initialSessionState,
    );
    expect(sessionReducer(connectedState, { type: "timeout" })).toBe(
      connectedState,
    );
  });

  it("allows retry: start from an error state -> connecting", () => {
    const errored = sessionReducer(connectingState, { type: "timeout" });
    const retried = sessionReducer(errored, { type: "start" });
    expect(retried.status).toBe("connecting");
  });
});
