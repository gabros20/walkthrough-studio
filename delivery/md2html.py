#!/usr/bin/env python3
"""README.md -> a self-contained, branded README.html (fonts and logo embedded, opens on double-click).

usage: python3 -I delivery/md2html.py README.md README.html [--config package.config.json]

Handles what the package READMEs use: #/## headings, paragraphs, '- ' lists, pipe tables, `code`, **bold**,
*italic*. Brand tokens (accent, ink, paper, logo, woff2 fonts) come from the config's "brand" block, which may also be
the film kit's brand.json ("brand": "brand.json" or {"file": "brand.json", "footer": "..."}):
  "brand": {"name": "Acme", "accent": "#E4002B", "ink": "#141414", "paper": "#F4F2EE",
            "logo": "assets/brand/logo-black.png",
            "fonts": {"400": "fonts/roboto-400.woff2", "700": "fonts/roboto-700.woff2"},
            "footer": "Product demo package · November 2026"}
Then make the PDF with: node delivery/html2pdf.mjs README.html README.pdf
"""
import base64
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import load_config  # noqa: E402


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*([^*]+)\*(?!\w)", r"<em>\1</em>", t)
    return t


def body(md):
    lines, out, i = md.split("\n"), [], 0
    while i < len(lines):
        l = lines[i]
        if l.startswith("# "):
            out.append(f"<h1>{inline(l[2:])}</h1>"); i += 1
        elif l.startswith("## "):
            out.append(f"<h2>{inline(l[3:])}</h2>"); i += 1
        elif l.startswith("### "):
            out.append(f"<h3>{inline(l[4:])}</h3>"); i += 1
        elif l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            head, rest = rows[0], [r for r in rows[1:] if not all(set(c) <= set("-: ") for c in r)]
            t = "<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            t += "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rest) + "</tbody></table>"
            out.append(t)
        elif re.match(r"^(- |\d+\. )", l):
            tag = "ol" if l[0].isdigit() else "ul"
            items = []
            while i < len(lines) and re.match(r"^(- |\d+\. )", lines[i]):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i])); i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
        elif l.strip() in ("", "---"):
            i += 1
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||- |\d+\. )", lines[i]):
                para.append(lines[i]); i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out)


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__); sys.exit(1)
    src, dst = a[0], a[1]
    brand = load_config(a[a.index("--config") + 1])["brand"] if "--config" in a else {}
    rp = lambda p: p  # load_config resolved every brand path already
    b64 = lambda p: base64.b64encode(open(rp(p), "rb").read()).decode()
    accent, ink, paper = brand.get("accent", "#FD000D"), brand.get("ink", "#141414"), brand.get("paper", "#F4F2EE")
    faces = "".join(f"@font-face{{font-family:B;font-weight:{w};src:url(data:font/woff2;base64,{b64(p)}) format('woff2')}}"
                    for w, p in brand.get("fonts", {}).items() if os.path.exists(rp(p)))
    logo = f'<img src="data:image/png;base64,{b64(brand["logo"])}" alt="{html.escape(brand.get("name", ""))}">' if brand.get("logo") and os.path.exists(rp(brand["logo"])) else ""
    md = open(src, encoding="utf-8").read()
    title = next((l[2:] for l in md.splitlines() if l.startswith("# ")), "README")
    doc = f"""<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><style>{faces}
:root{{--accent:{accent};--ink:{ink};--paper:{paper};--mute:color-mix(in srgb,var(--ink) 62%,transparent);--line:color-mix(in srgb,var(--ink) 14%,transparent)}}
*{{box-sizing:border-box}}html{{background:var(--paper)}}
body{{margin:0 auto;max-width:980px;padding:56px 48px 72px;font:400 16px/1.55 B,system-ui,sans-serif;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}}
header{{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;min-height:20px}}header img{{width:120px;display:block}}
header span{{font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}}
h1{{font-weight:700;font-size:40px;line-height:1.08;letter-spacing:-.015em;margin:0 0 10px;position:relative;padding-top:22px}}
h1:before{{content:"";position:absolute;top:0;left:0;width:44px;height:4px;background:var(--accent)}}
h1+p{{color:var(--mute);margin-top:0}}h2{{font-weight:700;font-size:21px;margin:38px 0 12px;padding-top:16px;border-top:1px solid var(--line)}}
h3{{font-size:17px;margin:24px 0 8px}}p{{margin:0 0 12px}}strong{{font-weight:700}}em{{font-style:normal;color:var(--mute)}}
code{{font:500 13px/1.4 ui-monospace,Menlo,monospace;background:color-mix(in srgb,var(--ink) 6%,transparent);padding:1px 5px;border-radius:3px;overflow-wrap:anywhere}}
table{{width:100%;border-collapse:collapse;margin:8px 0 6px;font-size:14.5px;background:#fff}}th{{text-align:left;font-weight:700;padding:10px 12px;border-bottom:2px solid var(--ink);vertical-align:bottom}}
td{{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}}td:first-child{{width:22%}}td:first-child code{{overflow-wrap:normal;font-weight:700;background:none;padding:0}}ul,ol{{padding-left:20px;margin:0 0 12px}}li{{margin:0 0 8px}}li::marker{{color:var(--accent)}}
footer{{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);font-size:13px;color:var(--mute)}}
@media (max-width:640px){{body{{padding:32px 16px}}h1{{font-size:30px}}table{{font-size:13px}}}}
@media print{{@page{{size:A4;margin:14mm}}html,body{{background:#fff}}body{{padding:0;max-width:none;font-size:10.4pt;line-height:1.45}}h1{{font-size:26pt}}h2{{font-size:13pt;margin:20px 0 8px;break-after:avoid}}table{{font-size:9.4pt}}th,td{{padding:6px 8px}}tr{{break-inside:avoid}}}}
</style></head><body>
<header>{logo}<span>{html.escape(brand.get("eyebrow", "Demo package"))}</span></header>
{body(md)}
<footer>{html.escape(brand.get("footer", ""))}</footer>
</body></html>"""
    open(dst, "w", encoding="utf-8").write(doc)
    print(dst)


if __name__ == "__main__":
    main()
