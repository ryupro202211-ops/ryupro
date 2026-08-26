# -*- coding: utf-8 -*-
"""PJ/ 配下の顧客向けページに noindex を付与する。

GitHub Pages のプロジェクトサイトでは robots.txt が
https://<user>.github.io/robots.txt （ドメイン直下）しか参照されず、
https://<user>.github.io/ryupro/robots.txt は
クローラに読まれない。したがって PJ/ を検索避けする唯一の確実な手段が
各ページの <meta name="robots" content="noindex, ..."> になる。

冪等。既に noindex があるファイルはスキップする。
"""
import glob
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = '<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">'

added, skipped, failed = [], [], []

for path in sorted(glob.glob(os.path.join(ROOT, "PJ", "**", "*.html"), recursive=True)):
    rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
    src = io.open(path, encoding="utf-8").read()

    if "noindex" in src:
        skipped.append(rel)
        continue

    # <head> の直後に差し込む（charset より前でも仕様上問題ない）
    m = re.search(r"<head[^>]*>", src, re.I)
    if not m:
        failed.append(rel)
        continue

    pos = m.end()
    out = src[:pos] + "\n" + TAG + src[pos:]
    io.open(path, "w", encoding="utf-8", newline="").write(out)
    added.append(rel)

print("noindex 付与: %d件" % len(added))
for r in added:
    print("  + " + r)
if skipped:
    print("既に付与済み: %d件" % len(skipped))
    for r in skipped:
        print("  = " + r)
if failed:
    print("!! <head> が見つからず未処理: %d件" % len(failed))
    for r in failed:
        print("  ! " + r)
