# -*- coding: utf-8 -*-
"""theme-plan.json と CONTENT-PLAN.md を _themes.py から生成する。"""
import datetime, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _themes import THEMES, CATEGORIES, EXCLUDED

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = datetime.date(2026, 8, 26)   # 毎週水曜公開の第1回

SLUGS = [
 "why-i-could-change","running-with-peers","two-and-half-hour-commute","careful-work-is-a-brand",
 "bbq-25-makers","engineer-to-people-work","deep-over-wide","healthspan-investment",
 "speed-and-accuracy","learning-to-delegate","wanted-vs-assigned","peers-are-assets",
 "mental-is-like-training","isolate-the-variables","typhoon-day-friends","steps-to-independence",
 "communication-is-a-skill","design-for-longevity","excellence-not-perfection","environment-raises-standards",
 "dont-deny-your-past","friends-of-friends","know-your-cashflow","self-others-place",
 "say-it-with-conviction","facing-thirty","understand-before-being-understood","condition-management",
 "beyond-your-role","the-first-request","nobody-starts-motivated","small-habits-big-change",
 "teaching-ai-to-the-team","the-fear-of-resigning","listening-to-stories","good-morning-to-family",
 "publishing-on-the-web","direction-over-speed","learning-creates-network","vague-dreams-stall-you",
]
assert len(SLUGS) == len(THEMES)

CTA = {
 "career":  {"label": "キャリアデザインサポートに相談する", "url": "/ryupro/contact/"},
 "contact": {"label": "ryuproに問い合わせる",             "url": "/ryupro/contact/"},
 "rakusake":{"label": "楽SAKEターミナルを見る",           "url": "https://ryupro202211-ops.github.io/rakusake/"},
}

PLAN_PATH = os.path.join(ROOT, "blog", "data", "theme-plan.json")
# 再生成しても公開済みの状態を失わないよう、既存の status を引き継ぐ
prev_status = {}
if os.path.exists(PLAN_PATH):
    with open(PLAN_PATH, encoding="utf-8") as f:
        for _w in json.load(f).get("weeks", []):
            prev_status[_w["week"]] = _w.get("status", "planned")

plan = []
for i, (cat, title, source, angle, cta, note_written) in enumerate(THEMES):
    d = START + datetime.timedelta(weeks=i)
    plan.append({
        "week": i + 1,
        "date": d.isoformat(),
        "date_display": d.strftime("%Y.%m.%d"),
        "status": prev_status.get(i + 1, "planned"),
        "category": cat,
        "category_label": CATEGORIES[cat]["label"],
        "service": CATEGORIES[cat]["service"],
        "title": "【%s】%s" % (CATEGORIES[cat]["label"], title),
        "headline": title,
        "slug": "%s-%s" % (d.isoformat(), SLUGS[i]),
        "source": source,
        "angle": angle,
        "cta": CTA[cta],
        "note_published": note_written,
    })

out = {
    "generated_from": "Notion: 📝 noteブログテーマ統合DB（2026年1月〜7月） "
                      "https://app.notion.com/p/5c1ca1cd36864d629e1865b7dfdeabc4",
    "cadence": "毎週水曜 公開（週1本）",
    "start_date": START.isoformat(),
    "weeks": plan,
}
os.makedirs(os.path.join(ROOT, "blog", "data"), exist_ok=True)
with open(PLAN_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
    f.write("\n")

# ---- CONTENT-PLAN.md ----
md = []
md.append("# ryupro ブログ 週次コンテンツ計画\n")
md.append("**元データ**: Notion「📝 noteブログテーマ統合DB（2026年1月〜7月）」全100テーマ  ")
md.append("<https://app.notion.com/p/5c1ca1cd36864d629e1865b7dfdeabc4>\n")
md.append("**刊行ペース**: 毎週水曜 1本（%s 開始・全%d週＝約%dヶ月分）\n" % (
    START.strftime("%Y年%-m月%-d日") if os.name != "nt" else START.strftime("%Y年%m月%d日"),
    len(plan), round(len(plan) / 4.33)))
md.append("## 選定の考え方\n")
md.append("noteの元テーマは大塚個人の日々の記録がベースで、社内向けの用語や個人的な出来事も多く含まれます。")
md.append("そのため、合同会社ryuproのコーポレートサイトに載せる前提で以下の基準で絞り込みました。\n")
md.append("**採用基準**\n")
md.append("1. ryuproの4事業（イベント企画・運営／コミュニティデザイン／キャリアデザインサポート／ライフスタイルプロデュース）のいずれかに接続できる")
md.append("2. 社外の初見の読者が、前提知識なしで最後まで読める")
md.append("3. 「挑戦する人が、当たり前に挑戦できる社会をつくる」という経営理念と矛盾しない")
md.append("4. 代表・大塚のIT業界15年 → 独立という経歴が説得力として効く\n")
md.append("**除外したテーマと理由**\n")
for t, r in EXCLUDED:
    md.append("- **%s** … %s" % (t, r))
md.append("")
md.append("## カテゴリ配分\n")
counts = {}
for p in plan:
    counts[p["category_label"]] = counts.get(p["category_label"], 0) + 1
md.append("| カテゴリ | 本数 | 対応する事業 |")
md.append("|---|---:|---|")
for c in CATEGORIES.values():
    md.append("| %s | %d | %s |" % (c["label"], counts.get(c["label"], 0), c["service"]))
md.append("")
md.append("カテゴリを毎週ローテーションさせ、同じテーマ性が2週続かないように配置しています。\n")
md.append("## 週次スケジュール\n")
md.append("| # | 公開日 | カテゴリ | タイトル | 元ネタ | note公開済 |")
md.append("|---:|---|---|---|---|:-:|")
for p in plan:
    md.append("| %d | %s (水) | %s | %s | %s | %s |" % (
        p["week"], p["date"], p["category_label"], p["headline"], p["source"],
        "✓" if p["note_published"] else "—"))
md.append("")
md.append("`note公開済` が `—` のテーマは、noteにもまだ書いていない未使用ネタです。")
md.append("同じ内容をnoteとHPに重複掲載するとSEO上不利になるため、HP掲載時はタイトル・導入・締めを書き換えて別記事として仕上げます。\n")
md.append("## 運用手順\n")
md.append("```bash")
md.append("node tools/new-post.js --next          # 次に書く週のテーマを表示")
md.append("node tools/new-post.js --week 2 --body drafts/w02.html   # 記事を生成して公開")
md.append("node tools/rebuild-posts.js                              # テンプレ変更後に全記事を作り直す")
md.append("```\n")
md.append("1. `--next` で今週のテーマ・切り口・CTAを確認する")
md.append("2. 本文を `<h2>` / `<p>` / `<blockquote>` / `<strong>` のみで書く（既存CSSがそのまま効きます）")
md.append("3. `python tools/make-eyecatch.py --slug <slug> --prompt \"...\"` でアイキャッチを用意する（省略可）")
md.append("4. `--week N --body <file> --image /blog/posts/images/<slug>.jpg` で記事を生成し、`blog/data/posts.json` の先頭に追加")
md.append("5. `git commit && git push` → GitHub Actions が自動デプロイ\n")
md.append("## ツールの構成\n")
md.append("- `blog/blog.css` … 一覧・記事の共通スタイル。**デザイン変更はここだけを直す**")
md.append("- `tools/_themes.py` … 40テーマのマスターデータ。テーマを増やす／直すのはここ")
md.append("- `tools/gen-theme-plan.py` … `_themes.py` から theme-plan.json と本ファイルを生成（公開済みstatusは引き継ぐ）")
md.append("- `tools/render-post.js` … テンプレートへの流し込み。new-post.js と rebuild-posts.js が共有")
md.append("- `tools/new-post.js` … 週次投稿。記事生成／posts.json／sitemap.xml をまとめて更新")
md.append("- `tools/rebuild-posts.js` … posts.json の content から全記事を再生成（テンプレ／CSS変更後に実行）")
md.append("- `tools/make-eyecatch.py` … アイキャッチ画像の生成（既定 Gemini／`--engine pollinations` も可）と黒帯除去。1280x720 で `blog/posts/images/` に出力")
md.append("- `tools/add-noindex.py` … PJ/ 配下の顧客向けページに noindex を付与（冪等）\n")
md.append("## 記事の型（1本あたり1,200〜1,800字）\n")
md.append("1. **導入**（150字）— 実際にあった場面を一つだけ描写する")
md.append("2. **本題**（`<h2>` 2〜3本）— 出来事 → そのとき考えたこと → 一般化できる学び")
md.append("3. **自分の経験と重ねる**（200字）— ITエンジニア15年／独立／法人設立のどこかに接続する")
md.append("4. **読者への問い**（100字）— 断定せず、読者自身に置き換えてもらう")
md.append("5. **CTA** — 週ごとに指定（お問い合わせ or 楽SAKEターミナル）\n")
md.append("**書くときの禁止事項**\n")
md.append("- 社内用語（エンロール／動員／報連相／T-UP／Cトレ）をそのまま使わない")
md.append("- 実在の個人を特定できる書き方をしない（「30代のエンジニアの方」まで）")
md.append("- 収益・利回り・投資成果を断定しない")
md.append("- 「絶対」「必ず」で読者を煽らない\n")
md.append("- 記事本文に `<style>` タグやインラインの style 属性を書かない（スタイルは blog/blog.css に集約している）\n")
md.append("## 記事の更新経路は tools/ に一本化されています\n")
md.append("以前は `server.js` + `/admin` の管理画面と `tools/new-post.js` の2系統が同じ `posts.json` を書き換えており、")
md.append("`server.js` は起動のたびに `content` から記事HTMLを全再生成していました。")
md.append("そのため `content` を持たない手書き記事は、サーバーを起動しただけで本文が消えていました。\n")
md.append("現在は次のようになっています。\n")
md.append("- `server.js` は表示確認だけの静的サーバー。**ファイルを一切書き換えません**")
md.append("- 管理画面（`/admin`）と記事API、画像アップロードは廃止（実体のHTMLも存在しませんでした）")
md.append("- 記事の追加は `node tools/new-post.js`、再生成は `node tools/rebuild-posts.js` だけ\n")
md.append("`posts.json` の `content` は残してあります。テンプレートや `blog.css` を変えたあとに")
md.append("`rebuild-posts.js` で記事を作り直すための元データとして使うためです。")
md.append("`tools/new-post.js` は必ず `content` を書き込みます。\n")
md.append("`blog/posts/2026-05-16-gyoza.html` はヒーロー画像を含む手書き記事で `content` を持たない例外です。")
md.append("`rebuild-posts.js` はこれをスキップするので、内容を変えるときはHTMLを直接編集してください。\n")
with open(os.path.join(ROOT, "blog", "CONTENT-PLAN.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(md))
print("OK: %d weeks / %s -> %s" % (len(plan), plan[0]["date"], plan[-1]["date"]))
