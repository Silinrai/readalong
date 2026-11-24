# Readalong: what this fork adds to Readalong

Readalong is our ebook reader that is also an audiobook. It is a fork of
[Readalong](https://github.com/readalong/readalong) (AGPL-3.0, cloned at upstream
commit `38678db`), kept under the same licence. Narration comes from EPUB 3
Media Overlays that `../poc/render_chapter.py` renders into the book.

## Plan (from reading Readalong's narration code)

Readalong already plays Media Overlays: `MediaOverlayClient` plays the SMIL clips
off one media clock, `MediaOverlayTTS` turns the SMIL pars into sentence marks,
and `TTSController` + `useTTSControl` draw the highlight and turn the page to
follow the voice (including mid-sentence page breaks). So the fork builds on
that and only adds the behaviour below; it does not add a new player.

| # | Behaviour | Status in Readalong | What Readalong changed |
|---|-----------|-------------------|------------------------|
| 1 | Normal ebook reader by default | yes | nothing |
| 2 | Speech button narrates from the top of the page | starts at the sentence under the page's first character, which pages the view *back* when that sentence began on the previous page | starts at the first sentence that **begins** on the page (`TTSController.pageStartRange`) |
| 3 | Spoken sentence in **blue**, page follows the audio | grey highlight; follow works | default colour `#3b82f6`; saved grey default is read as blue |
| 4 | Gestures move the narration | prev/next buttons and shortcuts only | tap a sentence to jump; swipe up = next sentence, swipe down = previous |
| 5 | Tapping a page-turn zone turns the page and narrates from its top | page turns, voice carries on elsewhere, "Back to Read Aloud" pill | narration restarts from the top of the new page (also for swipes and keys) |
| 6 | Pausing scrolls to where narration stopped | no | pause brings the sentence back into view |

## How the gestures fit together (while narration is on)

- **Outer 20 % strip on either side**: page turn, then narrate from the new
  page's top. A page with no narration (e.g. an unrendered chapter) pauses
  narration with a "No narration on this page" toast and keeps the page.
- **Tap a sentence elsewhere**: jump narration to it (works while paused too).
- **Tap the sentence being read**: show the toolbars (text covers most of the
  page, so this is the way to the menus during narration).
- **Tap a blank spot in the middle**: show/hide the toolbars as usual.
- **Swipe up / down** (paginated mode): next / previous sentence. Readalong's
  pull-down-to-bookmark is disabled while narration is on; bookmark from the
  toolbar instead.
- **Scrolled mode**: scrolling freely reads ahead without moving the voice;
  pausing scrolls back to the voice. Swipes are scrolling there.

Code: `apps/readalong-app/src/app/reader/utils/narrationGestures.ts` (pure
helpers, unit-tested), `src/app/reader/hooks/useTTSControl.ts` (wiring),
`src/services/tts/TTSController.ts` (`pageStartRange`, `playFromRange`),
`src/app/reader/components/BookmarkPullDown.tsx`.

## He Who Fights With Monsters 5 (first real book)

`poc/out/hwfwm5/hwfwm5.narrated.epub`, rendered chapter by chapter (38–68).
Each chapter is two XHTML files (Calibre `_split_000` = number, `_split_001` =
title + text) sharing one MP3, each with its own SMIL.

- Narration runs on across the split (heading "Chapter thirty-eight." →
  "Fanboy." → text) and from one chapter's MP3 into the next. The chapter
  crossing was checked with a test copy (chapter 39 given stand-in clips:
  `make_crossing_epub.py` in the session scratchpad); the real chapter 39 was
  not rendered yet.
- Chapters 1–37 have no narration: the speech button shows "No narration for
  this chapter" and does nothing (stock Readalong jumped ahead to chapter 38).
  Turning into an un-narrated chapter while narrating pauses with "No narration
  on this page".
- Re-importing a newer render of the EPUB replaces the library copy in place
  (same metadata), so new chapters appear by importing the file again.
- Default speed is 1.0× (Readalong's 1.3× suits synthetic voices).

Getting the book in:
- **Dev (web):** `apps/readalong-app/.env.development.local` (git-ignored) has
  `NEXT_PUBLIC_READALONG_DEV_BOOKS=/dev-books/hwfwm5.narrated.epub`; copy the
  EPUB into `apps/readalong-app/public/dev-books/` (git-ignored). It is imported
  on first run of `dev-web`.
- **Phone:** copy the EPUB to the phone, tap it in the Files app and pick
  Readalong ("Open with"), or use Import in the library. The book is never
  bundled: every `next build` deletes `out/dev-books`
  (`scripts/strip-dev-books.mjs`), and the dev import only runs in development.

## Galaxy Z Fold 7: two pages unfolded

Readalong's iPhone Duo "book pose" (`utils/duo.ts`, `hooks/useDuoPose.ts`) now
also covers Android foldables: an Android screen that is near-square
(short/long ≥ 0.8) and ≥ 600 CSS px on its short side shows exactly two pages
with a 48 px spine gap; the cover screen stays one page. Fold/unfold re-lays out
in place; narration carries on and its sentence is brought back on screen
(the re-layout is not treated as a page turn). With two pages, "top of page" is
the top of the left page and the turn strips advance the spread.

Checked in the web build (Android user agent): 760×840 → two pages; speech
started at the left page's first sentence; the right strip advanced the spread
and narration restarted at its first sentence (s0019); folding to 400×900 while
the voice was on the right page kept it playing and on screen; unfolding went
back to two pages. Not checked on a real Fold.

## Android build

Built on this PC on 2026-11-22: `app\dist\Readalong-arm64.apk` (83.5 MB,
package `dev.readalong.app`, arm64, signed with a local key). Rebuild with:

```powershell
powershell -ExecutionPolicy Bypass -File app\scripts\build-android-readalong.ps1
```

Toolchain installed for it: Visual Studio 2022 Build Tools (C++), Rust via
rustup (stable + `aarch64-linux-android`), Temurin JDK 17, Android SDK
command-line tools, NDK 28.2.13676358, SDK platform 36 / build-tools 35.

Two Windows-only snags the script handles:
- `turso_ext`'s build script linked Windows' `advapi32` into the Android
  library (it tested the host OS). Fixed by a patched copy in
  `packages/turso_ext`, wired in through `[patch.crates-io]` in `Cargo.toml`.
- Tauri symlinks the Rust library into the Android project, which Windows only
  allows in Developer Mode. Without it the script copies the library in and runs
  Gradle (`assembleUniversalRelease`) itself.

The signing key is `%USERPROFILE%\.readalong\readalong-release.jks` (password
in `keystore-password.txt` next to it). Back both up: an update only installs
over the app if it is signed with the same key.

Not checked on a real phone yet.

### Installing on the Galaxy Z Fold 7

1. Copy `Readalong-arm64.apk` and `hwfwm5.narrated.epub` to the phone (USB
   cable to the PC, Quick Share, or Google Drive).
2. In My Files, tap the APK. Allow "Install unknown apps" for My Files when
   asked, then Install. (Play Protect may warn about an unknown developer:
   More details > Install anyway.)
3. In My Files, tap the EPUB and choose Readalong, or open Readalong and use
   Import.
4. Updates: install a newer APK the same way; the library is kept.

With a cable instead: Settings > About phone > Software information, tap Build
number 7 times; Developer options > USB debugging on; then
`adb install -r app\dist\Readalong-arm64.apk`
(adb is in `%LOCALAPPDATA%\Android\Sdk\platform-tools`).

## Reading comfort (round 4)

- **Page animations:** on by default with Page Curl; Off, Push, Slide, Curl
  and Flip are chips in the reader's "A" panel (and Settings > Control).
- **Narration gestures:** drag up/down to scrub through narrated lines (the
  target line is outlined while dragging; release plays from it; one line
  after 20 px, one more every 44 px). A sideways swipe turns narration off
  ("Narration off") and you just read; only taps turn the page while keeping
  the narration going.
- **Text:** Extra Boldness (0-0.6 px stroke, works on any font) and Text
  Shadow (0-3) in Settings > Font and the "A" panel.
- **Textures:** Old Paper, Linen, Oak, Dark Leather, Night Paper (original SVG
  noise, `public/images/readalong/`), plus a separate Night Texture used in dark
  mode (Settings > Theme).
- **Tap zones:** Settings > Control > Custom Tap Zones, a 3x3 grid; each zone:
  nothing, previous/next page, menu, play/pause, previous/next line, bookmark.
- **Saved looks:** the "A" panel has Old Paper, Night Leather, Large Print and
  "Save Look" for your own.
- **Library look:** view menu > Library Look: Default, Bookshelf (default for
  new installs), Reading Room.

Not checked on the phone; custom tap zones only unit-tested (not clicked
through in the browser).

## Stability and structure (round 5)

**Page jumping while fine-tuning, root cause.** Each slider tick restyled the
book. A restyle that arrives while the page engine is still re-laying out the
previous one makes it re-anchor to a half laid-out page, so the position slid
back about a page per drag. Stock Readalong does the same (checked on an untouched
upstream build: 2203 -> 1134 characters after one drag up and down). Fix:
`readalong/relayoutQueue.ts` + `useLiveRelayout.ts` run one relayout at a time
(latest value wins, settle = relocations quiet); saved looks apply as one batch
(`readalong/settingsPatch.ts`). Checked: 3 rounds of fast drags and 4 big jumps
all return to the same character (2189); 2 restyles per drag instead of ~20; one
restyle per saved look instead of ~20. A first attempt that also re-navigated to
the old position made it worse (the old page start lies a page earlier in the
new layout) and was removed.

**Narration and layout.** Page changes now go through one policy
(`readalong/narration/followPolicy.ts`): only a hand turn (tap zone, key, volume;
recorded in `viewPagination`) restarts narration at the new page top; a relayout
keeps the voice and brings it back into view; a sideways swipe turns narration off;
anything else shows Readalong's back button. Checked: dragging the font slider while
narrating causes 0 restarts and the voice stays on screen; a tap turn restarts once
at the new page's first sentence. Other fixes from the review: only a real pause
scrolls to the voice; height-only resizes (keyboard, system bars) are ignored and
hold the fold pose; overlapping jumps are superseded (generation counter in
`TTSController.playFromRange`); narration taps run after Readalong's popup and
handwriting handlers and respect Disable Click and image taps; scrub is off while
the toolbar or reading ruler is up; the UI says "playing" only after a jump starts;
the reader's night texture no longer leaks into the library; grey highlight can
be chosen again (one-time migration instead of a per-render remap).

**Bookshelf look.** One bookcase behind the whole library (`readalong/library/useShelfBackdrop.ts`
measures the rows; the CSS repeats a plank at that spacing, with wooden sides),
so empty shelves are there before books are added. Covers only on the shelf;
Default and Reading Room show titles.

**Code layout.** Fork code lives in `src/readalong/` (narration hooks and policy,
tap zones, presets, relayout queue, settings patch, migrations, dev book seed,
library backdrop) with types in `src/types/readalong.ts`. Upstream files keep short
`// Readalong:` hook points (e.g. useTTSControl's Readalong diff went from ~250 to
~60 lines, usePagination's to 19).

Tests: `src/__tests__/readalong/` (31 tests). Full suite: everything passes except
5 Windows-only upstream failures and one upstream flaky test
(`media-overlay-android-loop`, fails 2/6 runs on untouched upstream too).

## Branding

Name "Readalong" in the window/PWA titles, About dialog (with "Based on
Readalong, AGPL-3.0"), web manifest and Tauri `productName`. Android
`applicationId` is `dev.readalong.app` so it installs beside stock Readalong.
Kept as Readalong internally: Kotlin package / `identifier`
(`com.bilingify.readalong`), binary name, data folder, i18n strings. The icon is
still Readalong's.

## Running it

Desktop development uses Readalong's web build, which is the same Next.js reader
the Tauri desktop and Android apps wrap (Tauri needs Rust, not installed yet):

```
cd app
npx -y pnpm@11.1.1 install
npx -y pnpm@11.1.1 --dir apps/readalong-app setup-vendors
npx -y pnpm@11.1.1 --dir apps/readalong-app dev-web     # http://localhost:3000
```

Import `poc/out/pride-and-prejudice/pride-and-prejudice.narrated.epub`, open
chapter I, press the headphones button.

## Checks run (web dev build, 400×780 phone viewport, narrated EPUB)

1. Reader opens, pages turn by tap, toolbars toggle. Pass.
2. Page starting mid-s0053 → narration starts at s0054. Pass.
3. Blue highlight; s0035 straddles a page break and the page turned ~2 s into
   it with the highlight on screen. Pass.
4. Tap s0014 while s0024 plays → jumps to s0014. Swipe up ×2 s0027→s0029,
   swipe down ×3 s0029→s0026. Pass.
5. Tap right strip while s0006 plays → next page, narration restarts at s0013
   (its first sentence). Tap into chapter II → paused, toast, page kept. Pass.
6. Scrolled mode, view drifted to chapter II while s0041 played → pause →
   view scrolled back to s0041. Pass.

Unit tests: `src/__tests__/app/reader/utils/narrationGestures.test.ts`.

Not done: testing on a real Fold 7, Tauri desktop build, own icon.

## QA follow-up (round 6, 2026-11-23)

Driven by `../QA-REPORT-2026-11-23.md`.

**Fixes**
- RA-4: the fork's strings reach the translation files. The i18n scanner only
  sees `_('...')`, so fork code names its translate function `_` and data
  strings (preset, texture, page-turn names) use `stubTranslation as _`.
  47 strings translated into all 34 locales (written by Claude: worth a
  native-speaker pass, especially bo, si, ta, ka, uz, bn).
  `translationCoverage.test.ts` fails on any `__STRING_NOT_TRANSLATED__`.
- RA-5: the dev book seed records only URLs whose fetch succeeded.
- S-2: when `playFromRange` stops playback and then finds nothing to narrate,
  the session is left `stop-paused`, so Play restarts from the saved spot.
- S-4: the fold pose follows a width change (fold/unfold) even while a text
  field has focus; only height-only resizes (the keyboard) are held.
- S-5: a book read by its own narration starts no synthetic voice engine (Edge
  opened a WebSocket to Microsoft at every start). They start when the voice
  list is opened or a synthetic voice is picked.
- S-6: the build script makes the signing-key password with a CSPRNG (only
  used when no key exists yet; the existing key is untouched).
- S-7: the theme-mode button in the colour panel has a name.

**Features**
- TOC: a headphone mark on narrated chapters of a partly narrated book (none
  when every chapter is narrated; screen readers hear "Narrated").
- "No narration" toasts offer **Next narrated chapter**, which opens that
  chapter and narrates from its top; with none left the toast says so. Nothing
  navigates without the tap. The shared Toast gained an optional `action`.
- Mini-player sleep timer (alarm button): off, end of chapter, or 10 min to
  1 h; armed shows a filled pill with the countdown ("End of Chapter" from
  400 px wide). Same state as the player sheet's timer.
- Listening tips: shown once, the first time recorded narration plays; draws
  the page-turn strips where they are and explains tap, drag and swipe. Stored
  per device (`readalong-narration-tips-seen`).
- Bookshelf look: a slim progress bar on the covers of books in progress.

Code: `src/readalong/narration/{tocNarration,narrationJump}.ts`,
`SleepTimerControl.tsx`, `NarrationGestureTips.tsx`,
`src/readalong/library/CoverProgress.tsx`, `src/readalong/foldPose.ts`.

## Round 7: gestures, tap zones, bottom bar, Visual Options (2026-11-23)

**Gestures during narration**
- A tap never moves the narration any more. The middle of the page shows the
  menu, the sides turn the page (narration follows), or the custom zones apply.
- Drag up or down on a page: an outline sits on the narrated line under your
  finger and follows it; let go to play from that line. It works on whichever
  page you touch, so on the unfolded Fold the left and right pages are separate.
  (`isNarrationDrag`, `textRangeNearWindowPoint`, `narratedRangeAt` in
  `narration/gestures.ts`; `TTSController.narrationRangeNear`.)
- Sideways swipe still turns narration off.

**Tap zones** moved to Settings > **Miscellaneous** (new tab). Each page of a
two-page spread has its own 3x3 grid (`tapZonesRight` for a different right
page). The editor no longer offers "Previous/Next Line" (saved grids keep them).

**Bottom bar** (phones and the Fold), two rows like Moon+ Reader: previous
chapter, a progress slider, the percentage (tap it for page jump and
back/forward), next chapter; then Contents, Read aloud, Day/Night, Colour,
Visual Options, one/two pages (unfolded only), More (Settings). Hiding the bars
closes whatever panel was open, so they reopen with nothing selected.

**Visual Options** sheet (the "Aa" button): cards of rows (name, value, slider,
- and +) with a Reset each: Text (font size, boldness, shadow), Spacing
(paragraph, line, letter, word), Margins (left, right, top, bottom, with "left
and right together" / "top and bottom together"; Inner Screen on two pages),
then page turn, saved looks and More Settings. The same Margins card is in
Settings > Miscellaneous. Margins edit whichever set Readalong is using (full or
compact, see `visual/marginFields.ts`).

**Inner Screen** = Readalong's `columnGapPx`. On an Android foldable a value you
set now wins over the 48 px crease minimum, so the pages can come closer
together or move apart; 0 (Auto) keeps the 48 px.

Checked in the web build at 375 px, 760x840 (Android, two pages) and desktop;
not on the Fold itself.

## Round 8: the Fold review items (2026-11-23)

From `../READER-REVIEW-2026-11-23.md` (items 14 and 16 not wanted).

- **Visual Options** (items 6-8): Font, Alignment (Justified / Left),
  Hyphenation, Highlight Style for narration (Readalong's
  `ttsHighlightOptions.style`), a Colors and Brightness button; with two
  pages the sheet covers only the right page. Header title on phones no
  longer starts cut off (item 3).
- **Time left in chapter** (9): Readalong's `showRemainingTime` footer is on by
  default; settings migration v2 turns it on once for existing installs.
- **Status bar** (10): Settings > Miscellaneous > Hide the Status Bar While
  Reading (`hideStatusBarWhileReading`, `readalong/statusBar.ts`).
- **Bars** (11, 12): the mini-player widens to 36 rem from 700 px; a light
  shade covers the page while the bars show (`bottombar/BarsScrim.tsx`).
- **Library** (13): auto grid keeps covers at least ~170 px
  (`library/continueReading.ts`, hooked into `bookshelfColumns`); a Continue
  card above the shelves opens the most recently read book in progress
  (`library/ContinueCard.tsx`, through Readalong's `useOpenBook`).
- **Sleep timer fade** (15): TTSSessionManager lowers the volume over the
  timer's last 30 s (`narration/sleepFade.ts`) through a new optional
  `PlaybackSource.setVolume`; MediaOverlayClient applies it to the audio
  element or the native player (new `set-volume` playout action in
  `NativeTTSPlugin.kt`). A new session always starts at full volume.
  Synthetic voices are not faded. iOS has no `set-volume` (ignored).
- **Narration speed per book** (17): `ttsNarrationRate` in the book's view
  settings (saved to the book only); `ttsRate` stays the synthetic voices'
  speed. Player sheet, mini-player badge, start and voice switches use
  `activeTTSRate` (`narration/narrationRate.ts`).
- **Read vs listened** (18): `stats/listeningLog.ts` tallies listened seconds
  per day in localStorage (from TtsStatsRecorder's flushed events; Readalong
  stores listening as reading rows, so the split starts now); Reading
  Statistics shows the last 7 days (`stats/ReadListenedSummary.tsx`).
- **Narration start offer** (19): a narrated book opened on an unnarrated
  page shows "Narration starts at <chapter>" with Start narration
  (`narration/narrationStartOffer.ts`, `useNarrationStartOffer.ts`, mounted
  in BooksGrid's book cell).

Not done: item 5 (chapter number alone on a page), automatic left alignment
on narrow columns, the drag-taller sheet on the cover screen, chapter / time
left / play on the Continue card. 15 new strings translated into all 34
locales (by Claude; worth a native-speaker pass).
