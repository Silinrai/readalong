import { useEffect, useState } from 'react';
import Image from 'next/image';
import { invoke } from '@tauri-apps/api/core';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { isTauriAppPlatform } from '@/services/environment';
import { parseWebViewInfo } from '@/utils/ua';
import { getAppVersion } from '@/utils/version';
import { writeTextToClipboard } from '@/utils/clipboard';
import { eventDispatcher } from '@/utils/event';
import Dialog from './Dialog';
import Link from './Link';

export const setAboutDialogVisible = (visible: boolean) => {
  const dialog = document.getElementById('about_window');
  if (dialog) {
    const event = new CustomEvent('setDialogVisibility', {
      detail: { visible },
    });
    dialog.dispatchEvent(event);
  }
};

// Readalong: About shows Readalong only. No update check (the upstream
// updater would offer the original app's releases), no upstream community or
// legal links. What stays is the notice AGPL-3.0 section 5 requires of a
// modified version: that it is modified, from what, under which licence.
export const AboutWindow = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [browserInfo, setBrowserInfo] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setBrowserInfo(parseWebViewInfo(appService));

    // The User-Agent is reduced to a stub on Windows WebView2, so ask the
    // Rust side for the runtime's real version and upgrade the label when it
    // answers.
    let cancelled = false;
    if (isTauriAppPlatform()) {
      invoke<{ engine: string; version: string } | null>('get_webview_version')
        .then((info) => {
          if (info && !cancelled) setBrowserInfo(`${info.engine} ${info.version}`);
        })
        .catch((error) => {
          if (!cancelled) {
            console.warn('[AboutWindow] get_webview_version failed:', error);
          }
        });
    }

    const handleCustomEvent = (event: CustomEvent) => {
      setIsOpen(event.detail.visible);
    };

    const el = document.getElementById('about_window');
    if (el) {
      el.addEventListener('setDialogVisibility', handleCustomEvent as EventListener);
    }

    return () => {
      cancelled = true;
      if (el) {
        el.removeEventListener('setDialogVisibility', handleCustomEvent as EventListener);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const versionInfo = `${_('Version {{version}}', { version: getAppVersion() })} (${browserInfo})`;

  // Tapping the version copies it (mobile users can't select text).
  const handleCopyVersion = async () => {
    const copied = await writeTextToClipboard(`Readalong ${getAppVersion()} (${browserInfo})`);
    if (!copied) return;
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _('Copied to clipboard'),
      className: 'whitespace-nowrap',
      timeout: 2000,
    });
  };

  return (
    <Dialog
      id='about_window'
      isOpen={isOpen}
      title={_('About Readalong')}
      onClose={() => setIsOpen(false)}
      boxClassName='sm:w-[480px]! sm:max-w-(--breakpoint-sm)! sm:h-auto'
    >
      {isOpen && (
        <div className='about-content flex flex-col items-center justify-center gap-4 pb-10 sm:pb-0'>
          <div className='flex flex-1 flex-col items-center justify-end gap-2 px-8 py-2'>
            <div className='mb-2 mt-6'>
              <Image src='/icon.png' alt='' className='h-20 w-20' width={64} height={64} />
            </div>
            <div className='flex select-text flex-col items-center'>
              <h2 className='mb-2 text-2xl font-bold'>Readalong</h2>
              <button
                type='button'
                title={_('Copy')}
                className='text-neutral-content text-center text-sm'
                onClick={handleCopyVersion}
              >
                {versionInfo}
              </button>
            </div>
          </div>

          <hr aria-hidden='true' className='border-base-300 my-12 w-full sm:my-4' />

          {/* Legal notice (AGPL-3.0 §5): kept short, in English like the licence. */}
          <div
            className='flex flex-1 flex-col items-center justify-start gap-2 px-6 pb-6 text-center'
            dir='ltr'
          >
            <p className='text-neutral-content text-xs'>
              Readalong is a modified version of Readest, © Bilingify LLC. Modified 2026.
            </p>
            <p className='text-neutral-content text-xs'>
              Licensed under the{' '}
              <Link
                href='https://www.gnu.org/licenses/agpl-3.0.html'
                className='text-blue-500 underline'
              >
                GNU Affero General Public License v3.0
              </Link>
              . Original source:{' '}
              <Link href='https://github.com/readest/readest' className='text-blue-500 underline'>
                github.com/readest/readest
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
};
