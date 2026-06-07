//! Thin HTTP client for the Napster Omniagent public API.
//!
//! Wraps the `https://companion-api.napster.com` endpoints used during agent
//! assembly, attaching the `X-Api-Key` header and surfacing non-2xx responses
//! as typed errors. The client deliberately knows nothing about the specific
//! payload shapes — those are built by `config.ts` — so it stays a reusable
//! transport layer.

/** Default base URL for the Napster public API. */
export const NAPSTER_BASE_URL = "https://companion-api.napster.com";

/** Error thrown when a Napster API request returns a non-2xx status. */
export class NapsterApiError extends Error {
  /**
   * @param status The HTTP status code returned by the API.
   * @param path The request path that failed.
   * @param body The raw response body, useful for diagnosis.
   */
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Napster API ${status} for ${path}: ${body}`);
    this.name = "NapsterApiError";
  }
}

/** Configuration for a {@link NapsterClient} instance. */
export interface NapsterClientConfig {
  /** API key sent as the `X-Api-Key` header. */
  apiKey: string;
  /** Override the base URL (defaults to {@link NAPSTER_BASE_URL}). */
  baseUrl?: string;
  /** Injectable fetch implementation (defaults to global `fetch`); aids testing. */
  fetchImpl?: typeof fetch;
}

/**
 * A minimal authenticated client over the Napster public API.
 *
 * Exposes JSON POST and multipart file-upload helpers. Every response is
 * checked for success; failures raise {@link NapsterApiError}.
 */
export class NapsterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: NapsterClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? NAPSTER_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * POST a JSON body to a path and parse the JSON response.
   *
   * @param path API path beginning with `/` (e.g. `/public/companions`).
   * @param body The request body, serialized as JSON.
   * @returns The parsed JSON response typed as `T`.
   */
  async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
      },
      body: JSON.stringify(body),
    });
    return this.parse<T>(response, path);
  }

  /**
   * Upload a single file to a path as `multipart/form-data`.
   *
   * Used to attach the governance framework document to a knowledge base via
   * `POST /public/knowledge-bases/{id}/files`.
   *
   * @param path API path for the file upload.
   * @param fileName The file name reported to the API.
   * @param contents The file contents.
   * @param contentType The MIME type of the file.
   * @returns The parsed JSON response typed as `T`.
   */
  async postFile<T>(
    path: string,
    fileName: string,
    contents: string,
    contentType: string,
  ): Promise<T> {
    const form = new FormData();
    form.append("file", new Blob([contents], { type: contentType }), fileName);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey },
      body: form,
    });
    return this.parse<T>(response, path);
  }

  /** Validate the response status and parse its JSON body, or throw. */
  private async parse<T>(response: Response, path: string): Promise<T> {
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new NapsterApiError(response.status, path, text);
    }
    return (await response.json()) as T;
  }
}
