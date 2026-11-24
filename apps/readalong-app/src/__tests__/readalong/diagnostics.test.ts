import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('installReadalongDiagnostics', () => {
  it('does nothing in a normal build', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { installReadalongDiagnostics } = await import('@/readalong/diagnostics');
    const { useReaderStore } = await import('@/store/readerStore');
    installReadalongDiagnostics();
    useReaderStore.getState().setHoveredBookKey('book');
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs bar and panel changes in a diagnostic build', async () => {
    vi.stubEnv('NEXT_PUBLIC_READALONG_DIAG', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { installReadalongDiagnostics } = await import('@/readalong/diagnostics');
    const { useReaderStore } = await import('@/store/readerStore');
    installReadalongDiagnostics();
    useReaderStore.getState().setHoveredBookKey('book');
    useReaderStore.getState().setBottomBarTab('color');
    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('bars SHOW'))).toBe(true);
    expect(lines.some((line) => line.includes('panel "color"'))).toBe(true);
    expect(useReaderStore.getState().hoveredBookKey).toBe('book');
  });
});
