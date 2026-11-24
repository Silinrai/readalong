// Readalong: above the bookmarks / annotations list: order (book order, by
// chapter; newest; oldest), and for bookmarks which kind, plus a way to
// bookmark the current chapter.
import clsx from 'clsx';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { bookmarkCurrentChapter } from './bookmarkSpoken';
import PrintEditionEditor from './PrintEditionEditor';
import type { BookmarkKindFilter, NoteSort } from './listing';

interface Props {
  bookKey: string;
  type: 'bookmark' | 'annotation';
  sort: NoteSort;
  onSortChange: (sort: NoteSort) => void;
  kind: BookmarkKindFilter;
  onKindChange: (kind: BookmarkKindFilter) => void;
}

const Chip: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({
  selected,
  onClick,
  children,
}) => (
  <button
    type='button'
    role='radio'
    aria-checked={selected}
    onClick={onClick}
    className={clsx(
      'min-h-9 rounded-full border px-3 text-xs',
      'focus-visible:ring-primary outline-none focus-visible:ring-2',
      selected
        ? 'border-primary bg-primary/15 eink:bg-base-content eink:text-base-100'
        : 'border-base-content/20 text-base-content/80',
    )}
  >
    {children}
  </button>
);

const ListControls: React.FC<Props> = ({
  bookKey,
  type,
  sort,
  onSortChange,
  kind,
  onKindChange,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const sorts: { value: NoteSort; label: string }[] = [
    { value: 'position', label: _('In Book Order') },
    { value: 'newest', label: _('Newest') },
    { value: 'oldest', label: _('Oldest') },
  ];
  const kinds: { value: BookmarkKindFilter; label: string }[] = [
    { value: 'all', label: _('All') },
    { value: 'page', label: _('Pages') },
    { value: 'chapter', label: _('Chapters') },
    { value: 'sentence', label: _('Sentences') },
  ];
  return (
    <div className='flex flex-col gap-2 px-2 pb-2'>
      <div role='radiogroup' aria-label={_('Order')} className='flex flex-wrap gap-1.5'>
        {sorts.map((s) => (
          <Chip key={s.value} selected={sort === s.value} onClick={() => onSortChange(s.value)}>
            {s.label}
          </Chip>
        ))}
      </div>
      <PrintEditionEditor bookKey={bookKey} />
      {type === 'bookmark' && (
        <>
          <div role='radiogroup' aria-label={_('Bookmark Kind')} className='flex flex-wrap gap-1.5'>
            {kinds.map((k) => (
              <Chip key={k.value} selected={kind === k.value} onClick={() => onKindChange(k.value)}>
                {k.label}
              </Chip>
            ))}
          </div>
          <button
            type='button'
            className='btn btn-ghost btn-sm min-h-9 justify-start'
            onClick={async () => {
              const note = await bookmarkCurrentChapter(envConfig, bookKey);
              eventDispatcher.dispatch('toast', {
                type: 'info',
                message: note ? _('Chapter bookmarked') : _('This chapter is already bookmarked'),
                timeout: 2500,
              });
            }}
          >
            {_('Bookmark This Chapter')}
          </button>
        </>
      )}
    </div>
  );
};

export default ListControls;
