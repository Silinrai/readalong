// Readalong: the audiobook-queue dialogs, mounted once on the library page,
// plus the background import of finished audiobooks.
import type { SelectedFile } from '@/hooks/useFileSelector';
import AudiobookQueueDialog from './AudiobookQueueDialog';
import GenerateAudiobooksDialog from './GenerateAudiobooksDialog';
import { useQueueUi } from './queueUi';
import { useAudiobookAutoImport } from './useQueueConnection';

type ImportBooks = (
  files: SelectedFile[],
  groupId?: string,
  options?: { silent?: boolean },
) => Promise<{ importedCount: number; failedPaths: string[] }>;

const QueueDialogs: React.FC<{ libraryLoaded: boolean; importBooks: ImportBooks }> = ({
  libraryLoaded,
  importBooks,
}) => {
  const { queueOpen, generateBooks, openQueue, closeQueue, closeGenerate } = useQueueUi();
  useAudiobookAutoImport(libraryLoaded, importBooks);
  return (
    <>
      <AudiobookQueueDialog isOpen={queueOpen} onClose={closeQueue} />
      <GenerateAudiobooksDialog
        isOpen={!!generateBooks}
        books={generateBooks ?? []}
        onClose={closeGenerate}
        onOpenQueue={openQueue}
      />
    </>
  );
};

export default QueueDialogs;
