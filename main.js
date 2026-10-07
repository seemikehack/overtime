/*
Overtime: A Multiplayer Game Clock
Copyright (C) 2026 Michael Atkinson

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
let uid = 0,
  theme = null;
try {
  theme = localStorage.getItem("mpc-theme");
} catch (e) {}
if (theme !== "light" && theme !== "dark") {
  const a = document.documentElement.getAttribute("data-theme");
  theme =
    a === "dark" || a === "light"
      ? a
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}
function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
  $$(".themesel button").forEach((b) =>
    b.classList.toggle("sel", b.dataset.th === theme),
  );
}
function setTheme(t) {
  theme = t;
  try {
    localStorage.setItem("mpc-theme", t);
  } catch (e) {}
  applyTheme();
}
$$(".themesel button").forEach(
  (b) => (b.onclick = () => setTheme(b.dataset.th)),
);
applyTheme();

function show(id) {
  $$(".screen,#play").forEach((e) => e.classList.remove("on"));
  $("#" + id).classList.add("on");
}

/* ---- Players list ---- */
let players = [
  { id: ++uid, name: "" },
  { id: ++uid, name: "" },
];
let sortable = null;
function renderList() {
  const l = $("#list");
  if (sortable) {
    sortable.destroy();
    sortable = null;
  }
  l.innerHTML = "";
  players.forEach((p, i) => {
    const r = document.createElement("div");
    r.className = "row";
    r.dataset.id = p.id;
    r.innerHTML = `<button class="handle" aria-label="Drag to reorder">⠿</button><input maxlength="20" placeholder="Player ${i + 1}" value="">${players.length > 2 ? '<button class="x" aria-label="Remove">✕</button>' : ""}`;
    const inp = r.querySelector("input");
    inp.value = p.name;
    inp.oninput = () => (p.name = inp.value);
    const x = r.querySelector(".x");
    if (x)
      x.onclick = () => {
        players = players.filter((q) => q !== p);
        renderList();
      };
    l.appendChild(r);
  });
  $("#add").style.display = players.length >= 8 ? "none" : "";
  if (window.Draggable && Draggable.Sortable) {
    sortable = new Draggable.Sortable(l, {
      draggable: ".row",
      handle: ".handle",
    });
    sortable.on("sortable:stop", (e) => {
      const o = e.oldIndex,
        n = e.newIndex;
      if (o !== n && o >= 0 && n >= 0)
        players.splice(n, 0, players.splice(o, 1)[0]);
      setTimeout(renderList, 0);
    });
  }
}
$("#add").onclick = () => {
  if (players.length >= 8) return;
  players.push({ id: ++uid, name: "" });
  renderList();
  const inputs = $$("#list .row input");
  const last = inputs[inputs.length - 1];
  last.focus();
  last.scrollIntoView({ block: "nearest" });
};
renderList();
$("#next1").onclick = () => show("s2");
$("#back2").onclick = () => show("s1");

/* ---- Time controls ---- */
let ctl = { m: 5, i: 5 };
const quick = [
    [3, 2],
    [5, 5],
    [10, 0],
  ],
  more = [
    [1, 0],
    [2, 1],
    [3, 0],
    [5, 0],
    [15, 10],
    [15, 0],
    [20, 10],
    [30, 0],
    [30, 20],
    [60, 0],
    [90, 30],
    [120, 0],
  ];
function fill(el, arr) {
  arr.forEach(([m, i]) => {
    const b = document.createElement("button");
    b.dataset.m = m;
    b.dataset.i = i;
    b.innerHTML = `${m}+${i}<small>${m} min + ${i} sec</small>`;
    b.onclick = () => {
      ctl = { m, i };
      $("#cMin").value = m;
      $("#cInc").value = i;
      mark();
    };
    el.appendChild(b);
  });
}
fill($("#quick"), quick);
fill($("#more"), more);
function mark() {
  $("#selInfo").textContent = "Selected: " + ctl.m + " min + " + ctl.i + " sec";
  $$("#quick button,#more button").forEach((b) =>
    b.classList.toggle("sel", +b.dataset.m === ctl.m && +b.dataset.i === ctl.i),
  );
}
$("#moreBtn").onclick = () => {
  const m = $("#more"),
    o = m.style.display === "none";
  m.style.display = o ? "grid" : "none";
  $("#customWrap").style.display = o ? "block" : "none";
  $("#moreBtn").textContent = "More options " + (o ? "▴" : "▾");
};
function readCustom() {
  const m = Math.max(0, Math.min(999, parseFloat($("#cMin").value) || 0)),
    i = Math.max(0, Math.min(999, parseInt($("#cInc").value) || 0));
  ctl = { m, i };
  mark();
}
$("#cMin").oninput = $("#cInc").oninput = readCustom;
mark();

/* ---- Game ---- */
let G = null,
  timer = null,
  wake = null;
const fmt = (ms) => {
  const over = ms < 0,
    a = Math.abs(ms);
  let s = over ? Math.floor(a / 1000) : Math.ceil(a / 1000);
  let str;
  if (!over && a < 10000) str = "0:0" + (a / 1000).toFixed(1);
  else {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    str =
      (h ? h + ":" + String(m).padStart(2, "0") : m) +
      ":" +
      String(sec).padStart(2, "0");
  }
  return over ? "+" + str : str;
};
const nm = (p, i) => p.name.trim() || "Player " + (i + 1);
$("#start").onclick = () => {
  if (ctl.m <= 0 && ctl.i <= 0) {
    $("#selInfo").textContent = "Set a time limit or an increment.";
    return;
  }
  G = {
    ps: players.map((p, i) => ({
      name: nm(p, i),
      ms: ctl.m * 60000,
      warned: false,
    })),
    cur: 0,
    run: true,
    inc: ctl.i,
    turns: 0,
    name: $("#gameName").value.trim() || "Untitled game",
    start: Date.now(),
    last: performance.now(),
  };
  show("play");
  render();
  clearInterval(timer);
  timer = setInterval(tick, 100);
  try {
    navigator.wakeLock &&
      navigator.wakeLock
        .request("screen")
        .then((w) => (wake = w))
        .catch(() => {});
  } catch (e) {}
};
function tick() {
  if (!G || !G.run) return;
  const now = performance.now(),
    p = G.ps[G.cur];
  p.ms -= now - G.last;
  G.last = now;
  if (p.ms < 0 && !p.warned) {
    p.warned = true;
    try {
      navigator.vibrate && navigator.vibrate([300, 150, 300]);
    } catch (e) {}
    [$("#zTop"), $("#zBot")].forEach((z) => {
      z.classList.remove("flash");
      void z.offsetWidth;
      z.classList.add("flash");
    });
  }
  render();
}
function render() {
  if (!G) return;
  const p = G.ps[G.cur];
  [$("#zTop"), $("#zBot")].forEach((z) => {
    z.querySelector(".n").textContent = p.name;
    z.querySelector(".t").textContent = fmt(p.ms);
    z.classList.toggle("over", p.ms < 0);
    z.classList.toggle("paused", !G.run);
  });
  $("#strip").innerHTML = G.ps
    .map(
      (q, i) =>
        `<div class="chip${i === G.cur ? " act" : ""}${q.ms < 0 ? " over" : ""}"><b></b><span>${fmt(q.ms)}</span></div>`,
    )
    .join("");
  $$("#strip .chip b").forEach((b, i) => (b.textContent = G.ps[i].name));
  $("#pauseBtn").textContent = G.run ? "⏸ Pause" : "▶ Resume";
}
function advance() {
  if (!G || !G.run) return;
  tick();
  const p = G.ps[G.cur];
  p.ms += G.inc * 1000;
  if (p.ms >= 0) p.warned = false;
  G.cur = (G.cur + 1) % G.ps.length;
  G.turns++;
  try {
    navigator.vibrate && navigator.vibrate(15);
  } catch (e) {}
  render();
}
$("#zTop").onclick = $("#zBot").onclick = advance;
function setRun(r) {
  if (!G) return;
  if (G.run) tick();
  G.run = r;
  G.last = performance.now();
  render();
}
$("#pauseBtn").onclick = () => setRun(!G.run);

/* ---- Settings ---- */
let wasRunning = false;
function renderAdjust() {
  const a = $("#adjust");
  a.innerHTML = "";
  G.ps.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "adj";
    d.innerHTML =
      '<span class="nm"></span><span class="tm"></span>' +
      [
        ["−1m", -60],
        ["−10s", -10],
        ["+10s", 10],
        ["+1m", 60],
      ]
        .map(([l, s]) => `<button data-s="${s}">${l}</button>`)
        .join("");
    d.querySelector(".nm").textContent = p.name;
    d.querySelector(".tm").textContent = fmt(p.ms);
    d.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          p.ms += +b.dataset.s * 1000;
          p.warned = p.ms < 0;
          render();
          renderAdjust();
        }),
    );
    a.appendChild(d);
  });
}
$("#setBtn").onclick = () => {
  wasRunning = G.run;
  setRun(false);
  renderAdjust();
  applyTheme();
  $("#modal").classList.add("on");
};
$("#closeSet").onclick = () => {
  $("#modal").classList.remove("on");
  if (wasRunning) setRun(true);
};
function ask(msg, label, fn) {
  $("#cMsg").textContent = msg;
  $("#cYes").textContent = label;
  $("#confirm").classList.add("on");
  $("#cNo").onclick = () => $("#confirm").classList.remove("on");
  $("#cYes").onclick = () => {
    $("#confirm").classList.remove("on");
    fn();
  };
}
const esc = (t) =>
  t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
$("#restart").onclick = () =>
  ask("Restart the game with fresh clocks?", "Restart", () => {
    G.ps.forEach((p) => {
      p.ms = ctl.m * 60000;
      p.warned = false;
    });
    G.cur = 0;
    G.turns = 0;
    G.start = Date.now();
    G.run = false;
    G.last = performance.now();
    wasRunning = true;
    renderAdjust();
    render();
  });
const HK = "mpc-history";
let past = [];
try {
  past = JSON.parse(localStorage.getItem(HK)) || [];
} catch (e) {}
function savePast() {
  try {
    localStorage.setItem(HK, JSON.stringify(past));
  } catch (e) {}
}
const dt = (t) =>
  new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
function renderHistory() {
  $("#histWrap").style.display = past.length ? "block" : "none";
  $("#history").innerHTML = past
    .map(
      (g, i) =>
        '<button data-i="' +
        i +
        '"><b>' +
        esc(g.name) +
        "</b><small>" +
        dt(g.start) +
        " · " +
        g.full +
        " full turns · " +
        g.players.length +
        " players</small></button>",
    )
    .join("");
  $$("#history button").forEach(
    (b) => (b.onclick = () => showSummary(past[+b.dataset.i])),
  );
}
function showSummary(g) {
  $("#sumBody").innerHTML =
    "<p><b>" +
    esc(g.name) +
    '</b><br><small style="color:var(--muted)">' +
    dt(g.start) +
    " → " +
    dt(g.end) +
    "</small></p>" +
    "<p>Full turns: <b>" +
    g.full +
    '</b> <span style="color:var(--muted)">(' +
    g.turns +
    " turns taken)</span></p><table><tr><th>Player</th><th>Ending time</th></tr>" +
    g.players
      .map(
        (p) =>
          "<tr><td>" +
          esc(p.name) +
          '</td><td class="' +
          (p.ms < 0 ? "ot" : "") +
          '">' +
          fmt(p.ms) +
          "</td></tr>",
      )
      .join("") +
    "</table>";
  $("#summary").classList.add("on");
}
$("#end").onclick = () =>
  ask("End the game and show the summary?", "End Game", () => {
    tick();
    G.run = false;
    clearInterval(timer);
    try {
      wake && wake.release();
    } catch (e) {}
    const g = {
      id: Date.now(),
      name: G.name,
      start: G.start,
      end: Date.now(),
      turns: G.turns,
      full: Math.floor(G.turns / G.ps.length),
      players: G.ps.map((p) => ({ name: p.name, ms: Math.round(p.ms) })),
    };
    past.unshift(g);
    past = past.slice(0, 100);
    savePast();
    renderHistory();
    $("#modal").classList.remove("on");
    showSummary(g);
  });
$("#sumDone").onclick = () => {
  $("#summary").classList.remove("on");
  if (G) {
    G = null;
    show("s1");
  }
};
renderHistory();
