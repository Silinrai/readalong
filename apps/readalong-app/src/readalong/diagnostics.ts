// Readalong: on-device diagnostics, built in only when the build sets
// NEXT_PUBLIC_READALONG_DIAG=1 (a separate diagnostic APK). Logs every change
// to the reader's bars and open panel, with the code that made it, plus the
// page-turn layer's temporary hides. In the Android app the lines go through
// tauri-plugin-log to logcat (`adb logcat | grep ra-diag`); elsewhere to the
// console. Normal builds skip it all.
import { useReaderStore } from '@/store/readerStore';

export const DIAG_ENABLED = process.env['NEXT_PUBLIC_READALONG_DIAG'] === '1';

let installed = false;
const started = typeof performance !== 'undefined' ? performance.now() : 0;
let nativeWarn: ((message: string) => Promise<void>) | null = null;

/** One diagnostic line (no-op unless DIAG_ENABLED). */
export const diag = (message: string) => {
  if (!DIAG_ENABLED) return;
  const line = `[ra-diag] ${Math.round(performance.now() - started)}ms ${message}`;
  console.warn(line);
  void nativeWarn?.(line).catch(() => undefined);
};

const caller = () =>
  (new Error().stack ?? '')
    .split('\n')
    .slice(3, 8)
    .map((line) => line.trim().replace(/https?:\/\/[^/]+/g, ''))
    .join(' <- ');

export const installReadalongDiagnostics = () => {
  if (installed || !DIAG_ENABLED || typeof window === 'undefined') return;
  installed = true;
  void import('@tauri-apps/plugin-log')
    .then((log) => {
      nativeWarn = log.warn;
    })
    .catch(() => undefined);

  const { setHoveredBookKey, setBottomBarTab } = useReaderStore.getState();
  useReaderStore.setState({
    setHoveredBookKey: (key: string | null) => {
      diag(`bars ${key ? 'SHOW' : 'HIDE'} from: ${caller()}`);
      setHoveredBookKey(key);
    },
    setBottomBarTab: (tab: string) => {
      diag(`panel "${tab}" from: ${caller()}`);
      setBottomBarTab(tab);
    },
  });

  // Touches and taps reaching the reader from the book's frame.
  window.addEventListener('message', (event: MessageEvent) => {
    const type = (event.data as { type?: unknown } | null)?.type;
    if (typeof type === 'string' && /click|touch|tap|layered/i.test(type)) {
      diag(`message ${type}`);
    }
  });
  diag('diagnostics on');
};
