/**
 * Property-based tests for the frontend session state machine.
 *
 * Feature: azure-governance-advisor, Property 9: Session status invariant
 *
 * For any sequence of frontend session lifecycle events (start, established,
 * end, timeout, connection error, missing-config), the displayed session status
 * is always exactly one of `disconnected`, `connecting`, `connected`, `ended`,
 * or `error` after each event is applied.
 *
 * Validates: Requirements 15.5
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  initialSessionState,
  sessionReducer,
  type SessionEvent,
  type SessionStatus,
} from "./session";

/** The exhaustive set of statuses the session is permitted to display. */
const VALID_STATUSES: readonly SessionStatus[] = [
  "disconnected",
  "connecting",
  "connected",
  "ended",
  "error",
];

/** Generates a single arbitrary lifecycle event. */
const eventArb: fc.Arbitrary<SessionEvent> = fc.oneof(
  fc.constant<SessionEvent>({ type: "start" }),
  fc.constant<SessionEvent>({ type: "established" }),
  fc.constant<SessionEvent>({ type: "end" }),
  fc.constant<SessionEvent>({ type: "timeout" }),
  fc
    .option(fc.string(), { nil: undefined })
    .map<SessionEvent>((message) => ({ type: "connectionError", message })),
  fc.constant<SessionEvent>({ type: "missingConfig" }),
);

/** Arbitrary sequence of lifecycle events, including the empty sequence. */
const eventSequenceArb: fc.Arbitrary<SessionEvent[]> = fc.array(eventArb, {
  maxLength: 30,
});

describe("sessionReducer — Property 9", () => {
  it("status is always one of the five valid statuses after each event", () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        // The initial state itself must satisfy the invariant.
        expect(VALID_STATUSES).toContain(initialSessionState.status);

        let state = initialSessionState;
        for (const event of events) {
          state = sessionReducer(state, event);
          expect(VALID_STATUSES).toContain(state.status);
        }
      }),
      { numRuns: 200 },
    );
  });
});
