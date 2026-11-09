// A generic mock web app drawn as HTML inside the kit's window, in place of recorded footage.
// Laid out in capture CSS px (1440x810), the space the kit's pointer and camera take boxes in, and
// scaled into the 1536x864 window by K (a static transform on a wrapper GSAP never touches).
//
// Two type scales: "normal" (hero, 23 capture px minimum = 24.5 px on the 1080 canvas at wide) and
// "big" (twins, whose panels are drawn at 0.545 of the stage: 44 capture px minimum = 25.6 px).
// No brand, no logo: a square glyph and the word "Workspace".

export const CAP = { w: 1440, h: 810 };

const UI = {
  bg: "#FFFFFF",
  side: "#F0F2EF",
  line: "#D3D7D2",
  ink: "#141414",
  muted: "#5A605C",
  sk: "#E3E6E2",
  skHi: "rgba(255,255,255,0.75)",
  select: "#BFE3CB",
};

// Abstract "posters" for the cards (no text, no logos): flat shapes in the page's greys and ink.
const POSTERS = [
  { bg: "#2F3A34", html: `<div style="position:absolute;left:52%;top:18%;width:150px;height:150px;border-radius:50%;background:#E3E6E2"></div><div style="position:absolute;left:10%;bottom:14%;width:58%;height:22px;background:#E3E6E2"></div><div style="position:absolute;left:10%;bottom:24%;width:36%;height:22px;background:#8E9A8C"></div>` },
  { bg: "#C9CFC6", html: `<div style="position:absolute;left:-20%;top:38%;width:140%;height:70px;background:#141414;transform:rotate(-16deg)"></div><div style="position:absolute;left:12%;top:12%;width:70px;height:70px;background:#FFFFFF"></div>` },
  { bg: "#8E9A8C", html: `<div style="position:absolute;left:12%;top:14%;width:46%;height:46%;background:#FFFFFF"></div><div style="position:absolute;left:38%;top:40%;width:46%;height:46%;background:#141414"></div>` },
];

/**
 * mockApp({ p, scale = "normal", cards, prompt, page }) -> { css, html, boxes }
 * p: id prefix. boxes: capture-px boxes of the controls (for the kit's pointer/camera).
 */
export function mockApp({ p, scale = "normal", K, cards, prompt = "A poster for the spring market", settings = false }) {
  const big = scale === "big";
  const S = big
    ? { top: 96, glyph: 44, brand: 44, side: 112, h1: 64, compH: 120, comp: 44, btnW: 230, btnH: 88, btn: 44, cardTop: 360, cardH: 430, img: 300, title: 44, meta: 0, pad: 48 }
    : { top: 64, glyph: 28, brand: 24, side: 260, h1: 44, compH: 96, comp: 26, btnW: 160, btnH: 60, btn: 24, cardTop: 300, cardH: 470, img: 300, title: 26, meta: 23, pad: 48 };
  const mainL = S.side + S.pad; // 308 normal
  const mainW = CAP.w - mainL - S.pad; // 1084 normal
  const compT = big ? 196 : 168;
  const btn = { x: mainL + mainW - 16 - S.btnW, y: compT + (S.compH - S.btnH) / 2, w: S.btnW, h: S.btnH };
  const gap = 29;
  const cw = (mainW - 2 * gap) / 3;
  const cardsData = cards ?? [
    { title: "Spring market", meta: "Poster · 4:5" },
    { title: "Market day", meta: "Story · 9:16" },
    { title: "Fresh this week", meta: "Banner · 4:1" },
  ];
  const cardBoxes = cardsData.map((_, i) => ({ x: mainL + i * (cw + gap), y: S.cardTop, w: cw, h: S.cardH }));
  const titleTop = 14 + S.img + 22;
  const titleBoxes = cardBoxes.map((b) => ({ x: b.x + 10, y: b.y + titleTop - 10, w: cw - 20, h: S.title + 20 }));

  const css = `
    #${p}-app { position: absolute; left: 0; top: 0; width: ${CAP.w}px; height: ${CAP.h}px; transform: scale(${K}); transform-origin: 0 0; background: ${UI.bg}; color: ${UI.ink}; font-family: "Archivo", Helvetica, Arial, sans-serif; overflow: hidden; }
    #${p}-app .bar { position: absolute; left: 0; top: 0; width: 100%; height: ${S.top}px; border-bottom: 2px solid ${UI.line}; display: flex; align-items: center; padding: 0 28px; gap: 16px; }
    #${p}-app .glyph { width: ${S.glyph}px; height: ${S.glyph}px; border-radius: ${Math.round(S.glyph / 4)}px; background: ${UI.ink}; flex: none; }
    #${p}-app .brand { font-size: ${S.brand}px; font-weight: 700; letter-spacing: -0.01em; }
    #${p}-app .share { margin-left: auto; height: ${big ? 64 : 40}px; padding: 0 ${big ? 28 : 18}px; border: 2px solid ${UI.line}; border-radius: 8px; display: flex; align-items: center; font-size: ${big ? 44 : 23}px; font-weight: 600; }
    #${p}-app .avatar { width: ${big ? 60 : 40}px; height: ${big ? 60 : 40}px; border-radius: 50%; background: #8E9A8C; flex: none; }
    #${p}-app .side { position: absolute; left: 0; top: ${S.top}px; width: ${S.side}px; bottom: 0; background: ${UI.side}; border-right: 2px solid ${UI.line}; padding: 32px 16px; }
    #${p}-app .nav { height: ${big ? 76 : 48}px; border-radius: 8px; display: flex; align-items: center; justify-content: ${big ? "center" : "flex-start"}; gap: 14px; padding: 0 ${big ? 0 : 14}px; font-size: 24px; font-weight: 500; color: ${UI.muted}; margin-bottom: 8px; }
    #${p}-app .nav i { width: ${big ? 32 : 20}px; height: ${big ? 32 : 20}px; border: ${big ? 4 : 2.5}px solid currentColor; border-radius: ${big ? 8 : 5}px; flex: none; }
    #${p}-app .nav.on { background: ${UI.bg}; color: ${UI.ink}; font-weight: 700; box-shadow: 0 0 0 2px ${UI.line}; }
    #${p}-app .nav.bottom { position: absolute; left: 16px; right: 16px; bottom: 24px; margin: 0; }
    #${p}-app .h1 { position: absolute; left: ${mainL}px; top: ${big ? S.top + 28 : 92}px; font-size: ${S.h1}px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; font-variation-settings: "wdth" 112; }
    #${p}-app .count { position: absolute; right: ${S.pad}px; top: ${big ? S.top + 40 : 104}px; font-size: ${big ? 44 : 23}px; color: ${UI.muted}; }
    #${p}-app .comp { position: absolute; left: ${mainL}px; top: ${compT}px; width: ${mainW}px; height: ${S.compH}px; border: 2px solid ${UI.line}; border-radius: 12px; display: flex; align-items: center; padding-left: 28px; font-size: ${S.comp}px; }
    #${p}-btn { position: absolute; left: ${btn.x}px; top: ${btn.y}px; width: ${btn.w}px; height: ${btn.h}px; border-radius: 8px; background: ${UI.ink}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: ${S.btn}px; font-weight: 700; }
    #${p}-app .card { position: absolute; top: ${S.cardTop}px; width: ${cw}px; height: ${S.cardH}px; border: 2px solid ${UI.line}; border-radius: 12px; background: ${UI.bg}; overflow: hidden; }
    #${p}-app .img { position: absolute; left: 14px; top: 14px; right: 14px; height: ${S.img}px; border-radius: 8px; overflow: hidden; }
    #${p}-app .ttl { position: absolute; left: 18px; top: ${titleTop}px; font-size: ${S.title}px; font-weight: 700; line-height: 1; white-space: nowrap; letter-spacing: -0.01em; }
    #${p}-app .meta { position: absolute; left: 18px; top: ${titleTop + S.title + 14}px; font-size: ${S.meta}px; color: ${UI.muted}; white-space: nowrap; }
    #${p}-app .sk { position: absolute; inset: 0; background: ${UI.bg}; opacity: 0; }
    #${p}-app .sk-img { position: absolute; left: 14px; top: 14px; right: 14px; height: ${S.img}px; border-radius: 8px; background: ${UI.sk}; overflow: hidden; }
    #${p}-app .sk-hi { position: absolute; top: 0; left: 0; width: 180px; height: 100%; background: linear-gradient(90deg, rgba(255,255,255,0), ${UI.skHi}, rgba(255,255,255,0)); }
    #${p}-app .sk-bar { position: absolute; left: 18px; height: ${big ? 40 : 24}px; border-radius: 6px; background: ${UI.sk}; }
    #${p}-ring { position: absolute; left: -10px; top: -9px; right: -12px; bottom: -9px; border: 2.5px solid ${UI.ink}; border-radius: 6px; opacity: 0; }
    #${p}-caretw { display: inline-block; position: relative; width: 0; height: 1em; vertical-align: top; }
    #${p}-caret { position: absolute; left: 0; top: -0.12em; width: 2.5px; height: 1.24em; background: ${UI.ink}; opacity: 0; }
    #${p}-main { position: absolute; inset: 0; }
    #${p}-set { position: absolute; left: ${S.side}px; top: ${S.top}px; right: 0; bottom: 0; background: ${UI.bg}; opacity: 0; }
    #${p}-set .row { position: absolute; left: ${S.pad}px; right: ${S.pad}px; height: ${big ? 120 : 84}px; border-bottom: 2px solid ${UI.line}; display: flex; align-items: center; font-size: ${big ? 44 : 26}px; font-weight: 600; }
    #${p}-set .sw { margin-left: auto; width: ${big ? 104 : 64}px; height: ${big ? 56 : 36}px; border-radius: 999px; background: ${UI.line}; position: relative; }
    #${p}-set .sw b { position: absolute; top: ${big ? 6 : 4}px; left: ${big ? 6 : 4}px; width: ${big ? 44 : 28}px; height: ${big ? 44 : 28}px; border-radius: 50%; background: #fff; }
    #${p}-set .sw.on { background: ${UI.ink}; }`;

  const navs = big
    ? `<div class="nav"><i></i></div><div class="nav on"><i></i></div><div class="nav"><i></i></div><div class="nav bottom"><i></i></div>`
    : `<div class="nav"><i></i>Home</div><div class="nav on"><i></i>Drafts</div><div class="nav"><i></i>Library</div><div class="nav"><i></i>Brand kit</div><div class="nav bottom"><i></i>Settings</div>`;

  // the first card's title can be put into edit mode: a focus ring and a caret after its first word
  const editable = (t) => {
    const [w, ...rest] = t.split(" ");
    return `<div id="${p}-ring"></div><span id="${p}-w0">${w}</span><span id="${p}-caretw"><span id="${p}-caret"></span></span>${rest.length ? " " + rest.join(" ") : ""}`;
  };
  const cardHtml = cardsData
    .map((c, i) => {
      const P = POSTERS[i % POSTERS.length];
      const b = cardBoxes[i];
      return `<div class="card" id="${p}-card${i}" style="left:${b.x}px">
            <div id="${p}-cc${i}">
              <div class="img" style="background:${P.bg}">${P.html}</div>
              <div class="ttl" id="${p}-ttl${i}">${i === 0 ? editable(c.title) : c.title}</div>${S.meta ? `
              <div class="meta" id="${p}-meta${i}">${c.meta}</div>` : ""}
            </div>
            <div class="sk" id="${p}-sk${i}">
              <div class="sk-img"><div class="sk-hi" id="${p}-skhi${i}"></div></div>
              <div class="sk-bar" style="top:${titleTop}px; width:${Math.round(cw * 0.58)}px"></div>${S.meta ? `
              <div class="sk-bar" style="top:${titleTop + S.title + 16}px; width:${Math.round(cw * 0.36)}px"></div>` : ""}
            </div>
          </div>`;
    })
    .join("\n          ");

  const setHtml = settings
    ? `
          <div id="${p}-set">
            <div class="h1" style="left:${S.pad}px; top:${big ? 28 : 28}px">Settings</div>
            <div class="row" style="top:${big ? 120 : 96}px">Auto-save<div class="sw on" id="${p}-sw0"><b id="${p}-sw0k" style="left:auto; right:${big ? 6 : 4}px"></b></div></div>
            <div class="row" style="top:${big ? 240 : 180}px">Share link<div class="sw" id="${p}-sw1"><div id="${p}-sw1f" style="position:absolute;inset:0;border-radius:999px;background:${UI.ink};opacity:0"></div><b id="${p}-sw1k"></b></div></div>
            <div class="row" style="top:${big ? 360 : 264}px">Default size<span style="margin-left:auto; color:${UI.muted}; font-weight:500">4:5</span></div>
          </div>`
    : "";

  const html = `<div id="${p}-app">
          <div class="bar"><div class="glyph"></div><div class="brand">Workspace</div><div class="share">Share</div><div class="avatar"></div></div>
          <div class="side">${navs}</div>
          <div id="${p}-main">
          <div class="h1">Drafts</div>
          <div class="count">3 ready</div>
          <div class="comp">${prompt}</div>
          <div id="${p}-btn"><span id="${p}-btnl">Generate</span></div>
          ${cardHtml}
          </div>${setHtml}
        </div>`;

  const boxes = { btn, cards: cardBoxes, titles: titleBoxes, mainL, mainW, titleTop, S };
  return { css, html, boxes };
}

export const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
