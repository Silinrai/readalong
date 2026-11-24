// Readalong: what a bookmark or highlight row shows besides Readalong's own:
// the kind of bookmark, where the narration was, the printed page (typed or
// estimated), and "Resume listening here" for a sentence saved while
// listening.
import { useState } from 'react';
import { MdHeadphones, MdMenuBook } from 'react-icons/md';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookConfig, useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { BookNote } from '@/types/book';
import { nextBooknoteStamp } from '@/utils/booknoteStamp';
import { eventDispatcher } from '@/utils/event';
import { resumeListeningAt } from './bookmarkSpoken';
import { canResumeListening, listeningLabel } from './listeningBookmark';
import { estimatePrintedPage, parsePrintedPage, printedPageLabel } from './printedPage';

/** Short text after the page and date: "Sentence · 12:34 · ~p. 212". */
export const NoteMeta: React.FC<{ bookKey: string; item: BookNote }> = ({ bookKey, item }) => {
  const _ = useTranslation();
  const config = useBookConfig(bookKey);
  // No page typed: estimate one from how far into the book it is, if the
  // reader told us the printed copy's page range.
  // The book's page count (Readalong's own pages): read once, not subscribed.
  const total = useBookDataStore.getState().getConfig(bookKey)?.progress?.[1];
  const estimate =
    item.printedPage == null && config?.printEdition && item.page && total
      ? estimatePrintedPage(item.page / total, config.printEdition)
      : null;
  const parts = [
    item.bookmarkKind === 'sentence'
      ? _('Sentence')
      : item.bookmarkKind === 'chapter'
        ? _('Chapter')
        : '',
    item.listening ? listeningLabel(item.listening) : '',
    item.printedPage != null
      ? printedPageLabel(item.printedPage, item.printedPageEstimated)
      : printedPageLabel(estimate, true),
  ].filter(Boolean);
  if (!parts.length) return null;
  return <span className='truncate text-sm text-gray-500 sm:text-xs'>{parts.join(' · ')}</span>;
};

export const NoteActions: React.FC<{ bookKey: string; item: BookNote; revealClass: string }> = ({
  bookKey,
  item,
  revealClass,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.printedPage != null ? String(item.printedPage) : '');

  const savePage = async () => {
    const page = parsePrintedPage(value);
    setEditing(false);
    if (page === undefined) return; // not a number: keep the old one
    const { getConfig, updateBooknotes, saveConfig } = useBookDataStore.getState();
    const notes = getConfig(bookKey)?.booknotes ?? [];
    const note = notes.find((n) => n.id === item.id);
    if (!note) return;
    note.printedPage = page;
    note.printedPageEstimated = false;
    note.updatedAt = nextBooknoteStamp(note);
    const config = updateBooknotes(bookKey, notes);
    if (config) await saveConfig(envConfig, bookKey, config, useSettingsStore.getState().settings);
  };

  const resume = async () => {
    const ok = await resumeListeningAt(bookKey, item);
    if (!ok) {
      eventDispatcher.dispatch('toast', {
        type: 'warning',
        message: _("Couldn't find that sentence on the page"),
        timeout: 3000,
      });
    }
  };

  const buttonClass = `btn btn-ghost btn-xs p-0 opacity-0 transition duration-300 ease-in-out hover:border-transparent hover:bg-transparent ${revealClass}`;

  return (
    <>
      {canResumeListening(item) && (
        <button
          type='button'
          onClick={() => void resume()}
          className={buttonClass}
          aria-label={_('Resume Listening Here')}
          title={_('Resume Listening Here')}
        >
          <MdHeadphones size={18} />
        </button>
      )}
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: opened by the reader's own tap
          autoFocus
          inputMode='numeric'
          aria-label={_('Printed Page')}
          className='input input-xs w-16'
          value={value}
          placeholder={_('Page')}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void savePage()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void savePage();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button
          type='button'
          onClick={() => setEditing(true)}
          className={buttonClass}
          aria-label={_('Printed Page')}
          title={_('Page in the printed book')}
        >
          <MdMenuBook size={18} />
        </button>
      )}
    </>
  );
};
