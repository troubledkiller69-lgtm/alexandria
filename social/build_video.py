"""Faceless short-form builder: JSON script -> 1080x1920 MP4 slideshow.

Usage: python build_video.py pilot.json
Script format: {"name": "video1", "seconds_per_slide": 3, "slides": [
  {"poster": "https://...jpg", "kicker": "#5", "title": "...", "sub": "..."},
  {"poster": null, "kicker": "...", "title": "...", "sub": "..."}  (end card)
]}
Posters download with no API key (image.tmdb.org is public).
Add a trending sound in-app after uploading (slideshows ship silent).
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

W, H = 1080, 1920
FPS = 30
GOLD = (212, 175, 55)
WHITE = (248, 250, 252)
MUTED = (148, 163, 184)

HERE = Path(__file__).parent
CACHE = HERE / "cache"
OUT = HERE / "out"

def font(bold, size):
    from PIL import ImageFont
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            pass
    return ImageFont.load_default()

def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def fetch_poster(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    name = url.rsplit("/", 1)[-1].split("?")[0] or "poster.jpg"
    dest = CACHE / name
    if not dest.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest

def render_slide(slide, idx):
    from PIL import Image, ImageDraw, ImageFilter
    base = Image.new("RGB", (W, H), (3, 3, 3))
    poster_img = None
    if slide.get("poster"):
        poster_img = Image.open(fetch_poster(slide["poster"])).convert("RGB")
        bg = poster_img.resize((W, H))
        bg = bg.filter(ImageFilter.GaussianBlur(45))
        dark = Image.new("RGB", (W, H), (3, 3, 3))
        base = Image.blend(bg, dark, 0.72)

    draw = ImageDraw.Draw(base)
    y = 300

    if slide.get("kicker"):
        f = font(True, 46)
        t = slide["kicker"].upper()
        draw.text((W / 2, y), t, font=f, fill=GOLD, anchor="ma")
        y += 80

    if poster_img:
        pw, ph = poster_img.size
        scale = min(840 / pw, 980 / ph)
        nw, nh = int(pw * scale), int(ph * scale)
        poster_img = poster_img.resize((nw, nh))
        base.paste(poster_img, ((W - nw) // 2, y + 20))
        # redraw context on top of the pasted poster
        draw = ImageDraw.Draw(base)
        y = y + 20 + nh + 60
    else:
        y += 120

    if slide.get("title"):
        f = font(True, 78)
        for line in wrap(draw, slide["title"], f, 920):
            draw.text((W / 2, y), line, font=f, fill=WHITE, anchor="ma")
            y += 100
        y += 10

    if slide.get("sub"):
        f = font(False, 44)
        for line in wrap(draw, slide["sub"], f, 900):
            draw.text((W / 2, y), line, font=f, fill=MUTED, anchor="ma")
            y += 62

    f = font(True, 34)
    brand = " ".join("ALEXANDRIA")
    draw.text((W / 2, H - 120), brand, font=f, fill=GOLD, anchor="ma")

    path = CACHE / f"slide_{idx:02d}.png"
    base.save(path)
    return path

def build(script_path):
    spec = json.loads(Path(script_path).read_text())
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    sps = spec.get("seconds_per_slide", 3)
    frames = sps * FPS
    segs = []
    for i, slide in enumerate(spec["slides"]):
        png = render_slide(slide, i)
        seg = CACHE / f"seg_{i:02d}.mp4"
        # Upscale first so zoompan stays smooth, output stays 1080x1920.
        vf = (
            f"scale=2160:3840,zoompan=z='min(zoom+0.0009,1.12)':d={frames}"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps={FPS}"
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loop", "1", "-i", str(png),
             "-vf", vf, "-frames:v", str(frames),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", str(seg)],
            check=True, capture_output=True,
        )
        segs.append(seg)

    lst = CACHE / "concat.txt"
    lst.write_text("".join(f"file '{s.as_posix()}'\n" for s in segs))
    tmp = CACHE / "joined.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c", "copy", str(tmp)],
        check=True, capture_output=True,
    )
    final = OUT / f"{spec.get('name', 'video')}.mp4"
    total = sps * len(segs)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(tmp),
         "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={total}",
         "-shortest", "-c:v", "copy", "-c:a", "aac", str(final)],
        check=True, capture_output=True,
    )
    print(f"done -> {final} ({total}s, {len(segs)} slides)")

if __name__ == "__main__":
    build(sys.argv[1])
