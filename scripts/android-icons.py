"""Readalong's Android icons, from the sources in data/icons/:
  readalong-book.png  the launcher composition (full bleed, artwork in the
                      adaptive icon's safe zone)
  readalong-logo.png  the rounded-square logo (legacy square launcher)
Writes the adaptive launcher layers at every density, the themed-icon
silhouette, the legacy square/round launchers, the startup-screen icon and
its background into the generated Android project (gen/android, which is not
in git, so the build runs this every time).

    python scripts/android-icons.py      (needs Pillow: pip install pillow)
"""
import pathlib

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / 'data' / 'icons'
RES = ROOT / 'apps' / 'readalong-app' / 'src-tauri' / 'gen' / 'android' / 'app' / 'src' / 'main' / 'res'
BG = '#100b14'

launcher = Image.open(ICONS / 'readalong-book.png').convert('RGBA')
logo = Image.open(ICONS / 'readalong-logo.png').convert('RGBA')
gray = launcher.convert('L')

# Themed icon (Android 13+): one colour, tinted by the system.
mono = Image.new('RGBA', launcher.size, (255, 255, 255, 0))
mono.putalpha(gray.point(lambda v: 0 if v < 70 else min(255, (v - 70) * 3)).filter(ImageFilter.GaussianBlur(1)))

for name, k in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
    d = RES / f'mipmap-{name}'
    d.mkdir(parents=True, exist_ok=True)
    layer, icon = round(108 * k), round(48 * k)
    launcher.resize((layer, layer), Image.LANCZOS).save(d / 'ic_launcher_foreground.png')
    mono.resize((layer, layer), Image.LANCZOS).save(d / 'ic_launcher_monochrome.png')
    logo.resize((icon, icon), Image.LANCZOS).save(d / 'ic_launcher.png')
    rnd = launcher.resize((icon, icon), Image.LANCZOS)
    m = Image.new('L', (icon, icon), 0)
    ImageDraw.Draw(m).ellipse((0, 0, icon - 1, icon - 1), fill=255)
    rnd.putalpha(m)
    rnd.save(d / 'ic_launcher_round.png')

# Adaptive icon: the composition is the foreground with no inset (its art is
# already inside the safe zone), on a matching dark background.
(RES / 'mipmap-anydpi-v26').mkdir(parents=True, exist_ok=True)
(RES / 'mipmap-anydpi-v26' / 'ic_launcher.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '  <background android:drawable="@color/ic_launcher_background"/>\n'
    '  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
    '  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
    '</adaptive-icon>\n', encoding='utf-8', newline='\n')
(RES / 'values').mkdir(parents=True, exist_ok=True)
(RES / 'values' / 'ic_launcher_background.xml').write_text(
    f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    f'  <color name="ic_launcher_background">{BG}</color>\n</resources>\n', encoding='utf-8', newline='\n')

# Startup screen: the logo (its rounded square, transparent corners) over
# the icon's near-black.
(RES / 'drawable').mkdir(parents=True, exist_ok=True)
logo.resize((640, 640), Image.LANCZOS).save(RES / 'drawable' / 'splash_icon.png')
(RES / 'drawable' / 'splash_background.xml').write_text(
    '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <item>\n        <color android:color="#FF100B14" />\n    </item>\n'
    '    <item android:gravity="center" android:width="160dp" android:height="160dp">\n'
    '        <bitmap android:src="@drawable/splash_icon" />\n    </item>\n'
    '</layer-list>\n', encoding='utf-8', newline='\n')
print('Readalong Android icons written to', RES)
