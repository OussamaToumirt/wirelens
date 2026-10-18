"""Generates WireLens branding assets (original artwork, replacing HTTP Toolkit's logos).

Mark: a rounded tile with a lens ring, and a signal wave running through the lens.
Usage: python scripts/make-logo.py   (from the wirelens root; needs Pillow)
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAL = (14, 165, 164, 255)
DARK = (15, 41, 54, 255)
WHITE = (255, 255, 255, 255)

# Geometry in a 120x120 design space, shared by the SVG and the raster renderer.
TILE_RADIUS = 26
LENS_CX, LENS_CY, LENS_R, LENS_W = 56, 56, 30, 11
HANDLE = ((78, 78), (102, 102))
WAVE_Y, WAVE_AMP, WAVE_X0, WAVE_X1 = 56, 9, 30, 82


def wave_points(scale=1.0, steps=64):
    pts = []
    for i in range(steps + 1):
        x = WAVE_X0 + (WAVE_X1 - WAVE_X0) * i / steps
        y = WAVE_Y - WAVE_AMP * math.sin((x - WAVE_X0) / (WAVE_X1 - WAVE_X0) * 2 * math.pi)
        pts.append((x * scale, y * scale))
    return pts


def svg_icon():
    wave = ' '.join(f'{x:.2f},{y:.2f}' for x, y in wave_points())
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="{TILE_RADIUS}" fill="#0EA5A4"/>
  <circle cx="{LENS_CX}" cy="{LENS_CY}" r="{LENS_R}" fill="none" stroke="#FFFFFF" stroke-width="{LENS_W}"/>
  <line x1="{HANDLE[0][0]}" y1="{HANDLE[0][1]}" x2="{HANDLE[1][0]}" y2="{HANDLE[1][1]}" stroke="#FFFFFF" stroke-width="{LENS_W + 3}" stroke-linecap="round"/>
  <polyline points="{wave}" fill="none" stroke="#0F2936" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''


def raster_icon(size):
    s = size / 120
    ss = 4  # supersample for smooth edges
    big = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    k = s * ss
    d.rounded_rectangle([0, 0, 120 * k - 1, 120 * k - 1], radius=TILE_RADIUS * k, fill=TEAL)
    d.ellipse([(LENS_CX - LENS_R) * k, (LENS_CY - LENS_R) * k, (LENS_CX + LENS_R) * k, (LENS_CY + LENS_R) * k],
              outline=WHITE, width=round(LENS_W * k))
    hw = (LENS_W + 3) * k
    d.line([HANDLE[0][0] * k, HANDLE[0][1] * k, HANDLE[1][0] * k, HANDLE[1][1] * k], fill=WHITE, width=round(hw))
    for (x, y) in HANDLE:
        d.ellipse([x * k - hw / 2, y * k - hw / 2, x * k + hw / 2, y * k + hw / 2], fill=WHITE)
    d.line(wave_points(k), fill=DARK, width=round(6 * k), joint='curve')
    return big.resize((size, size), Image.LANCZOS)


def wordmark(height=184, width=1200):
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    img.alpha_composite(raster_icon(height), (0, 0))
    font_path = next((p for p in [r'C:\Windows\Fonts\segoeuib.ttf', r'C:\Windows\Fonts\arialbd.ttf'] if os.path.exists(p)), None)
    font = ImageFont.truetype(font_path, int(height * 0.62)) if font_path else ImageFont.load_default()
    d = ImageDraw.Draw(img)
    text_y = (height - (font.getbbox('WireLens')[3] - font.getbbox('WireLens')[1])) / 2 - font.getbbox('WireLens')[1]
    d.text((height + 40, text_y), 'WireLens', font=font, fill=DARK)
    return img


def android_vector(ring_color, wave_color, size_dp, group=None):
    ring = (f'M{LENS_CX - LENS_R},{LENS_CY} a{LENS_R},{LENS_R} 0 1,0 {2 * LENS_R},0 '
            f'a{LENS_R},{LENS_R} 0 1,0 {-2 * LENS_R},0')
    handle = f'M{HANDLE[0][0]},{HANDLE[0][1]} L{HANDLE[1][0]},{HANDLE[1][1]}'
    wave = 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in wave_points(steps=32))
    paths = f'''    <path android:pathData="{ring}" android:strokeColor="{ring_color}" android:strokeWidth="{LENS_W}" android:fillColor="#00000000"/>
    <path android:pathData="{handle}" android:strokeColor="{ring_color}" android:strokeWidth="{LENS_W + 3}" android:strokeLineCap="round"/>
    <path android:pathData="{wave}" android:strokeColor="{wave_color}" android:strokeWidth="6" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>'''
    if group:
        paths = f'  <group {group}>\n{paths}\n  </group>'
    return f'''<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="{size_dp}dp"
    android:height="{size_dp}dp"
    android:viewportWidth="120"
    android:viewportHeight="120">
{paths}
</vector>
'''


def round_icon(size):
    tile = raster_icon(size)
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


def tv_banner():
    banner = Image.new('RGBA', (320, 180), TEAL)
    icon = raster_icon(96)
    banner.alpha_composite(icon, (20, 42))
    font_path = next((p for p in [r'C:\Windows\Fonts\segoeuib.ttf', r'C:\Windows\Fonts\arialbd.ttf'] if os.path.exists(p)), None)
    font = ImageFont.truetype(font_path, 40) if font_path else ImageFont.load_default()
    ImageDraw.Draw(banner).text((128, 64), 'WireLens', font=font, fill=WHITE)
    return banner


def android_assets():
    res = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
    # In-app logo, shown on light & dark app backgrounds:
    open(os.path.join(res, 'drawable', 'ic_transparent_icon.xml'), 'w', encoding='utf8').write(
        android_vector('#0EA5A4', '#0B7F7E', 120))
    # Adaptive launcher icon: white mark on a teal background, within the 66dp safe zone:
    open(os.path.join(res, 'drawable', 'ic_launcher_foreground.xml'), 'w', encoding='utf8').write(
        android_vector('#FFFFFF', '#0F2936', 108,
                       group='android:scaleX="0.5" android:scaleY="0.5" android:translateX="30" android:translateY="30"'))
    Image.new('RGBA', (1080, 1080), TEAL).save(os.path.join(res, 'drawable', 'ic_launcher_background.png'))
    Image.new('RGBA', (432, 432), TEAL).save(os.path.join(res, 'drawable-night', 'ic_launcher_background.png'))
    for density, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        folder = os.path.join(res, f'mipmap-{density}')
        raster_icon(size).save(os.path.join(folder, 'ic_launcher.png'))
        round_icon(size).save(os.path.join(folder, 'ic_launcher_round.png'))
    tv_banner().save(os.path.join(res, 'drawable-nodpi', 'ic_tv_banner.png'))


def main():
    android_assets()
    ui_images = os.path.join(ROOT, 'ui', 'src', 'images')
    icons = os.path.join(ROOT, 'desktop', 'src', 'icons')

    svg = svg_icon()
    open(os.path.join(ui_images, 'logo-icon.svg'), 'w', encoding='utf8').write(svg)
    open(os.path.join(icons, 'icon.svg'), 'w', encoding='utf8').write(svg)

    wordmark().save(os.path.join(ui_images, 'loading-logo.png'))

    icon1024 = raster_icon(1024)
    icon1024.save(os.path.join(icons, 'icon.png'))
    icon1024.save(os.path.join(icons, 'icon.ico'), sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    icon1024.save(os.path.join(icons, 'icon.icns'))
    print('WireLens assets written')


if __name__ == '__main__':
    main()
