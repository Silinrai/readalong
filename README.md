# Readalong

An ebook reader that is also an audiobook. Readalong reads EPUBs and plays
their narration in sync with the text: the sentence being spoken is
highlighted and the page follows along. Narration comes either from the
phone's own voices or from audiobooks your PC voices with
[VoiceStudio](#voicing-books-on-your-pc), and those keep working offline.

Built for Android (tested on a Galaxy Z Fold 7: two pages unfolded, one
folded), with the same code running on desktop and the web.

## Download

Get the APK from [Releases](https://github.com/Silinrai/readalong/releases/latest)
and open it on your phone to install it (allow "Install unknown apps" for your
browser or file manager when asked). To update, install the newer APK the
same way; your library and settings stay.

## What it does

- **Read along:** press play and narration starts at the top of the page,
  with the spoken sentence highlighted and the page turning with it. Drag up
  or down on the page to pick a line and let go to play from it. Tap the
  sides to turn the page (narration follows), tap the middle for the menus,
  swipe sideways to stop narrating and just read. A narrated book opened on
  a page without narration offers to start where it begins.
- **Two pages on foldables:** the unfolded Fold shows a two-page spread and
  the cover screen one page. Folding and unfolding keeps your place and the
  narration going.
- **Listening profile per book:** voice, speed (presets from 0.75x to 2x, or
  any speed from 0.5x to 3x), pitch, narration volume and highlight style,
  saved with each book over a default for all books.
- **Bookmarks and notes:** page, chapter and sentence bookmarks. A bookmark
  made while listening keeps the audio position and can resume the
  narration right there. Highlights, notes, printed-page numbers for a
  paper copy, and ordering and filtering of the list.
- **Audiobook queue:** select books on the phone, choose a VoiceStudio voice
  and send them to your PC. The PC voices them one after another, the phone
  shows the progress (chapter, % voiced, time left), and finished audiobooks
  land in the library by themselves, even books of several hundred MB.
- **Reading comfort:** Visual Options (font, size, boldness, shadow,
  alignment, hyphenation, spacing, margins per side), page animations (curl,
  flip, slide, push), paper textures and saved looks, a bottom bar with
  chapter progress, time left in the chapter, tap zones per page, an option
  to hide the status bar, and a sleep timer that fades out.
- **Library:** bookshelf, reading room or plain grid, with a Continue card
  for the book you're in the middle of.
- **Statistics:** reading and listening time, kept apart, for the last 7
  days.

## Voicing books on your PC

`tools/audiobook-queue/` turns an EPUB into a narrated EPUB (EPUB 3 Media
Overlays). VoiceStudio voices each sentence, and the recorded timings let the
app highlight along. A small service on the PC keeps the queue:

- **From the phone:** send books from the library and watch the queue over
  Tailscale, at home or away.
- **Drop folder:** put an EPUB in `Audiobook Inbox` on the PC and it's queued
  and voiced by itself. Finished audiobooks are copied to `Finished`.
- **Runs on its own:** a Windows task keeps VoiceStudio and the queue running
  and restarts them if they stop, so nothing needs to be left open.
- **Picks up where it stopped:** voiced sentences are cached, so a restart,
  a reboot or a retry never voices the same sentence twice.

See the [setup guide](tools/audiobook-queue/README.md).

## License

GNU Affero General Public License v3.0: see [LICENSE](LICENSE) and
[NOTICE](NOTICE).
