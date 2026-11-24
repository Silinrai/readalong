import { describe, expect, it } from 'vitest';
import {
  UPSTREAM_BOOK_ACTIONS,
  UPSTREAM_ONLINE,
  UPSTREAM_TELEMETRY,
  UPSTREAM_UPDATES,
  isUpstreamUrl,
} from '@/readalong/upstream';

describe('upstream services are off in Readalong', () => {
  it('switches off updates, analytics and the online account', () => {
    expect([UPSTREAM_UPDATES, UPSTREAM_TELEMETRY, UPSTREAM_ONLINE]).toEqual([false, false, false]);
    expect([...UPSTREAM_BOOK_ACTIONS].sort()).toEqual(['share', 'upload']);
  });

  it('recognises the upstream servers and nothing else', () => {
    expect(isUpstreamUrl('https://web.readalong.invalid/api/sync')).toBe(true);
    expect(isUpstreamUrl('https://node.readalong.invalid/api/opds/proxy')).toBe(true);
    expect(isUpstreamUrl('wss://readalong.invalid/x')).toBe(true);
    expect(isUpstreamUrl('https://notreadalong.invalid/')).toBe(false);
    expect(isUpstreamUrl('https://speech.platform.bing.com/x')).toBe(false);
    expect(isUpstreamUrl('http://thestation:3910/api/status')).toBe(false);
    expect(isUpstreamUrl('/api/local')).toBe(false);
  });
});
