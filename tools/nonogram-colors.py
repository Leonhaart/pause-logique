# Couleurs des images Nonogram : python3 tools/nonogram-colors.py [dossier des PNG Noto 128 px]
# Source : Noto Emoji couleur (Apache 2.0), fichiers emoji_uXXXX.png.
# Même découpage que la silhouette (tools/nonogram-images.json) ; chaque case reçoit une couleur d'une palette de 4 au plus.
# Sortie : tools/nonogram-colors.json { "10": { "🌰": "rrggbb,rrggbb:0012…" } } (indices de palette 0-3, deux cases par chiffre hexadécimal : a*4+b).
import json, os, sys
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/icons/noto/2D/png/128'
imgs = json.load(open(os.path.join(here, 'nonogram-images.json')))

def cells(path, N):
    im = Image.open(path).convert('RGBA')
    bb = im.split()[3].point(lambda v: 255 if v > 40 else 0).getbbox()
    im = im.crop(bb)
    w, h = im.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(im, ((s - w) // 2, (s - h) // 2))
    big = Image.new('RGBA', (s + s // (N * 2),) * 2, (0, 0, 0, 0))
    off = (big.size[0] - s) // 2
    big.paste(canvas, (off, off))
    small = big.convert('RGBa').resize((N, N), Image.BOX).convert('RGBA')
    px = small.load()
    return [px[x, y] for y in range(N) for x in range(N)]

out = {}
for N, items in imgs.items():
    N = int(N)
    out[N] = {}
    for it in items:
        name = it['name']
        cp = ord(name[0])
        path = os.path.join(SRC, 'emoji_u%x.png' % cp)
        if not os.path.exists(path):
            continue
        cs = cells(path, N)
        on = [i for i, b in enumerate(it['bits']) if b] if isinstance(it['bits'], list) else None
        if on is None:
            bits = bin(int(it['bits'], 16))[2:].zfill(len(it['bits']) * 4)[: N * N]
            on = [i for i, b in enumerate(bits) if b == '1']
        pts = [cs[i][:3] for i in on if cs[i][3] > 0]
        if not pts:
            continue
        strip = Image.new('RGB', (len(pts), 1))
        strip.putdata(pts)
        q = strip.quantize(colors=4, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = q.getpalette()
        idx = list(q.get_flattened_data()) if hasattr(q, 'get_flattened_data') else list(q.getdata())
        freq = {}
        for k in idx:
            freq[k] = freq.get(k, 0) + 1
        order = sorted(freq, key=lambda k: -freq[k])
        remap = {k: n for n, k in enumerate(order)}
        palette = ['%02x%02x%02x' % tuple(pal[3 * k: 3 * k + 3]) for k in order]
        digit = ['0'] * (N * N)
        j = 0
        for i in on:
            if cs[i][3] > 0:
                digit[i] = str(remap[idx[j]])
                j += 1
        digit = digit + ['0'] * (len(digit) % 2)
        packed = ''.join('%x' % (int(digit[k]) * 4 + int(digit[k + 1])) for k in range(0, len(digit), 2))
        out[N][name] = ','.join(palette) + ':' + packed
    print(N, len(out[N]), 'images colorées sur', len(items))
json.dump(out, open(os.path.join(here, 'nonogram-colors.json'), 'w'), ensure_ascii=False)
