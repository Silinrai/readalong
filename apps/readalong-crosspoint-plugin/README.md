# Readalong plugin for CrossPoint

An [SD-card plugin](https://github.com/crosspoint-reader/crosspoint-reader/blob/develop/docs/sd-plugins.md)
for [CrossPoint](https://github.com/crosspoint-reader/crosspoint-reader) e-readers
(Xteink X3/X4 and other FreeInk devices) that connects the reader to your
[Readalong](https://readalong.invalid) account:

- **Library**: browse and search the EPUBs in your Readalong cloud library on the
  reader and download them to `/Readalong/` on the SD card.
- **Reading statistics**: every reading session on the reader (active reading
  time and how far you got) is added to your Readalong reading statistics.
- **Reading progress**: the reader's built-in CrossPoint Sync syncs your
  position with Readalong, with no sync server to set up.
- **Highlights**: with **Sync Clippings** on, the reader's clippings and your
  Readalong highlights sync both ways.

## Requirements

- CrossPoint 2.0 or later, the first release with SD plugins. A new install
  starts with them off: turn on **Settings → Connectivity → Plugins**.
- A Readalong account. Any sign-in method works, since the reader never sees your
  password.
- Books uploaded to Readalong Cloud. Only EPUBs are listed, since that is the
  format CrossPoint reads.

## Install

Download `Readalong-<version>.crosspoint-plugin.zip` from the
[latest Readalong release](https://github.com/readalong/readalong/releases/latest)
and unzip it. Copy the `readalong/` folder to the SD card as
`/.crosspoint/plugins/readalong/` (or `/plugins/readalong/`), then restart the
reader.

## Update

The reader's plugin list shows the installed version under **Readalong**, and
so does the **Readalong** card on the web **Plugins** page (see Sign in below
for opening it). On that card, select **Check for update**, then **Update**
when a newer release is available, and reload the page.

## Sign in

Signing in links the reader to your account with a code you approve on the
Readalong web app. The reader gets its own key, which works only for this plugin
and is revoked when you sign out; your password is never stored on the reader.

On the reader, open **File Transfer**, join your Wi-Fi network, and open the
address it shows in a browser on your phone or computer. Go to **Plugins**,
find the **Readalong** card, and select **Sign in**. Open the link it shows, check
that the code matches, and select **Link Reader**.

Sign-in happens only on this web page, because CrossPoint lets a plugin set up
CrossPoint Sync from there but not from the reader's own screen. Until you sign
in, **Plugins → Readalong** on the reader points you to the web page.

Your library then appears on the reader under **Plugins → Readalong**. With
**Sync reading progress** on, signing in from the web page sets the reader's
**CrossPoint Sync** to sync progress with Readalong. The box starts on unless
CrossPoint Sync is already set up with another server; turning it on replaces
that server. **Sign out** revokes the reader's key and clears CrossPoint Sync
only while it still points at Readalong.

## Reading statistics

Reading sessions are queued on the reader and sent to Readalong the next time it
is online: when File Transfer joins a network, or on the way to sleep if Wi-Fi
credentials for the last network are saved. Each session's time is spread over
the pages it covered, in the book's Readalong page count, so it counts like
reading in Readalong. Until a Readalong app has opened the book, sessions are
counted in steps of 1% of the book. Books matching one in your Readalong library
(the same file, identified by its KOReader-compatible partial MD5) merge with
that book's statistics, and so does a copy rewritten by **Optimize EPUB** once
its first **Sync Progress** has linked it (see Reading progress). Others appear
under their file hash.

## Reading progress

Signing in from the web page points the reader's built-in CrossPoint Sync at
Readalong (`/api/crosspoint`) with the reader's key, your email as the username,
and **Document Matching** set to **Binary** so books match Readalong's
partial-MD5 book ids. The key alone authenticates the reader, so changing your
Readalong email does not break sync. Sync from the reader menu with **Sync
Progress**; CrossPoint does not sync progress automatically. Readalong apps move
to the synced position the next time they open the book (the furthest position
wins).

Positions travel as KOReader XPointers. Readalong to CrossPoint lands on the right
page. CrossPoint to Readalong lands one to three lines late; CrossPoint PR #3424
makes it exact.

Sign-in also turns on CrossPoint Sync's **Send Document Metadata**, so each upload carries
the book's title and authors. A book uploaded with the File Manager's
**Optimize EPUB** is rewritten, so it no longer matches Readalong's copy by
partial MD5. Its first **Sync Progress** links it to the Readalong EPUB with the
same title without moving Readalong's position back. When titles collide, the
book must also share the first author, and of several such books (the same
book imported twice, or another edition) the most recently read one wins. The next sync brings Readalong's position over, and from then on
it syncs both ways like the original.

## Highlights

Turn on **Sync Clippings** in **Settings → Connectivity → CrossPoint Sync**.
Each **Sync Progress** then syncs the book's clippings with its Readalong
highlights first, through the same `/api/crosspoint` server, using CrossPoint
Sync's clippings API. A clipping saved on the reader becomes a highlight in
Readalong the next time a Readalong app opens the book. A highlight made in Readalong
appears on the reader after its next sync. Deleting one on either side deletes
it on the other.

CrossPoint anchors a clipping by its chapter and a range of characters in it.
Readalong keeps that anchor next to KOReader's XPointers, places the highlight by
it, and checks the text there; when a rewritten copy shifted it, Readalong finds
the same text nearby. The reader shows no colors or notes, so those stay in
Readalong. An X3 or X4 holds 256 clippings a book, so it gets at most a book's
first 256 highlights.

## Development

Tests live with the app, in
`apps/readalong-app/src/__tests__/crosspoint-plugin/readalong-plugin.test.ts`. The
server side is the routes in `apps/readalong-app/src/app/api/crosspoint/` (device
sign-in, catalog, reading sessions, the KOSync-compatible progress routes and
the clippings API under `api/v1/clippings`) and the `/link` page where codes are
approved. Reader keys and pending sign-ins live in the tables from
`docker/volumes/db/migrations/024_crosspoint_devices.sql`; a clipping is a
`book_notes` row with the `crosspoint` anchor from `033_add_book_notes_crosspoint.sql`.
