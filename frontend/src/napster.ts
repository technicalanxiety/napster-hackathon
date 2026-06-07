/**
 * Napster Web SDK / WebRTC connection integration for the Web_Frontend.
 *
 * The frontend opens a WebRTC connection to the assembled Advisor_Agent by
 * calling the Napster public API (`POST /public/agents/{agentId}/connections`
 * with `channelType: "webrtc"`), then mounts the agent's video avatar into a
 * DOM container (Requirements 15.2, 15.3).
 *
 * The connection flow is expressed through the {@link CreateConnection}
 * function type so the UI can depend on an injectable seam: production uses
 * {@link createWebRtcConnection} (real network + media), while tests supply a
 * fake that resolves, rejects, or never settles to exercise the lifecycle.
 */

import type { AppConfig } from "./config";

/** Base URL for the Napster Omniagent public API. */
export const NAPSTER_BASE_URL = "https://companion-api.napster.com";

/** Channel type requested when opening the avatar connection. */
export const WEBRTC_CHANNEL_TYPE = "webrtc";

/**
 * A live avatar connection. Once established, {@link mount} attaches the agent's
 * video media to a container element, and {@link close} tears the connection
 * down and releases its resources (Requirement 15.4).
 */
export interface AvatarConnection {
  /** Attach the agent video avatar to the given container element. */
  mount(container: HTMLElement): void;
  /** Terminate the session and release the underlying connection. */
  close(): void;
}

/** Options passed to a {@link CreateConnection} implementation. */
export interface CreateConnectionOptions {
  /** Aborted when the caller cancels (e.g. 30s timeout or end control). */
  readonly signal: AbortSignal;
  /** Injectable fetch implementation (defaults to global `fetch`). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Opens an avatar connection for the given configuration. Resolves with an
 * {@link AvatarConnection} once the WebRTC channel is established, or rejects if
 * the connection cannot be opened.
 */
export type CreateConnection = (
  config: AppConfig,
  options: CreateConnectionOptions,
) => Promise<AvatarConnection>;

/**
 * Shape of the connection-creation response from the Napster API. Only the
 * fields the frontend reads are modeled; the platform may return more.
 */
interface ConnectionResponse {
  /** Identifier of the created connection, used for teardown bookkeeping. */
  readonly id?: string;
  /** Live media stream URL the avatar renders from, when provided. */
  readonly mediaUrl?: string;
}

/**
 * Default production connection factory. Calls the Napster public API to open a
 * WebRTC connection for the configured agent and returns a connection that
 * mounts the avatar video into the page container.
 *
 * The returned {@link AvatarConnection} owns a `<video>` element created on
 * {@link AvatarConnection.mount} and removed on {@link AvatarConnection.close}.
 * The Napster Web SDK performs the underlying media negotiation; this module
 * provides the API call, the avatar container wiring, and lifecycle teardown.
 */
export const createWebRtcConnection: CreateConnection = async (
  config,
  { signal, fetchImpl = fetch },
) => {
  const response = await fetchImpl(
    `${NAPSTER_BASE_URL}/public/agents/${config.agentId}/connections`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify({ channelType: WEBRTC_CHANNEL_TYPE }),
      signal,
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Failed to open avatar connection (HTTP ${response.status})${
        detail ? `: ${detail}` : ""
      }`,
    );
  }

  const session = (await response.json()) as ConnectionResponse;
  return createMediaConnection(session);
};

/**
 * Build an {@link AvatarConnection} backed by a `<video>` element. Factored out
 * so the media-mounting behavior is shared and the network call in
 * {@link createWebRtcConnection} stays focused on transport.
 */
function createMediaConnection(session: ConnectionResponse): AvatarConnection {
  let video: HTMLVideoElement | null = null;

  return {
    mount(container: HTMLElement) {
      const element = document.createElement("video");
      element.autoplay = true;
      element.playsInline = true;
      element.className = "avatar-video";
      if (session.mediaUrl) {
        element.src = session.mediaUrl;
      }
      container.appendChild(element);
      video = element;
    },
    close() {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.remove();
        video = null;
      }
    },
  };
}
