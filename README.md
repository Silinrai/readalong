# Readalong

An ebook reader that is also an audiobook. Readalong reads EPUBs and plays
their narration in sync with the text: the sentence being spoken is
highlighted and the page follows along. Narration comes either from the
phone's own voices or from audiobooks your PC voices with
[VoiceStudio](#voicing-books-on-your-pc), and those keep working offline.

Built for Android (tested on a Galaxy Z Fold 7: two pages unfolded, one
folded), with the same code running on desktop and the web.

## What it does

- **Read along:** narration starts at the top of the page, the spoken
  sentence is highlighted, the page turns with it. Drag to choose the line,
  tap the middle for the menus.
- **Listening profile per book:** voice, speed (presets from 0.75x to 2x, or
  any speed from 0.5x to 3x), pitch, narration volume and highlight style,
  saved with each book over a default for all books.
- **Bookmarks and notes:** page, chapter and sentence bookmarks. A bookmark
  made while listening keeps the audio position and can resume the
  narration right there. Highlights, notes, printed-page numbers for a
  paper copy, and ordering and filtering of the list.
- **Audiobook queue:** select books on the phone, choose a VoiceStudio voice
  and send them to your PC. The PC voices them one after another, the phone
  shows the progress, and finished audiobooks appear in the library.
- **Reading comfort:** Visual Options (fonts, margins per side, spacing,
  alignment), tap zones per page, foldable-aware layout, sleep timer with a
  fade-out, and reading and listening statistics.

## Voicing books on your PC

`tools/audiobook-queue/` turns an EPUB into a narrated EPUB (EPUB 3 Media
Overlays): VoiceStudio voices each sentence, and the timings let the app
highlight along. A small service keeps a queue that the phone controls.
[Setup guide](tools/audiobook-queue/README.md).

## License

GNU Affero General Public License v3.0: see [LICENSE](LICENSE) and
[NOTICE](NOTICE).
