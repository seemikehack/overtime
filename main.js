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

/* ========================================================================
 * Module-level state
 * ====================================================================== */

// Storage keys
const HK = "mpc-history";

// Static data
const placeholders = ["Agricola", "Harmonies", "Wingspan", "Dominion", "General Orders"];
const quick = [
  [3, 2],
  [5, 5],
  [10, 0],
];
const more = [
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

// Intro animation elements
const overlay = $("#title-overlay");
const app = $("#s1");

// Theme (resolved during initialization)
let theme = null;

// Player setup
let uid = 0;
let players = [
  { id: ++uid, name: "" },
  { id: ++uid, name: "" },
];
let sortable = null;

// Time control selection
let ctl = { m: 5, i: 5 };

// Active game
let G = null;
let timer = null;
let wake = null;
let wasRunning = false;

// Past games (loaded during initialization)
let past = [];

/* ========================================================================
 * Functions
 * ====================================================================== */

// Query selector shortcut (single element).
function $(s) {
  return document.querySelector(s);
}

// Query selector shortcut (array of elements).
function $$(s) {
  return [...document.querySelectorAll(s)];
}

// Clone a hidden template by name.
function tpl(n) {
  const c = $('#templates [data-tpl="' + n + '"]').cloneNode(true);
  c.removeAttribute("data-tpl");
  return c;
}

/* ---- Theme ---- */

// Determine the initial theme from storage, attribute, or system preference.
function resolveInitialTheme() {
  let t = null;
  try {
    t = localStorage.getItem("mpc-theme");
  } catch (e) {}
  if (t === "light" || t === "dark") return t;
  const a = document.documentElement.getAttribute("data-theme");
  if (a === "dark" || a === "light") return a;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Apply the current theme to the document and theme selectors.
function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
  $$(".themesel button").forEach((b) =>
    b.classList.toggle("sel", b.dataset.th === theme),
  );
}

// Set, persist, and apply a theme.
function setTheme(t) {
  theme = t;
  try {
    localStorage.setItem("mpc-theme", t);
  } catch (e) {}
  applyTheme();
}

/* ---- Navigation ---- */

// Pick a random game-name placeholder.
function generatePlaceholder() {
  $("#gameName").setAttribute(
    "placeholder",
    "e.g. " + placeholders[Math.floor(Math.random() * placeholders.length)],
  );
}

// Show one screen and hide the others.
function show(id) {
  $$(".screen,#play").forEach((e) => e.classList.remove("on"));
  $("#" + id).classList.add("on");
  id === "s1" && generatePlaceholder();
}

/* ---- Players list ---- */

// Render the player rows and (re)attach drag-to-reorder.
function renderList() {
  const l = $("#list");
  if (sortable) {
    sortable.destroy();
    sortable = null;
  }
  l.innerHTML = "";
  players.forEach((p, i) => {
    const r = tpl("player");
    r.dataset.id = p.id;
    const inp = r.querySelector("input");
    inp.placeholder = "Player " + (i + 1);
    inp.value = p.name;
    inp.oninput = () => (p.name = inp.value);
    const x = r.querySelector(".x");
    if (players.length <= 2) x.remove();
    else
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

/* ---- Time controls ---- */

// Build time-control buttons for a list of [minutes, increment] pairs.
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

// Update the selection summary and highlight the matching button.
function mark() {
  $("#selInfo").textContent = "Selected: " + ctl.m + " min + " + ctl.i + " sec";
  $$("#quick button,#more button").forEach((b) =>
    b.classList.toggle("sel", +b.dataset.m === ctl.m && +b.dataset.i === ctl.i),
  );
}

// Read and clamp the custom time-control inputs.
function readCustom() {
  const m = Math.max(0, Math.min(999, parseFloat($("#cMin").value) || 0)),
    i = Math.max(0, Math.min(999, parseInt($("#cInc").value) || 0));
  ctl = { m, i };
  mark();
}

/* ---- Game ---- */

// Format milliseconds as a clock string ("+" prefix when overtime).
function fmt(ms) {
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
}

// Resolve a player's display name, falling back to "Player N".
function nm(p, i) {
  return p.name.trim() || "Player " + (i + 1);
}

// Deduct elapsed time from the current player and alert on overtime.
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

// Redraw the play screen from the current game state.
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
  $("#pauseBtn").classList.toggle("flip", !G.run);
}

// End the current turn: add increment and pass to the next player.
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

// Run or pause the clock.
function setRun(r) {
  if (!G) return;
  if (G.run) tick();
  G.run = r;
  G.last = performance.now();
  render();
}

/* ---- Settings ---- */

// Render the per-player time adjustment rows.
function renderAdjust() {
  const a = $("#adjust");
  a.innerHTML = "";
  G.ps.forEach((p) => {
    const d = tpl("adjust");
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

// Show the confirmation dialog and run fn on confirm.
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

/* ---- History ---- */

// Load past games from storage.
function loadPast() {
  try {
    return JSON.parse(localStorage.getItem(HK)) || [];
  } catch (e) {
    return [];
  }
}

// Persist past games to storage.
function savePast() {
  try {
    localStorage.setItem(HK, JSON.stringify(past));
  } catch (e) {}
}

// Format a timestamp for display.
function dt(t) {
  return new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// Fill a history entry's name and details.
function fillLabel(el, g) {
  el.querySelector(".gn").textContent = g.name;
  el.querySelector("small").textContent =
    dt(g.start) +
    " · " +
    g.full +
    " full turns · " +
    g.players.length +
    " players";
}

// Render the most recent game on the setup screen.
function renderHistory() {
  $("#histWrap").style.display = past.length ? "block" : "none";
  $("#history").replaceChildren(
    ...past.slice(0, 1).map((g) => {
      const b = tpl("history");
      fillLabel(b, g);
      b.onclick = () => showSummary(g);
      return b;
    }),
  );
  $("#allBtn").textContent =
    past.length > 1
      ? "View all past games (" + past.length + ")"
      : "View all past games";
}

// Render the full list of past games.
function renderAll() {
  const l = $("#allList");
  $("#clearAll").disabled = !past.length;
  if (!past.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No past games.";
    l.replaceChildren(p);
    return;
  }
  l.replaceChildren(
    ...past.map((g) => {
      const it = tpl("past"),
        open = it.querySelector(".open");
      fillLabel(open, g);
      open.onclick = () => showSummary(g);
      it.querySelector(".del").onclick = () =>
        ask('Delete "' + g.name + "\"? This can't be undone.", "Delete", () => {
          past = past.filter((q) => q.id !== g.id);
          savePast();
          renderHistory();
          renderAll();
        });
      return it;
    }),
  );
}

// Show the summary modal for a game.
function showSummary(g) {
  const s = tpl("summary");
  s.querySelector(".gn").textContent = g.name;
  s.querySelector(".from").textContent = dt(g.start);
  s.querySelector(".to").textContent = dt(g.end);
  s.querySelector(".full").textContent = g.full;
  s.querySelector(".turns").textContent = g.turns;
  s.querySelector(".rows").replaceChildren(
    ...g.players.map((p) => {
      const r = tpl("summary-row");
      r.children[0].textContent = p.name;
      r.children[1].textContent = fmt(p.ms);
      r.children[1].classList.toggle("ot", p.ms < 0);
      return r;
    }),
  );
  $("#sumBody").replaceChildren(s);
  $("#summary").classList.add("on");
}

/* ---- Intro animation ---- */

// Remove the intro overlay and re-enable the app.
function finishIntro() {
  overlay.remove();
  app.inert = false;
}

// Play the title intro, skipping it for reduced-motion users.
function startIntro() {
  // Optional accessibility policy: skip this decorative intro
  // when the user requests reduced motion.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishIntro();
    return;
  }

  // Block interaction with the controls underneath the overlay.
  app.inert = true;

  // Clean up when the overlay's final fade ends.
  overlay.addEventListener("animationend", (event) => {
    // Several animations finish, including the child's animation.
    // Only the overlay's final fade should trigger cleanup.
    if (event.target === overlay && event.animationName === "title-fade") {
      finishIntro();
    }
  });

  overlay.classList.add("is-playing");
}

/* ========================================================================
 * Event listener registrations
 * ====================================================================== */

// Theme toggle buttons.
$$(".themesel button").forEach((b) => (b.onclick = () => setTheme(b.dataset.th)));

// Add a player and focus its input.
$("#add").onclick = () => {
  if (players.length >= 8) return;
  players.push({ id: ++uid, name: "" });
  renderList();
  const inputs = $$("#list .row input");
  const last = inputs[inputs.length - 1];
  last.focus();
  last.scrollIntoView({ block: "nearest" });
};

// Setup -> time controls.
$("#next1").onclick = () => show("s2");

// Time controls -> setup.
$("#back2").onclick = () => show("s1");

// Toggle the extra time-control options and custom fields.
$("#moreBtn").onclick = () => {
  const m = $("#more"),
    o = m.style.display === "none";
  m.style.display = o ? "grid" : "none";
  $("#customWrap").style.display = o ? "block" : "none";
  $("#moreBtn").classList.toggle("flip", o);
};

// Custom time-control inputs.
$("#cMin").oninput = $("#cInc").oninput = readCustom;

// Start a new game.
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

// Tapping either zone ends the current turn.
$("#zTop").onclick = $("#zBot").onclick = advance;

// Pause or resume the clock.
$("#pauseBtn").onclick = () => setRun(!G.run);

// Open settings and pause the clock.
$("#setBtn").onclick = () => {
  wasRunning = G.run;
  setRun(false);
  renderAdjust();
  applyTheme();
  $("#modal").classList.add("on");
};

// Close settings and resume if it was running.
$("#closeSet").onclick = () => {
  $("#modal").classList.remove("on");
  if (wasRunning) setRun(true);
};

// Restart the game with fresh clocks.
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

// View all past games.
$("#allBtn").onclick = () => {
  renderAll();
  show("s3");
};

// Past games -> setup.
$("#back3").onclick = () => show("s1");

// Delete all past games.
$("#clearAll").onclick = () =>
  ask(
    "Delete all " + past.length + " past games? This can't be undone.",
    "Clear all",
    () => {
      past = [];
      savePast();
      renderHistory();
      renderAll();
    },
  );

// End the game, save it to history, and show the summary.
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

// Dismiss the summary and return to setup if a game just ended.
$("#sumDone").onclick = () => {
  $("#summary").classList.remove("on");
  if (G) {
    G = null;
    show("s1");
  }
};

/* ========================================================================
 * Initialization
 * ====================================================================== */

if (window.lucide) lucide.createIcons();
theme = resolveInitialTheme();
past = loadPast();
applyTheme();
generatePlaceholder();
renderList();
fill($("#quick"), quick);
fill($("#more"), more);
mark();
startIntro();

// this is the final rendering step before the app is usable
renderHistory();
