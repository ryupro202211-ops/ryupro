# -*- coding: utf-8 -*-
"""ブログ記事のアイキャッチ画像を用意する。

    # プロンプトから生成して blog/posts/images/<slug>.jpg に置く
    python tools/make-eyecatch.py --slug 2026-09-09-two-and-half-hour-commute \
        --prompt "warm cinematic photograph of ..."

    # 既にある画像の黒帯を落として整えるだけ
    python tools/make-eyecatch.py --slug 2026-09-09-... --from drafts/raw.jpg

生成は既定で Gemini（環境変数 GEMINI_API_KEY が要る）。輪郭がはっきりして
いてCG調に転びにくい。キーが無い環境や Gemini 側が 429 を返す場合に備えて
`--engine pollinations`（https://image.pollinations.ai・APIキー不要）も残して
ある。2026-09-06 時点では Gemini の画像モデルが無料枠だと `limit: 0` で
429 になっていたが、翌日には通るようになった。落ちたら engine を切り替える。

生成画像にはレターボックスの黒帯が焼き込まれることが多い。記事ページでは
画像の上下に暗い帯が出て、一覧カード（16:10 の cover 切り抜き）でも構図が
ずれるので、低輝度の行／列を端から検出して切り落としてから 16:9 に整える。

出力は 1280x720。この1枚が posts.json の image を通して
一覧サムネイル・OGP・記事ページ上部の3か所に使われる。
"""
import argparse
import base64
import io
import json
import os
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "blog", "posts", "images")

WIDTH, HEIGHT = 1280, 720
# 0-255。これ以下の平均輝度の行／列を黒帯とみなす
BAR_THRESHOLD = 26

# サイトの配色（濃いチャコール #111110 × シャンパンゴールド #dbc5a4）に寄せ、
# 生成モデルが寒色や近接構図に転びやすいのを毎回打ち消すための共通指定。
STYLE_SUFFIX = (
    " Rich warm champagne gold and amber light, deep warm charcoal shadows."
    " Calm, quiet, refined editorial photography, large negative space, fine film grain."
    " People are distant and small in the frame, seen from behind, whole body visible,"
    " wearing modest loose clothing."
    " No black bars, no letterbox, no border, no vignette."
    " No text, no letters, no logo, no watermark, no close-up, no faces."
)


GEMINI_MODEL = "gemini-3.1-flash-image"


def generate_gemini(prompt):
    """Gemini の画像モデルで 16:9 を生成してバイト列で返す。

    2K で返ってくるので、この後の整形で 1280x720 に落とす。
    seed 指定は API 側に無いため、構図を変えたいときはプロンプトを変える。
    """
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("GEMINI_API_KEY が環境にありません。"
                         "--engine pollinations なら不要です。")
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"},
        },
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % GEMINI_MODEL,
        data=body,
        headers={"x-goog-api-key": key, "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        payload = json.loads(res.read().decode("utf-8"))

    for part in payload.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            return base64.b64decode(part["inlineData"]["data"])
    raise SystemExit("Gemini のレスポンスに画像がありませんでした。")


def generate_pollinations(prompt, seed):
    """Pollinations で 16:9 の画像を取得してバイト列で返す。APIキー不要。"""
    url = "https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt)
    url += "?width=%d&height=%d&model=flux&nologo=true" % (WIDTH, HEIGHT)
    if seed is not None:
        url += "&seed=%d" % seed
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as res:
        return res.read()


def trim_bars(im):
    """端から低輝度の行／列を削る。帯が無ければそのまま返す。"""
    g = im.convert("L")
    w, h = im.size
    px = g.load()
    xs = range(0, w, 4)
    ys = range(0, h, 4)

    def row_mean(y):
        return sum(px[x, y] for x in xs) / len(xs)

    def col_mean(x):
        return sum(px[x, y] for y in ys) / len(ys)

    top = 0
    while top < h // 4 and row_mean(top) <= BAR_THRESHOLD:
        top += 1
    bottom = h - 1
    while bottom > h * 3 // 4 and row_mean(bottom) <= BAR_THRESHOLD:
        bottom -= 1
    left = 0
    while left < w // 4 and col_mean(left) <= BAR_THRESHOLD:
        left += 1
    right = w - 1
    while right > w * 3 // 4 and col_mean(right) <= BAR_THRESHOLD:
        right -= 1

    print("  黒帯: 上%d 下%d 左%d 右%d px" % (top, h - 1 - bottom, left, w - 1 - right))
    return im.crop((left, top, right + 1, bottom + 1))


def to_16x9(im):
    """中央基準で 16:9 に切り、1280x720 へ。"""
    w, h = im.size
    target = WIDTH / HEIGHT
    if w / h > target:
        nw = int(h * target)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((WIDTH, HEIGHT), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True,
                    help="記事のslug（例 2026-09-09-two-and-half-hour-commute）")
    ap.add_argument("--prompt", help="生成に渡すプロンプト（英語）")
    ap.add_argument("--from", dest="src", help="生成せず、このファイルを整えるだけ")
    ap.add_argument("--engine", choices=["gemini", "pollinations"], default="gemini",
                    help="生成エンジン（既定 gemini。GEMINI_API_KEY が要る）")
    ap.add_argument("--seed", type=int,
                    help="構図を再現したいときに指定。pollinations のみ有効")
    ap.add_argument("--no-style", action="store_true",
                    help="共通のスタイル指定を足さず、--prompt をそのまま使う")
    args = ap.parse_args()

    if not args.prompt and not args.src:
        ap.error("--prompt か --from のどちらかが必要です。")

    if args.src:
        src = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
        print("入力: %s" % src)
        im = Image.open(src).convert("RGB")
    else:
        prompt = args.prompt if args.no_style else args.prompt.rstrip() + STYLE_SUFFIX
        if args.engine == "gemini":
            print("生成: Gemini (%s)" % GEMINI_MODEL)
            raw = generate_gemini(prompt)
        else:
            print("生成: Pollinations (seed=%s)"
                  % (args.seed if args.seed is not None else "random"))
            raw = generate_pollinations(prompt, args.seed)
        im = Image.open(io.BytesIO(raw)).convert("RGB")

    print("  元サイズ: %dx%d" % im.size)
    im = to_16x9(trim_bars(im))

    os.makedirs(IMAGES_DIR, exist_ok=True)
    out = os.path.join(IMAGES_DIR, args.slug + ".jpg")
    im.save(out, "JPEG", quality=88, optimize=True)
    rel = os.path.relpath(out, ROOT).replace(os.sep, "/")
    print("保存: %s (%d bytes)" % (rel, os.path.getsize(out)))
    print("")
    print("  記事に反映するには（Git Bash では MSYS_NO_PATHCONV=1 が要る。")
    print("  付けないと /blog/... が Windows パスに変換されて OGP が壊れる）:")
    print("    MSYS_NO_PATHCONV=1 node tools/new-post.js --week N --body drafts/wNN.html \\")
    print("      --excerpt \"...\" --image /%s" % rel)


if __name__ == "__main__":
    main()
