// Readalong: Audiobook Queue. The books the PC is voicing with VoiceStudio,
// managed from the phone: what's running, what's waiting, how far along each
// is (counted by the PC) and how long it may take (estimated, and said so).
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import {
  MdArrowDownward,
  MdArrowUpward,
  MdCancel,
  MdClose,
  MdDeleteSweep,
  MdPause,
  MdPlayArrow,
  MdRefresh,
  MdReplay,
  MdVerticalAlignTop,
} from 'react-icons/md';
import Dialog from '@/components/Dialog';
import {
  BoxedList,
  SettingsInput,
  SettingsRow,
  SettingsSwitchRow,
} from '@/components/settings/primitives';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { saveSysSettings } from '@/helpers/settings';
import { useSettingsStore } from '@/store/settingsStore';
import { QueueClient, normalizeQueueUrl } from './client';
import {
  actualLine,
  elapsedLine,
  estimateLine,
  overallLine,
  stateLabel,
  stateTone,
  summaryLine,
  type Tone,
} from './format';
import { useAudiobookQueueStore } from './queueStore';
import { FINISHED_STATES, QUEUED_STATES, type QueueJob } from './types';
import { useQueueClient } from './useQueueConnection';

const POLL_MS = 5000;

const toneClass: Record<Tone, string> = {
  neutral: 'bg-base-content/10 text-base-content/80',
  active: 'bg-primary/15 text-primary',
  done: 'bg-success/15 text-success',
  warn: 'bg-warning/20 text-warning-content',
  error: 'bg-error/15 text-error',
};

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    type='button'
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className='hover:bg-base-content/10 focus-visible:ring-primary inline-flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 disabled:opacity-40'
  >
    {children}
  </button>
);

const ConnectForm: React.FC<{ onConnected: () => void }> = ({ onConnected }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const [url, setUrl] = useState(settings.audiobookQueueUrl ?? '');
  const [token, setToken] = useState(settings.audiobookQueueToken ?? '');
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);

  const connect = async () => {
    const base = normalizeQueueUrl(url);
    if (!base || !token.trim()) {
      setMessage(_('Enter the PC address and its pairing code.'));
      return;
    }
    setTesting(true);
    setMessage('');
    try {
      const client = new QueueClient(base, token.trim());
      await client.status();
      await saveSysSettings(envConfig, 'audiobookQueueUrl', base);
      await saveSysSettings(envConfig, 'audiobookQueueToken', token.trim());
      onConnected();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <p className='text-base-content/75 px-1 text-sm'>
        {_(
          'Connect to the PC that voices your books, through Tailscale: the address is the PC name in the Tailscale app. On the PC, read the pairing code with: python -m genqueue code',
        )}
      </p>
      <BoxedList title={_('PC')}>
        <SettingsRow label={_('Address')} asLabel>
          <SettingsInput
            value={url}
            placeholder={_('PC name on Tailscale')}
            onChange={(e) => setUrl(e.target.value)}
            inputMode='url'
            autoCapitalize='off'
            autoCorrect='off'
            spellCheck={false}
          />
        </SettingsRow>
        <SettingsRow label={_('Pairing Code')} asLabel>
          <SettingsInput
            value={token}
            placeholder={_('From the PC')}
            onChange={(e) => setToken(e.target.value)}
            autoCapitalize='off'
            autoCorrect='off'
            spellCheck={false}
          />
        </SettingsRow>
      </BoxedList>
      {message && (
        <p role='alert' className='text-error px-1 text-sm'>
          {message}
        </p>
      )}
      <button
        type='button'
        className='btn btn-primary min-h-11 w-full'
        disabled={testing}
        onClick={() => void connect()}
      >
        {testing ? _('Connecting…') : _('Connect')}
      </button>
    </div>
  );
};

const JobRow: React.FC<{ job: QueueJob; client: QueueClient; busy: boolean }> = ({
  job,
  client,
  busy,
}) => {
  const _ = useTranslation();
  const act = useAudiobookQueueStore((s) => s.act);
  const queued = QUEUED_STATES.includes(job.state);
  const finished = FINISHED_STATES.includes(job.state);
  const pct = job.progress.actual.percent;
  const detail = [actualLine(_, job.progress, job.state), elapsedLine(_, job)]
    .filter(Boolean)
    .join(' · ');
  const estimate = estimateLine(_, job.progress, job.state);
  return (
    <li className='border-base-content/10 flex gap-3 border-b px-3 py-3 last:border-b-0'>
      <div className='bg-base-content/10 h-20 w-14 shrink-0 overflow-hidden rounded'>
        {job.has_cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.coverUrl(job.id)} alt='' className='h-full w-full object-cover' />
        )}
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex items-start gap-2'>
          <div className='min-w-0 flex-1'>
            <p className='line-clamp-2 text-sm font-medium'>{job.title}</p>
            {job.author && <p className='text-base-content/60 truncate text-xs'>{job.author}</p>}
          </div>
          <span
            className={clsx(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              toneClass[stateTone(job.state)],
            )}
          >
            {stateLabel(_, job.state)}
          </span>
        </div>
        {pct != null && job.state !== 'completed' && (
          <div
            className='bg-base-content/10 mt-2 h-1.5 overflow-hidden rounded-full'
            role='progressbar'
            aria-valuenow={Math.floor(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={_('Voicing progress')}
          >
            <div className='bg-primary h-full' style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className='text-base-content/70 mt-1.5 text-xs'>
          {[
            queued && job.queue_position ? _('#{{n}} in queue', { n: job.queue_position }) : '',
            detail,
            job.stage_note,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {estimate && <p className='text-base-content/60 text-xs italic'>{estimate}</p>}
        {job.error && <p className='text-error mt-1 text-xs'>{job.error}</p>}
        <div className='-ms-2 mt-1 flex flex-wrap'>
          {queued && (
            <>
              <IconButton
                label={_('Move to Top')}
                disabled={busy}
                onClick={() => void act(client, () => client.move(job.id, 'top'))}
              >
                <MdVerticalAlignTop size={20} />
              </IconButton>
              <IconButton
                label={_('Move Up')}
                disabled={busy}
                onClick={() => void act(client, () => client.move(job.id, 'up'))}
              >
                <MdArrowUpward size={20} />
              </IconButton>
              <IconButton
                label={_('Move Down')}
                disabled={busy}
                onClick={() => void act(client, () => client.move(job.id, 'down'))}
              >
                <MdArrowDownward size={20} />
              </IconButton>
            </>
          )}
          {!finished && (
            <IconButton
              label={_('Cancel')}
              disabled={busy}
              onClick={() => void act(client, () => client.cancel(job.id))}
            >
              <MdCancel size={20} />
            </IconButton>
          )}
          {(job.state === 'failed' || job.state === 'cancelled') && (
            <IconButton
              label={_('Retry')}
              disabled={busy}
              onClick={() => void act(client, () => client.retry(job.id))}
            >
              <MdReplay size={20} />
            </IconButton>
          )}
          {finished && (
            <IconButton
              label={_('Remove from List')}
              disabled={busy}
              onClick={() => void act(client, () => client.hide(job.id))}
            >
              <MdClose size={20} />
            </IconButton>
          )}
        </div>
      </div>
    </li>
  );
};

const PcSettings: React.FC<{ client: QueueClient }> = ({ client }) => {
  const _ = useTranslation();
  const { status, act } = useAudiobookQueueStore();
  const s = status?.settings;
  const [hours, setHours] = useState((s?.windows ?? []).join(', '));
  useEffect(() => setHours((s?.windows ?? []).join(', ')), [s?.windows]);
  if (!s) return null;
  const saveHours = () => {
    const windows = hours
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);
    void act(client, () => client.updateSettings({ windows }));
  };
  return (
    <BoxedList
      title={_('On the PC')}
      description={_(
        'One book is voiced at a time: VoiceStudio runs one voice model on the graphics card.',
      )}
    >
      <SettingsSwitchRow
        label={_('Pause While the PC Is in Use')}
        description={_('Waits until nobody has touched the PC for {{n}} minutes.', {
          n: s.idle_minutes,
        })}
        checked={s.pause_when_in_use}
        onChange={() =>
          void act(client, () => client.updateSettings({ pause_when_in_use: !s.pause_when_in_use }))
        }
      />
      <SettingsSwitchRow
        label={_('Gentle on the PC')}
        description={_('Runs VoiceStudio at lower priority so other programs stay responsive.')}
        checked={s.priority !== 'normal'}
        onChange={() =>
          void act(client, () =>
            client.updateSettings({
              priority: s.priority === 'normal' ? 'below_normal' : 'normal',
            }),
          )
        }
      />
      <SettingsRow
        label={_('Processing Hours')}
        description={_('Empty for any time. Several ranges: 22:00-07:00, 12:00-13:00')}
        asLabel
      >
        <SettingsInput
          value={hours}
          placeholder='22:00-07:00'
          onChange={(e) => setHours(e.target.value)}
          onBlur={saveHours}
        />
      </SettingsRow>
    </BoxedList>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AudiobookQueueDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const _ = useTranslation();
  const client = useQueueClient();
  const { status, error, uploads, busy, updatedAt, refresh, act } = useAudiobookQueueStore();
  const [editing, setEditing] = useState(false);
  const [, tick] = useState(0);

  const poll = useCallback(() => {
    if (client) void refresh(client);
  }, [client, refresh]);

  useEffect(() => {
    if (!isOpen || !client) return;
    poll();
    const timer = setInterval(() => {
      poll();
      tick((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isOpen, client, poll]);

  const showConnect = !client || editing;
  const jobs = status?.jobs ?? [];
  const finishedCount = jobs.filter((j) => FINISHED_STATES.includes(j.state)).length;
  const waitingCount = jobs.filter((j) => QUEUED_STATES.includes(j.state)).length;
  const stale = updatedAt && Date.now() - updatedAt > 3 * POLL_MS;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={_('Audiobook Queue')}
      boxClassName='sm:min-w-[520px] sm:max-w-2xl sm:h-[85vh]!'
      useOverlayScroll
    >
      <div className='space-y-5 px-1 pb-6 pt-2'>
        {showConnect ? (
          <ConnectForm onConnected={() => setEditing(false)} />
        ) : (
          client && (
            <>
              <section aria-live='polite' className='space-y-1 px-1'>
                {status && (
                  <>
                    <p className='text-sm font-medium'>{summaryLine(_, status.summary)}</p>
                    <p className='text-base-content/70 text-sm'>{overallLine(_, status.summary)}</p>
                    {(status.paused || status.gate) && (
                      <p className='text-warning-content bg-warning/20 mt-2 rounded-lg px-3 py-2 text-sm'>
                        {status.paused ? _('Queue paused') : status.gate}
                      </p>
                    )}
                  </>
                )}
                {error && (
                  <p role='alert' className='text-error text-sm'>
                    {stale || !status ? _("Can't reach the PC: {{error}}", { error }) : error}
                  </p>
                )}
              </section>

              <div className='flex flex-wrap gap-1'>
                {status?.paused ? (
                  <button
                    type='button'
                    className='btn btn-sm min-h-11 gap-1'
                    disabled={busy}
                    onClick={() => void act(client, () => client.resume())}
                  >
                    <MdPlayArrow size={18} /> {_('Resume Queue')}
                  </button>
                ) : (
                  <button
                    type='button'
                    className='btn btn-sm min-h-11 gap-1'
                    disabled={busy || !status}
                    onClick={() => void act(client, () => client.pause())}
                  >
                    <MdPause size={18} /> {_('Pause Queue')}
                  </button>
                )}
                {waitingCount > 0 && (
                  <button
                    type='button'
                    className='btn btn-sm btn-ghost min-h-11 gap-1'
                    disabled={busy}
                    onClick={() => void act(client, () => client.cancelPending())}
                  >
                    <MdCancel size={18} /> {_('Cancel Waiting Books')}
                  </button>
                )}
                {finishedCount > 0 && (
                  <button
                    type='button'
                    className='btn btn-sm btn-ghost min-h-11 gap-1'
                    disabled={busy}
                    onClick={() => void act(client, () => client.clearFinished())}
                  >
                    <MdDeleteSweep size={18} /> {_('Clear Finished')}
                  </button>
                )}
                <button
                  type='button'
                  className='btn btn-sm btn-ghost min-h-11 gap-1'
                  onClick={poll}
                  aria-label={_('Refresh')}
                >
                  <MdRefresh size={18} />
                </button>
              </div>

              {(uploads.length > 0 || jobs.length > 0) && (
                <ul className='bg-base-200 eink:border eink:border-base-content rounded-xl'>
                  {uploads.map((u) => (
                    <li
                      key={u.key}
                      className='border-base-content/10 flex items-center gap-3 border-b px-3 py-3'
                    >
                      <span className='min-w-0 flex-1 truncate text-sm'>{u.title}</span>
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          toneClass[u.state === 'failed' ? 'error' : 'active'],
                        )}
                        title={u.error}
                      >
                        {u.state === 'failed' ? _('Upload failed') : _('Uploading')}
                      </span>
                    </li>
                  ))}
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} client={client} busy={busy} />
                  ))}
                </ul>
              )}
              {status && jobs.length === 0 && uploads.length === 0 && (
                <p className='text-base-content/70 px-1 text-sm'>
                  {_(
                    'Nothing in the queue. Select books in your library and choose Audiobook to send them here.',
                  )}
                </p>
              )}

              <PcSettings client={client} />

              <button
                type='button'
                className='btn btn-ghost btn-sm min-h-11'
                onClick={() => setEditing(true)}
              >
                {_('Change PC ({{url}})', { url: client.baseUrl })}
              </button>
            </>
          )
        )}
      </div>
    </Dialog>
  );
};

export default AudiobookQueueDialog;
