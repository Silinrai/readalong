// Readalong: the printed copy the reader owns, for printed page numbers.
// Only the page range is needed for an estimate; editions differ, so the
// estimate is marked "~" and any note's page can be typed exactly instead.
import { useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookConfig, useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';

const PrintEditionEditor: React.FC<{ bookKey: string }> = ({ bookKey }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const config = useBookConfig(bookKey);
  const edition = config?.printEdition;
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(edition ? String(edition.firstPage) : '1');
  const [last, setLast] = useState(edition ? String(edition.lastPage) : '');
  const [error, setError] = useState('');

  const save = async () => {
    const firstPage = parseInt(first, 10);
    const lastPage = parseInt(last, 10);
    const { getConfig, setConfig, saveConfig } = useBookDataStore.getState();
    const current = getConfig(bookKey);
    if (!current) return;
    if (!last.trim()) {
      const next = { ...current, printEdition: undefined };
      setConfig(bookKey, next);
      await saveConfig(envConfig, bookKey, next, useSettingsStore.getState().settings);
      setOpen(false);
      return;
    }
    if (!(firstPage >= 0) || !(lastPage > firstPage)) {
      setError(_('The last page must come after the first.'));
      return;
    }
    const next = { ...current, printEdition: { ...current.printEdition, firstPage, lastPage } };
    setConfig(bookKey, next);
    await saveConfig(envConfig, bookKey, next, useSettingsStore.getState().settings);
    setError('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type='button'
        className='btn btn-ghost btn-sm min-h-9 justify-start'
        onClick={() => setOpen(true)}
      >
        {edition
          ? _('Printed copy: pages {{a}}–{{b}}', { a: edition.firstPage, b: edition.lastPage })
          : _('Add Printed Page Numbers')}
      </button>
    );
  }
  return (
    <div className='bg-base-200 eink:border eink:border-base-content flex flex-col gap-2 rounded-lg p-3'>
      <p className='text-base-content/75 text-xs'>
        {_(
          'The pages of the story in your printed copy. Printed page numbers are then estimated (~) for bookmarks and highlights; tap the book icon on one to type the exact page.',
        )}
      </p>
      <div
        className='flex flex-wrap items-center gap-2 text-sm'
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
        }}
      >
        <label className='flex items-center gap-1'>
          {_('First')}
          <input
            className='input input-sm w-20'
            inputMode='numeric'
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </label>
        <label className='flex items-center gap-1'>
          {_('Last')}
          <input
            className='input input-sm w-20'
            inputMode='numeric'
            value={last}
            placeholder='412'
            onChange={(e) => setLast(e.target.value)}
          />
        </label>
        <button
          type='button'
          className='btn btn-sm btn-primary min-h-9'
          onClick={() => void save()}
        >
          {_('Save')}
        </button>
      </div>
      {error && <p className='text-error text-xs'>{error}</p>}
    </div>
  );
};

export default PrintEditionEditor;
