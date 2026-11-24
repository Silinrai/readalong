// Readalong: the upstream app's own online services, switched off in this
// fork. Its updater and release notes would offer the original app's
// releases, its analytics would report to the original project's server, and
// its account, cloud sync, share links, "send by email", uploads, metadata
// search and web relays all run on the original project's servers. Nothing
// there is the user's. Integrations with the user's own servers (KOSync,
// OPDS catalogues, WebDAV, Google Drive, OneDrive, Audiobookshelf, Notion…)
// talk to those servers directly from the app and keep working.

/** Check for, download or announce new versions of the app. */
export const UPSTREAM_UPDATES = false;

/** Usage analytics (PostHog) and the consent prompt asking for it. */
export const UPSTREAM_TELEMETRY = false;

/** Account, cloud sync, sharing, send-by-email, uploads and web relays. */
export const UPSTREAM_ONLINE = false;

// The upstream servers' addresses now end in ".invalid" (a reserved name that
// never resolves); blocking them here makes any leftover call fail fast.
const UPSTREAM_HOST = /(^|\.)readalong\.invalid$/i;

/** Does this URL point at the upstream project's servers? */
export const isUpstreamUrl = (url: string | URL): boolean => {
  try {
    const host = (typeof url === 'string' ? new URL(url, 'http://local.invalid') : url).hostname;
    return UPSTREAM_HOST.test(host);
  } catch {
    return false;
  }
};

/** Book menu entries that need the upstream account (removed while off). */
export const UPSTREAM_BOOK_ACTIONS = new Set(['upload', 'share']);

export class UpstreamBlockedError extends Error {
  constructor(url: string) {
    super(`Readalong doesn't use this online service (${new URL(url).hostname})`);
    this.name = 'UpstreamBlockedError';
  }
}

let installed = false;

/**
 * Refuse every request and socket to the upstream servers, wherever in the
 * code it starts: one place, so a corner missed in the UI still can't reach
 * them. Native (Rust-side) fetches go through tauri-plugin-http, which the
 * app wraps the same way (see queueFetch / httpFetch callers).
 */
export const installUpstreamBlock = () => {
  if (UPSTREAM_ONLINE || installed || typeof window === 'undefined') return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isUpstreamUrl(url)) {
      console.info('[readalong] blocked upstream request', new URL(url).hostname);
      return Promise.reject(new UpstreamBlockedError(url));
    }
    return realFetch(input, init);
  };
  const RealSocket = window.WebSocket;
  if (RealSocket) {
    window.WebSocket = class extends RealSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        if (isUpstreamUrl(url)) throw new UpstreamBlockedError(String(url));
        super(url, protocols);
      }
    } as typeof WebSocket;
  }
};
