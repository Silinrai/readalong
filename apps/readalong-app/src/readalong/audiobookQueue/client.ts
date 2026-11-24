// Readalong: talks to the audiobook queue on the PC (poc/genqueue). Home
// Wi-Fi or Tailscale today; the PC answers on port 3910 and needs the pairing
// code it prints (`python -m genqueue code`).
//
// In the app, requests go out through tauri-plugin-http (from Rust), so
// Android's cleartext rule and CORS don't apply to a LAN address; the web
// build uses window.fetch (the PC sends CORS headers).
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import type { QueueJob, QueueSettings, QueueStatus, VoiceProfile } from './types';

export class QueueError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export const queueFetch = (): Fetch =>
  isTauriAppPlatform() ? (tauriFetch as unknown as Fetch) : window.fetch.bind(window);

/** "192.168.0.9" or "pc:3910" or a full URL -> "http://192.168.0.9:3910". */
export const normalizeQueueUrl = (input: string): string => {
  let url = input.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.port && parsed.protocol === 'http:') parsed.port = '3910';
    return parsed.origin;
  } catch {
    return url;
  }
};

export const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export class QueueClient {
  constructor(
    readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: Fetch = queueFetch(),
  ) {}

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
      });
    } catch (e) {
      throw new QueueError(
        controller.signal.aborted
          ? 'The PC did not answer in time'
          : `Can't reach the PC (${(e as Error).message || e})`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let message = `${response.status}`;
      try {
        message = ((await response.json()) as { error?: string }).error || message;
      } catch {
        // not JSON
      }
      throw new QueueError(message, response.status);
    }
    return (await response.json()) as T;
  }

  private post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** No pairing code needed: is anything there, and is VoiceStudio up? */
  async health(): Promise<{ ok: boolean; voicestudio: boolean; version: string }> {
    return this.request('/api/health');
  }

  status(): Promise<QueueStatus> {
    return this.request('/api/status');
  }

  async profiles(): Promise<VoiceProfile[]> {
    return (await this.request<{ profiles: VoiceProfile[] }>('/api/profiles', {}, 30000)).profiles;
  }

  profileAudioUrl(profileId: string): string {
    return `${this.baseUrl}/api/profiles/${encodeURIComponent(profileId)}/audio?token=${encodeURIComponent(this.token)}`;
  }

  coverUrl(jobId: string): string {
    return `${this.baseUrl}/api/jobs/${jobId}/cover?token=${encodeURIComponent(this.token)}`;
  }

  async lookup(sha256: string, profile: string): Promise<QueueJob | null> {
    const q = `sha256=${sha256}&profile=${encodeURIComponent(profile)}`;
    return (await this.request<{ job: QueueJob | null }>(`/api/lookup?${q}`)).job;
  }

  /** Send a book. A book the PC already has (same file, same voice) isn't
   *  sent again: the existing job comes back with `created: false`. */
  async submit(
    data: ArrayBuffer,
    filename: string,
    profile: string,
    priority = 0,
  ): Promise<{ job: QueueJob; created: boolean }> {
    const existing = await this.lookup(await sha256Hex(data), profile);
    if (existing && !['failed', 'cancelled'].includes(existing.state)) {
      return { job: existing, created: false };
    }
    return this.request(
      '/api/jobs',
      {
        method: 'POST',
        body: new Uint8Array(data),
        headers: {
          'Content-Type': 'application/epub+zip',
          // Headers are ASCII; the PC decodes these.
          'X-Filename': encodeURIComponent(filename),
          'X-Profile': encodeURIComponent(profile),
          'X-Priority': String(priority),
        },
      },
      10 * 60 * 1000,
    );
  }

  cancel = (id: string) => this.post<QueueStatus>(`/api/jobs/${id}/cancel`);
  retry = (id: string, force = false) => this.post<QueueStatus>(`/api/jobs/${id}/retry`, { force });
  setPriority = (id: string, priority: number) =>
    this.post<QueueStatus>(`/api/jobs/${id}/priority`, { priority });
  move = (id: string, to: 'top' | 'up' | 'down' | 'bottom') =>
    this.post<QueueStatus>(`/api/jobs/${id}/move`, { to });
  /** Remove a finished job from the list; its audiobook stays on the PC. */
  hide = (id: string) => this.post<QueueStatus>(`/api/jobs/${id}/hide`);
  pause = () => this.post<QueueStatus>('/api/queue/pause');
  resume = () => this.post<QueueStatus>('/api/queue/resume');
  cancelPending = () => this.post<QueueStatus>('/api/queue/cancel-pending');
  clearFinished = () => this.post<QueueStatus>('/api/queue/clear-finished');

  async updateSettings(changes: Partial<QueueSettings>): Promise<QueueSettings> {
    return (
      await this.request<{ settings: QueueSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(changes),
        headers: { 'Content-Type': 'application/json' },
      })
    ).settings;
  }

  /** The narrated EPUB of a finished job. */
  async download(id: string): Promise<ArrayBuffer> {
    const response = await this.fetcher(`${this.baseUrl}/api/jobs/${id}/download`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new QueueError(`Download failed (${response.status})`, response.status);
    return response.arrayBuffer();
  }
}
