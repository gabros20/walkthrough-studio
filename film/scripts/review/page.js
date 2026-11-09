// The review page's script (review-bundle.mjs inlines it). Static: no server, no network; the data is
// the JSON in <script id="review-data">. Notes are kept in this browser's localStorage when it allows
// (keyed by the bundle) and leave the page only through "Export notes" (a review-notes.json download).
(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("review-data").textContent);
  var video = document.getElementById("film");
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  };
  var fmt = function (t) {
    if (t === null || t === undefined || isNaN(t)) return "";
    var m = Math.floor(t / 60);
    var s = (t - m * 60).toFixed(2);
    return m + ":" + (s.length < 5 ? "0" + s : s);
  };

  // ---------- notes state (localStorage when available; the page works without it) ----------
  var KEY = "walkthrough-review:" + DATA.storageKey;
  var state = { findings: {}, timed: [], notes: "", reviewer: "" };
  try {
    var saved = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") state = Object.assign(state, saved);
  } catch (e) { /* storage blocked: notes live until the tab closes; export still works */ }
  var save = function () {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  };
  var noteFor = function (id) { return (state.findings[id] = state.findings[id] || { note: "", verdict: "" }); };

  // ---------- seeking ----------
  var seek = function (t) {
    if (t === null || t === undefined || isNaN(t)) return;
    var go = function () {
      video.currentTime = Math.max(0, Math.min(t, (video.duration || t) - 0.001));
      video.pause();
    };
    if (video.readyState >= 1) go();
    else video.addEventListener("loadedmetadata", go, { once: true });
    if (history.replaceState) history.replaceState(null, "", "#t=" + t.toFixed(2));
  };
  var tButton = function (t) {
    if (t === null || t === undefined || isNaN(t)) return el("span", { class: "scene", text: "-" });
    return el("button", { class: "t", type: "button", "data-t": String(t), title: "Seek the video to " + fmt(t), onclick: function () { seek(t); } }, [fmt(t)]);
  };

  // ---------- header ----------
  var R = DATA.render;
  $("#title").textContent = DATA.title;
  var facts = $("#facts");
  [["duration", fmt(R.duration)], ["fps", R.fps], ["size", R.width && R.height ? R.width + "x" + R.height : "?"], ["captions", R.captions ? "on" : "off"], ["audio", R.audio ? "yes" : "no"]].forEach(function (f) {
    facts.appendChild(el("span", {}, [f[0] + " ", el("b", { text: String(f[1]) })]));
  });
  var counts = el("span", { class: "counts" });
  counts.appendChild(el("span", { class: "pill error", text: DATA.counts.errors + " error(s)" }));
  counts.appendChild(el("span", { class: "pill warn", text: DATA.counts.warnings + " warning(s)" }));
  facts.appendChild(counts);

  // ---------- player ----------
  var now = $("#now");
  video.addEventListener("timeupdate", function () { now.textContent = fmt(video.currentTime); highlight(video.currentTime); });
  video.addEventListener("seeked", function () { now.textContent = fmt(video.currentTime); highlight(video.currentTime); });
  video.addEventListener("error", function () {
    $("#video-error").hidden = false;
  });
  $("#back").addEventListener("click", function () { seek(Math.max(0, video.currentTime - 1 / (R.fps || 30))); });
  $("#fwd").addEventListener("click", function () { seek(video.currentTime + 1 / (R.fps || 30)); });

  // timed notes
  var timedList = $("#timed-list");
  var renderTimed = function () {
    timedList.textContent = "";
    state.timed.sort(function (a, b) { return a.t - b.t; });
    state.timed.forEach(function (n, i) {
      var ta = el("textarea", { "aria-label": "Note at " + fmt(n.t), rows: "1", oninput: function (e) { n.text = e.target.value; save(); } });
      ta.value = n.text || "";
      timedList.appendChild(el("li", {}, [tButton(n.t), ta, el("button", { type: "button", title: "Remove this note", onclick: function () { state.timed.splice(i, 1); save(); renderTimed(); } }, ["x"])]));
    });
    $("#timed-empty").hidden = state.timed.length > 0;
  };
  $("#add-timed").addEventListener("click", function () {
    var t = Math.round(video.currentTime * 100) / 100;
    state.timed.push({ t: t, text: "" });
    save();
    renderTimed();
    var areas = timedList.querySelectorAll("textarea");
    for (var i = 0; i < areas.length; i++) if (state.timed[i] && state.timed[i].t === t && !state.timed[i].text) { areas[i].focus(); break; }
  });

  // ---------- findings ----------
  var tbody = $("#findings tbody");
  var rows = [];
  var VERDICTS = ["", "must fix", "should fix", "nice to have", "by design", "misread", "done"];
  DATA.findings.forEach(function (f) {
    var n = noteFor(f.id);
    var sel = el("select", { "aria-label": "Ruling for finding " + f.id, onchange: function (e) { n.verdict = e.target.value; save(); } },
      VERDICTS.map(function (v) { return el("option", { value: v, text: v || "ruling..." }); }));
    sel.value = n.verdict || "";
    var ta = el("textarea", { rows: "1", placeholder: "note", "aria-label": "Note for finding " + f.id, oninput: function (e) { n.note = e.target.value; save(); } });
    ta.value = n.note || "";
    var tr = el("tr", { "data-level": f.level, "data-id": f.id }, [
      el("td", {}, [el("span", { class: "lvl " + f.level, text: f.level })]),
      el("td", {}, [tButton(f.t)]),
      el("td", {}, [f.check, f.scene ? el("div", { class: "scene", text: f.scene }) : null]),
      el("td", {}, [el("div", { class: "detail", text: f.detail }), el("div", { class: "note-row" }, [ta, sel])]),
    ]);
    rows.push({ tr: tr, f: f });
    tbody.appendChild(tr);
  });
  $("#findings-empty").hidden = DATA.findings.length > 0;
  var applyFilter = function () {
    var on = {};
    document.querySelectorAll("#filters input").forEach(function (c) { on[c.value] = c.checked; });
    rows.forEach(function (r) { r.tr.hidden = on[r.f.level] === false; });
  };
  var levels = {};
  DATA.findings.forEach(function (f) { levels[f.level] = (levels[f.level] || 0) + 1; });
  var filters = $("#filters");
  ["error", "warn", "skip", "ok"].forEach(function (l) {
    if (!levels[l]) return;
    filters.appendChild(el("label", {}, [el("input", { type: "checkbox", value: l, checked: true, onchange: applyFilter }), l + " (" + levels[l] + ")"]));
  });
  var lastActive = null;
  function highlight(t) {
    var best = null;
    rows.forEach(function (r) { if (r.f.t !== null && r.f.t !== undefined && Math.abs(r.f.t - t) < 0.25 && (!best || Math.abs(r.f.t - t) < Math.abs(best.f.t - t))) best = r; });
    if (lastActive && lastActive !== best) lastActive.tr.classList.remove("active");
    if (best) best.tr.classList.add("active");
    lastActive = best;
  }

  // ---------- sheets and strips: click a tile to seek to it ----------
  var tileSeek = function (img, item) {
    return function (e) {
      var r = img.getBoundingClientRect();
      var sx = img.naturalWidth / r.width, sy = img.naturalHeight / r.height;
      var x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sy;
      var cols = item.cols, gap = item.gap || 0, n = item.times.length;
      var rowsN = Math.ceil(n / cols);
      var w = (img.naturalWidth - (cols - 1) * gap) / cols, h = (img.naturalHeight - (rowsN - 1) * gap) / rowsN;
      var i = Math.floor(y / (h + gap)) * cols + Math.floor(x / (w + gap));
      if (i >= 0 && i < n) seek(item.times[i]);
    };
  };
  var mediaItem = function (item, summary) {
    var img = el("img", { src: item.file, alt: summary, loading: "lazy" });
    img.addEventListener("click", tileSeek(img, item));
    return el("details", { class: "item" }, [el("summary", {}, [summary + " ", tButton(item.from)]), img]);
  };
  var sheets = $("#sheets");
  DATA.sheets.forEach(function (s) {
    sheets.appendChild(mediaItem(s, s.scene + "  " + fmt(s.from) + " - " + fmt(s.to) + "  (" + s.times.length + " frames)"));
  });
  $("#sheets-count").textContent = "(" + DATA.sheets.length + ")";
  var cuts = $("#cuts");
  DATA.cuts.forEach(function (c) {
    cuts.appendChild(mediaItem(c, "#" + c.n + " " + c.label + " at " + fmt(c.t)));
  });
  $("#cuts-count").textContent = "(" + DATA.cuts.length + ")";
  if (!DATA.labels) document.querySelectorAll(".label-note").forEach(function (n) { n.hidden = false; });

  // ---------- files ----------
  var files = $("#files");
  DATA.files.forEach(function (f) { files.appendChild(el("li", {}, [el("a", { href: f.href, text: f.name }), " " + f.what])); });

  // ---------- free notes + export ----------
  var free = $("#free-notes");
  free.value = state.notes || "";
  free.addEventListener("input", function () { state.notes = free.value; save(); });
  var reviewer = $("#reviewer");
  reviewer.value = state.reviewer || "";
  reviewer.addEventListener("input", function () { state.reviewer = reviewer.value; save(); });
  var lastUrl = null;
  $("#export").addEventListener("click", function () {
    var out = {
      schema: "walkthrough-review-notes/1",
      render: DATA.render.src,
      bundle: DATA.storageKey,
      exportedAt: new Date().toISOString(),
      reviewer: state.reviewer || null,
      findings: DATA.findings.map(function (f) {
        var n = state.findings[f.id] || {};
        return { id: f.id, level: f.level, check: f.check, scene: f.scene || null, t: f.t, detail: f.detail, verdict: n.verdict || null, note: n.note || null };
      }).filter(function (f) { return f.note || f.verdict; }),
      timed: state.timed.filter(function (n) { return n.text; }).map(function (n) { return { t: n.t, note: n.text }; }),
      notes: state.notes || null,
    };
    var blob = new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" });
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    var a = $("#download");
    a.href = lastUrl;
    a.hidden = false;
    a.textContent = "review-notes.json (" + out.findings.length + " finding note(s), " + out.timed.length + " timed note(s))";
    a.click();
  });

  renderTimed();
  var m = /#t=([\d.]+)/.exec(location.hash);
  if (m) seek(Number(m[1]));
})();
