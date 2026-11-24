// Readalong: send the selected books to the PC to be voiced. The voices here
// are VoiceStudio's (the PC's), not the phone's read-aloud voices: they're
// listed from the PC and can be previewed before sending.
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { MdPause, MdPlayArrow } from 'react-icons/md';
import Dialog from '@/components/Dialog';
import { BoxedList } from '@/components/settings/primitives';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { type BookToSend, useAudiobookQueueStore } from './queueStore';
import { useQueueClient } from './useQueueConnection';

interface Props {
  isOpen: boolean;
  books: BookToSend[];
  onClose: () => void;
  /** Opens the queue screen (to connect a PC, or to watch the books). */
  onOpenQueue: () => void;
}

const GenerateAudiobooksDialog: React.FC<Props> = ({ isOpen, books, onClose, onOpenQueue }) => {
  const _ = useTranslation();
  const client = useQueueClient();
  const { profiles, loadProfiles, submit, error } = useAudiobookQueueStore();
  const [profile, setProfile] = useState('');
  const [priority, setPriority] = useState(0);
  const [sending, setSending] = useState(false);
  const [playing, setPlaying] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen && client) void loadProfiles(client);
  }, [isOpen, client, loadProfiles]);

  useEffect(() => {
    if (!profile && profiles.length) {
      setProfile((profiles.find((p) => p.default) ?? profiles[0])!.name);
    }
  }, [profiles, profile]);

  useEffect(() => {
    if (!isOpen) {
      audioRef.current?.pause();
      setPlaying('');
    }
  }, [isOpen]);

  const preview = (id: string) => {
    if (!client) return;
    if (playing === id) {
      audioRef.current?.pause();
      setPlaying('');
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(client.profileAudioUrl(id));
    audio.onended = () => setPlaying('');
    audioRef.current = audio;
    setPlaying(id);
    void audio.play().catch(() => setPlaying(''));
  };

  const send = async () => {
    if (!client || !books.length) return;
    setSending(true);
    audioRef.current?.pause();
    onClose();
    onOpenQueue();
    const result = await submit(client, books, profile, priority);
    setSending(false);
    eventDispatcher.dispatch('toast', {
      type: result.failed ? 'warning' : 'info',
      timeout: 5000,
      message: [
        result.created ? _('Sent to the PC: {{count}}', { count: result.created }) : '',
        result.existing ? _('Already in the queue: {{count}}', { count: result.existing }) : '',
        result.failed ? _('Not sent: {{count}}', { count: result.failed }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={_('Generate Audiobooks')}
      boxClassName='sm:min-w-[480px] sm:max-w-xl sm:h-[80vh]!'
    >
      <div className='space-y-5 px-1 pb-6 pt-2'>
        {!client ? (
          <div className='space-y-3'>
            <p className='text-sm'>{_('Connect to your PC first.')}</p>
            <button
              type='button'
              className='btn btn-primary min-h-11 w-full'
              onClick={() => {
                onClose();
                onOpenQueue();
              }}
            >
              {_('Set Up the PC')}
            </button>
          </div>
        ) : (
          <>
            <BoxedList title={_('Books ({{count}})', { count: books.length })}>
              <ul className='max-h-40 overflow-y-auto px-4 py-2 text-sm'>
                {books.map((b) => (
                  <li key={b.filename} className='truncate py-1'>
                    {b.title}
                  </li>
                ))}
              </ul>
            </BoxedList>

            <BoxedList
              title={_('PC Voice')}
              description={_(
                "VoiceStudio voices on your PC. They're separate from the phone's read-aloud voices.",
              )}
            >
              <div role='radiogroup' aria-label={_('PC Voice')} className='py-1'>
                {profiles.length === 0 && (
                  <p className='text-base-content/70 px-4 py-3 text-sm'>
                    {error || _('Loading voices from the PC…')}
                  </p>
                )}
                {profiles.map((p) => (
                  <div key={p.id} className='flex min-h-12 items-center gap-2 px-2'>
                    <label className='flex min-h-11 flex-1 cursor-pointer items-center gap-3 px-2'>
                      <input
                        type='radio'
                        name='pc-voice'
                        className='radio radio-sm radio-primary'
                        checked={profile === p.name}
                        onChange={() => setProfile(p.name)}
                      />
                      <span className='text-sm'>
                        {p.name}
                        {p.default && (
                          <span className='text-base-content/60 ms-2 text-xs'>{_('Default')}</span>
                        )}
                      </span>
                    </label>
                    <button
                      type='button'
                      className='hover:bg-base-content/10 inline-flex h-11 w-11 items-center justify-center rounded-full'
                      aria-label={
                        playing === p.id
                          ? _('Stop Preview')
                          : _('Preview {{name}}', { name: p.name })
                      }
                      onClick={() => preview(p.id)}
                    >
                      {playing === p.id ? <MdPause size={20} /> : <MdPlayArrow size={20} />}
                    </button>
                  </div>
                ))}
              </div>
            </BoxedList>

            <BoxedList title={_('Priority')}>
              <div role='radiogroup' aria-label={_('Priority')} className='flex gap-2 p-3'>
                {[
                  { value: 0, label: _('Normal') },
                  { value: 5, label: _('First in Line') },
                ].map((o) => (
                  <button
                    key={o.value}
                    type='button'
                    role='radio'
                    aria-checked={priority === o.value}
                    onClick={() => setPriority(o.value)}
                    className={clsx(
                      'min-h-11 flex-1 rounded-full border px-3 text-sm',
                      priority === o.value
                        ? 'border-primary bg-primary/15 eink:bg-base-content eink:text-base-100'
                        : 'border-base-content/20',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </BoxedList>

            <button
              type='button'
              className='btn btn-primary min-h-11 w-full'
              disabled={sending || !profile || !books.length}
              onClick={() => void send()}
            >
              {books.length === 1
                ? _('Send to the PC')
                : _('Send {{count}} Books to the PC', { count: books.length })}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
};

export default GenerateAudiobooksDialog;
