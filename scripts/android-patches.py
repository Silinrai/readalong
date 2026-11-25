"""Readalong's changes to the generated Android project (gen/android is not
in git, so the build applies them every time; each one is idempotent).

1. Back on the last screen (the library) sends the app to the background
   instead of closing it, as audio apps do: closing it ended narration that
   was still playing after the book was closed.

    python scripts/android-patches.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAIN = (ROOT / 'apps' / 'readalong-app' / 'src-tauri' / 'gen' / 'android' / 'app' / 'src' / 'main'
        / 'java' / 'dev' / 'readalong' / 'app' / 'MainActivity.kt')

PATCHES = [
    (
        """                    } else {
                        finish()
                    }""",
        """                    } else {
                        // Readalong: to the background, not closed (narration).
                        moveTaskToBack(true)
                    }""",
    ),
    (
        """                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }""",
        """                    } else {
                        // Readalong: to the background, not closed (narration)
                        // [back-pressed].
                        moveTaskToBack(true)
                    }""",
    ),
]

if not MAIN.exists():
    print('MainActivity.kt not found (run tauri android init first):', MAIN)
    sys.exit(1)
text = MAIN.read_text(encoding='utf-8')
changed = 0
for old, new in PATCHES:
    if old not in text and new in text:
        continue  # already applied
    if old not in text:
        print('Patch target not found; MainActivity changed upstream:', old.strip().splitlines()[1])
        sys.exit(1)
    text = text.replace(old, new, 1)
    changed += 1
MAIN.write_text(text, encoding='utf-8', newline='\n')
print(f'Readalong Android patches: {changed} applied, {len(PATCHES) - changed} already in place')
