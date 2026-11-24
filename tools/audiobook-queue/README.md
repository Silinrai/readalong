# Audiobook queue (PC side)

Turns EPUBs into narrated EPUBs with VoiceStudio, one
book after another, while the Readalong app on your phone sends books,
watches the progress and imports the finished audiobooks.

How it works: each sentence of the book is voiced by VoiceStudio, trimmed and
joined into one MP3 per chapter, and the start and end of every sentence is
recorded. The result is your EPUB with an EPUB 3 Media Overlay (SMIL files
plus the audio), so Readalong highlights each sentence as it's spoken. It
works offline once it's on the phone.

## 1. What you need

- Windows PC with an NVIDIA GPU (8 GB is enough for OmniVoice).
- **VoiceStudio** running locally on port 3900, with a TTS engine installed
  (OmniVoice is the default here) and a voice profile: record or import a
  10–30 s clip of the voice in VoiceStudio and save it as a profile.
- **Python 3.12.**
- **Tailscale** on the PC and on the phone, signed in to the same tailnet,
  to reach the PC from the phone (at home or away).

## 2. Install

```powershell
cd tools\audiobook-queue
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy config.example.toml config.toml
```

In `config.toml`, set `profile_name` to your VoiceStudio profile's name.
`engine`, pauses between sentences and MP3 quality are in the same file.

Check it with one chapter of any EPUB:

```powershell
.venv\Scripts\python.exe render_chapter.py my-book.epub --list
.venv\Scripts\python.exe render_chapter.py my-book.epub --chapter 1
```

Open `out\my-book\ch01.check.html` in a browser (serve `out\` over HTTP) to
hear it and watch the highlighting.

## 3. Run the queue

```powershell
.venv\Scripts\python.exe -m genqueue serve --host 127.0.0.1
.venv\Scripts\python.exe -m genqueue code      # the pairing code for the phone
.venv\Scripts\python.exe -m genqueue status    # what's running, % done, time left
```

Books can also be added from the PC:
`python -m genqueue submit book.epub --profile "My voice"`. Audiobooks are
written to `out\<book>\<book>.narrated.epub` as each chapter finishes. The
queue, the submitted books and covers live in `queue_data\`, and finished
sentences are cached in `cache\`, so a restart or a retry never voices the
same sentence twice.

To start it with Windows, add a Task Scheduler task "At log on" that runs the
`serve` command above with `tools\audiobook-queue` as the start folder.

## 4. Reach it from the phone (Tailscale)

The queue listens on this PC only. Tailscale forwards your tailnet to it, so
no firewall rule is needed and nothing is open on your network or the
internet:

```powershell
tailscale serve --bg --http 3910 http://127.0.0.1:3910
```

In Readalong: library menu > **Audiobook Queue**. The address is the PC's
name in the Tailscale app (its MagicDNS name, e.g. `my-pc`; port 3910 is
added for you; the raw 100.x address won't work, Tailscale serve routes by
name). Then enter the pairing code. Turn it off with
`tailscale serve --http=3910 off`.

## 5. Use it

- Select books in the library > **Audiobook**, choose the PC voice (preview
  it), pick Normal or First in Line, send.
- **Audiobook Queue** shows every book: position, chapter, % voiced (counted
  from the sentences actually voiced), time left (an estimate from the
  measured speed), and the overall progress weighted by book size.
- Pause or resume the queue, reorder, cancel one or all waiting books, retry
  failed ones, remove finished ones from the list (the audiobook stays).
- On the PC: processing hours (e.g. `22:00-07:00`), pause while the PC is in
  use, and lower priority for VoiceStudio.
- Finished audiobooks are imported into the library automatically while the
  app is open.

## Notes

- One book at a time: VoiceStudio runs one model on the GPU.
- If VoiceStudio stops answering, the book waits and resumes by itself; it
  isn't marked failed. A failed chapter is recorded and the book carries on;
  Retry voices only what's missing.
- Voice profiles with a clip longer than 20 s: the queue saves the clip's
  best 15 s passage as its own VoiceStudio profile ("<name> (15 s passage,
  Readalong)") with a transcript, so VoiceStudio doesn't transcribe the clip
  on every sentence (that costs ~50 s per sentence when the GPU is full).
- If voicing gets slow, check VoiceStudio's log for "whisperx transcribing"
  lines and for other programs transcribing through it.
- Tests: `.venv\Scripts\python.exe -m pytest tests`.
