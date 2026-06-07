/**
 * Component tests for the {@link App} shell (Requirement 15).
 *
 * Drives the App through its session lifecycle using injectable props
 * (`config`, `createConnection`, `timeoutMs`) and a fake connection so the tests
 * exercise the real reducer + side-effect wiring without any network or media:
 *
 *   - render: avatar central element + start/end controls + status   (15.1, 15.5)
 *   - start click -> connecting                                      (15.2)
 *   - connection resolves -> connected, avatar mounted               (15.3)
 *   - end -> ended, connection torn down                             (15.4)
 *   - 30s timeout -> error (small timeoutMs + never-resolving conn)  (15.6)
 *   - connection error -> error, start re-enabled                    (15.7)
 *   - missing config -> error status, start disabled                 (15.9)
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AppConfig } from "./config";
import type { AvatarConnection, CreateConnection } from "./napster";

/** A valid configuration so the start control is enabled. */
const CONFIG: AppConfig = { apiKey: "key-123", agentId: "agent-abc" };

/** A minimal deferred so a test can control when a connection settles. */
function defer<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Build a fake {@link AvatarConnection} with spies and a real mounted node. */
function makeFakeConnection() {
  const mount = vi.fn<(container: HTMLElement) => void>((container) => {
    const video = document.createElement("video");
    container.appendChild(video);
  });
  const close = vi.fn<() => void>();
  const connection: AvatarConnection = { mount, close };
  return { connection, mount, close };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("renders the avatar as the central element with controls and status (15.1, 15.5)", () => {
    render(<App config={CONFIG} createConnection={vi.fn()} />);

    expect(screen.getByTestId("avatar-container")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start assessment/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /end session/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/disconnected/i);
  });

  it("sets status to connecting when start is activated (15.2)", async () => {
    // Never-resolving connection keeps the session in `connecting`.
    const createConnection: CreateConnection = () => new Promise(() => {});
    render(<App config={CONFIG} createConnection={createConnection} />);

    const start = screen.getByRole("button", { name: /start assessment/i });
    act(() => start.click());

    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
    expect(start).toBeDisabled();
  });

  it("mounts the avatar and sets status to connected when the connection resolves (15.3)", async () => {
    const { connection, mount } = makeFakeConnection();
    const deferred = defer<AvatarConnection>();
    const createConnection: CreateConnection = vi.fn(() => deferred.promise);

    render(<App config={CONFIG} createConnection={createConnection} />);
    act(() => {
      screen.getByRole("button", { name: /start assessment/i }).click();
    });

    await act(async () => {
      deferred.resolve(connection);
      await deferred.promise;
    });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/connected/i),
    );
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith(
      screen.getByTestId("avatar-container"),
    );
    expect(screen.getByTestId("avatar-container").querySelector("video")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /end session/i }),
    ).toBeEnabled();
  });

  it("tears down the connection and sets status to ended when end is activated (15.4)", async () => {
    const { connection, close } = makeFakeConnection();
    const createConnection: CreateConnection = vi.fn(() =>
      Promise.resolve(connection),
    );

    render(<App config={CONFIG} createConnection={createConnection} />);
    await act(async () => {
      screen.getByRole("button", { name: /start assessment/i }).click();
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/connected/i),
    );

    act(() => {
      screen.getByRole("button", { name: /end session/i }).click();
    });

    expect(screen.getByRole("status")).toHaveTextContent(/ended/i);
    expect(close).toHaveBeenCalledTimes(1);
    // Start is re-enabled to allow a fresh session after ending.
    expect(
      screen.getByRole("button", { name: /start assessment/i }),
    ).toBeEnabled();
  });

  it("sets status to error on connection timeout (15.6)", async () => {
    vi.useFakeTimers();
    // Connection never settles; only the timeout should fire.
    const createConnection: CreateConnection = () => new Promise(() => {});

    render(
      <App config={CONFIG} createConnection={createConnection} timeoutMs={50} />,
    );

    act(() => {
      screen.getByRole("button", { name: /start assessment/i }).click();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/error/i);
    expect(status).toHaveTextContent(/timed out/i);
    // Start is re-enabled so the user can retry.
    expect(
      screen.getByRole("button", { name: /start assessment/i }),
    ).toBeEnabled();
  });

  it("sets status to error and re-enables start on connection error (15.7)", async () => {
    const deferred = defer<AvatarConnection>();
    const createConnection: CreateConnection = vi.fn(() => deferred.promise);

    render(<App config={CONFIG} createConnection={createConnection} />);
    act(() => {
      screen.getByRole("button", { name: /start assessment/i }).click();
    });

    await act(async () => {
      deferred.reject(new Error("handshake failed"));
      await deferred.promise.catch(() => undefined);
    });

    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent(/error/i));
    expect(status).toHaveTextContent(/handshake failed/i);
    const start = screen.getByRole("button", { name: /start assessment/i });
    expect(start).toBeEnabled();
  });

  it("shows an error status and disables start when config is missing (15.9)", () => {
    render(<App config={null} createConnection={vi.fn()} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/error/i);
    expect(status).toHaveTextContent(/configuration/i);
    expect(
      screen.getByRole("button", { name: /start assessment/i }),
    ).toBeDisabled();
  });
});
