import { UPSTREAM_TELEMETRY } from '@/readalong/upstream';

// Readalong: parts of the upstream app this fork takes out of its screens.
// Their code stays (so upstream fixes still merge, and a flag brings a part
// back); the menus, settings and buttons that lead to them are hidden.
// Books, notes and settings already saved are not touched.

/** Translation, Word Lens, Chinese conversion, vertical and right-to-left
 *  layouts, and the CJK font choice. */
export const SHOW_TRANSLATION = false;

/** Importing from a web browser, a web novel site, an RSS feed, pasted text
 *  or an OPDS catalogue. Importing files and folders stays. */
export const SHOW_WEB_IMPORTS = false;

/** Third-party services: KOReader, BookOrbit, Hardcover, Grimmory, Pagebound,
 *  Notion, Obsidian, Readwise, Audiobookshelf, S3, WebDAV, OPDS, Nearby
 *  BookDrop, Discord, iCloud (the whole Integrations settings tab). */
export const SHOW_INTEGRATIONS = false;

/** Settings that only mean something on a desktop or an e-ink reader:
 *  e-ink modes, gamepad, mouse, cursor, keyboard shortcuts, Windows File
 *  Explorer thumbnails. */
export const SHOW_DESKTOP_CONTROLS = false;

/** Settings-search entries for the settings hidden above, so a search
 *  doesn't lead to a row that isn't there. */
export const isHiddenSetting = (id: string): boolean =>
  (!SHOW_TRANSLATION &&
    (id.startsWith('settings.language.')
      ? id !== 'settings.language.interfaceLanguage' && id !== 'settings.language.dictionaries'
      : false)) ||
  (!SHOW_TRANSLATION && (id === 'settings.font.cjkFont' || id === 'settings.layout.writingMode')) ||
  (!SHOW_DESKTOP_CONTROLS &&
    [
      'settings.control.einkMode',
      'settings.control.colorEinkMode',
      'settings.control.autoFullRefresh',
      'settings.control.hideBookshelfPageButtons',
      'settings.control.autohideCursor',
      'settings.control.reverseWheelPaging',
      'settings.control.gamepadEnabled',
      'settings.control.keyboardShortcuts',
    ].includes(id)) ||
  (!UPSTREAM_TELEMETRY && id === 'action.telemetry');
