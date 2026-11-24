// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReaderStore } from '@/store/readerStore';
import { useResetBottomBarOnHide } from '@/readalong/bottombar/useResetBottomBarOnHide';

describe('useResetBottomBarOnHide', () => {
  it('clears the open panel when the bars hide, so they reopen fresh', () => {
    renderHook(() => useResetBottomBarOnHide());
    act(() => {
      useReaderStore.getState().setHoveredBookKey('book');
      useReaderStore.getState().setBottomBarTab('font');
    });
    expect(useReaderStore.getState().bottomBarTab).toBe('font');
    act(() => useReaderStore.getState().setHoveredBookKey(''));
    expect(useReaderStore.getState().bottomBarTab).toBe('');
  });

  it('keeps the panel while the bars stay up', () => {
    renderHook(() => useResetBottomBarOnHide());
    act(() => {
      useReaderStore.getState().setHoveredBookKey('book');
      useReaderStore.getState().setBottomBarTab('color');
    });
    expect(useReaderStore.getState().bottomBarTab).toBe('color');
  });
});
