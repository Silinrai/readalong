// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

describe('the upstream block', () => {
  it('refuses requests to the upstream servers and lets everything else through', async () => {
    const real = vi.fn(async () => new Response('ok'));
    window.fetch = real as unknown as typeof fetch;
    const { installUpstreamBlock } = await import('@/readalong/upstream');
    installUpstreamBlock();
    await expect(window.fetch('https://web.readalong.invalid/api/user')).rejects.toThrow(
      /doesn't use this online service/,
    );
    expect(real).not.toHaveBeenCalled();
    await window.fetch('http://thestation:3910/api/health');
    expect(real).toHaveBeenCalledTimes(1);
  });
});
