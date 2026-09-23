#!/usr/bin/env python3
"""Build the public legal pages from the approved privacy notice.

Source of truth: docs/legal/adatvedelmi-tajekoztato.md (the text Péter approved,
copied in unchanged). Output, served by Vercel with cleanUrls:
  public/adatvedelem.html  -> /adatvedelem   (Hungarian notice)
  public/privacy.html      -> /privacy       (English notice)

The notice text is NOT edited here. The only substitutions are the ones the owner
asked for (2026-09-23): the effective date, the square brackets around the in-app
path (the feature now exists), and the version label: the source still reads
"1.0 (draft)", the published notice is "1.1" since the VIES tax-number check was
added (2026-09-23). Every substitution asserts that it hit
exactly once, so a changed source fails loudly instead of publishing half-edited.

The account-deletion page (public/fiok-torlese.html) is hand-written, not generated:
it is a short how-to, not the notice.

Run: python3 scripts/build-legal-pages.py   (needs markdown-it-py)
"""
from pathlib import Path
import re
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/legal/adatvedelmi-tajekoztato.md"

EDITS = {
    "hu": [
        ("**Hatályos:** 2026. szeptember [nap].", "**Hatályos:** 2026. szeptember 23."),
        ("[az alkalmazásban: Beállítások → Fiók törlése]", "az alkalmazásban: Beállítások → Fiók törlése"),
        ("**Verzió:** 1.0 (tervezet)", "**Verzió:** 1.1"),
    ],
    "en": [
        ("**Effective:** September [day], 2026", "**Effective:** September 23, 2026"),
        ("[in the app: Settings → Delete account]", "in the app: Settings → Delete account"),
        ("**Version:** 1.0 (draft)", "**Version:** 1.1"),
    ],
}

PAGES = {
    "hu": {"file": "adatvedelem.html", "lang": "hu", "title": "P-Search – Adatvédelmi tájékoztató",
           "other": ("/privacy", "English version", "en"), "delete": ("/fiok-torlese", "Fiók és adatok törlése")},
    "en": {"file": "privacy.html", "lang": "en", "title": "P-Search – Privacy Policy",
           "other": ("/adatvedelem", "Magyar változat", "hu"), "delete": ("/fiok-torlese#en", "Delete your account and data")},
}

CSS = """
:root { --ink:#212121; --muted:#5f6368; --brand:#1A237E; --link:#1565C0; --line:#e0e0e0; --ground:#f5f5f5; --card:#fff; }
* { box-sizing: border-box; }
body { margin:0; background:var(--ground); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
.wrap { max-width:760px; margin:0 auto; padding:16px; }
nav { display:flex; flex-wrap:wrap; gap:8px 16px; justify-content:flex-end; font-size:.95rem; padding:4px 0 12px; }
main { background:var(--card); border-radius:16px; padding:20px 18px; box-shadow:0 2px 12px rgba(0,0,0,.06); }
@media (min-width:600px) { main { padding:32px 36px; } }
h1 { color:var(--brand); font-size:1.5rem; line-height:1.25; margin:0 0 8px; text-wrap:balance; }
h2 { color:var(--brand); font-size:1.15rem; margin:28px 0 8px; }
p, li { max-width:68ch; }
a { color:var(--link); overflow-wrap:anywhere; }
a:focus-visible { outline:2px solid var(--link); outline-offset:2px; border-radius:2px; }
code { font-size:.9em; background:#f1f3f4; padding:1px 4px; border-radius:4px; }
.table { overflow-x:auto; margin:12px 0; border:1px solid var(--line); border-radius:8px; }
table { border-collapse:collapse; width:100%; font-size:.92rem; min-width:560px; }
th, td { text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--line); }
th { background:#f8f9fb; color:var(--brand); }
tr:last-child td { border-bottom:0; }
footer { color:var(--muted); font-size:.85rem; padding:16px 4px; }
"""

def split_langs(text):
    hu, en = text.split("\n---\n", 1)
    return {"hu": hu.strip() + "\n", "en": en.strip() + "\n"}

def apply_edits(lang, md):
    for old, new in EDITS[lang]:
        n = md.count(old)
        assert n == 1, f"{lang}: expected exactly 1 occurrence of {old!r}, found {n}"
        md = md.replace(old, new)
    return md

def linkify(html):
    # Mail and web addresses become links; the visible text stays exactly the same.
    html = re.sub(r"(?<![\w@/])([\w.+-]+@[\w-]+\.[\w.]+)(?![\w@])", r'<a href="mailto:\1">\1</a>', html)
    html = re.sub(r"(?<![/\w])(www\.naih\.hu)", r'<a href="https://\1">\1</a>', html)
    return html

def render(lang, md):
    p = PAGES[lang]
    body = MarkdownIt("commonmark").enable("table").render(md)
    body = body.replace("<table>", '<div class="table"><table>').replace("</table>", "</table></div>")
    body = linkify(body)
    other_href, other_label, other_lang = p["other"]
    del_href, del_label = p["delete"]
    return f"""<!doctype html>
<html lang="{p['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{p['title']}</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<nav aria-label="{'Kapcsolódó oldalak' if lang == 'hu' else 'Related pages'}">
  <a href="{del_href}">{del_label}</a>
  <a href="{other_href}" hreflang="{other_lang}" lang="{other_lang}">{other_label}</a>
</nav>
<main>
{body}</main>
<footer>P-Search · com.pohankaestarsa.psearch</footer>
</div>
</body>
</html>
"""

def main():
    parts = split_langs(SRC.read_text(encoding="utf-8"))
    for lang, md in parts.items():
        out = ROOT / "public" / PAGES[lang]["file"]
        out.write_text(render(lang, apply_edits(lang, md)), encoding="utf-8")
        print(f"[legal] {out.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
