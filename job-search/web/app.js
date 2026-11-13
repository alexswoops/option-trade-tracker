// Job Search Board. Reads data/jobs.json (written by the pipeline) and keeps
// per-job status + notes in this browser's localStorage. Use Export/Import to back up or move devices.
(() => {
  const STORE_KEY = "jobsearch.tracking.v1";
  const PREFS_KEY = "jobsearch.prefs.v1";
  const STATUSES = [
    ["new", "New"],
    ["interested", "Interested"],
    ["applied", "Applied"],
    ["interviewing", "Interviewing"],
    ["offer", "Offer"],
    ["rejected", "Rejected"],
    ["pass", "Not for me"],
  ];
  const OPEN = new Set(["new", "interested", "applied", "interviewing", "offer"]);

  const $ = (id) => document.getElementById(id);
  const safeGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

  let tracking = safeGet(STORE_KEY, {});
  let data = { jobs: [] };

  const controls = ["q", "statusFilter", "minScore", "sort", "showUnscored", "showClosed"];
  const prefs = safeGet(PREFS_KEY, {});
  for (const id of controls) {
    const el = $(id);
    if (prefs[id] !== undefined) el.type === "checkbox" ? (el.checked = prefs[id]) : (el.value = prefs[id]);
    el.addEventListener("input", () => { savePrefs(); render(); });
  }
  function savePrefs() {
    const p = {};
    for (const id of controls) { const el = $(id); p[id] = el.type === "checkbox" ? el.checked : el.value; }
    safeSet(PREFS_KEY, p);
  }

  const track = (id) => tracking[id] || { status: "new", notes: "" };
  function setTrack(id, patch) {
    tracking[id] = { ...track(id), ...patch, updatedAt: new Date().toISOString() };
    safeSet(STORE_KEY, tracking);
  }

  const k = (n) => `$${Math.round(n / 1000)}K`;
  function payText(j) {
    if (j.salaryMin && j.salaryMax) return `${k(j.salaryMin)} to ${k(j.salaryMax)}`;
    if (j.salaryMax) return `up to ${k(j.salaryMax)}`;
    if (j.salaryMin) return `from ${k(j.salaryMin)}`;
    return null;
  }
  const ago = (iso) => {
    if (!iso) return "";
    const h = (Date.now() - new Date(iso).getTime()) / 36e5;
    if (h < 1) return "just now";
    if (h < 24) return `${Math.round(h)}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  };

  function filtered() {
    const q = $("q").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    const min = Number($("minScore").value);
    const showUnscored = $("showUnscored").checked;
    const showClosed = $("showClosed").checked;
    const out = data.jobs.filter((j) => {
      if (!showClosed && !j.active) return false;
      const s = track(j.id).status;
      if (status === "open" ? !OPEN.has(s) : status !== "all" && s !== status) return false;
      if (j.fit) { if (j.fit.fit_score < min) return false; }
      else if (!showUnscored) return false;
      if (q && !`${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const sort = $("sort").value;
    const score = (j) => j.fit?.fit_score ?? -1;
    out.sort((a, b) =>
      sort === "newest" ? (b.firstSeen || "").localeCompare(a.firstSeen || "") || score(b) - score(a)
      : sort === "pay" ? (b.salaryMax || 0) - (a.salaryMax || 0) || score(b) - score(a)
      : score(b) - score(a) || (b.firstSeen || "").localeCompare(a.firstSeen || "")
    );
    return out;
  }

  function renderStats() {
    const active = data.jobs.filter((j) => j.active);
    const dayAgo = Date.now() - 864e5;
    const counts = (s) => data.jobs.filter((j) => track(j.id).status === s).length;
    const items = [
      [active.filter((j) => new Date(j.firstSeen).getTime() > dayAgo).length, "new in last 24h"],
      [active.filter((j) => (j.fit?.fit_score ?? 0) >= 85).length, "strong matches (85+)"],
      [active.filter((j) => track(j.id).status === "new").length, "waiting for review"],
      [counts("applied"), "applied"],
      [counts("interviewing"), "interviewing"],
      [active.length, "open roles tracked"],
    ];
    $("stats").innerHTML = items.map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  }

  function list(title, items, cls = "") {
    if (!items?.length) return "";
    const ul = document.createElement("ul");
    if (cls) ul.className = cls;
    for (const t of items) { const li = document.createElement("li"); li.textContent = t; ul.append(li); }
    return `<div><h3>${title}</h3>${ul.outerHTML}</div>`;
  }

  function copyButton(text) {
    const b = document.createElement("button");
    b.className = "ghost copy";
    b.textContent = "Copy";
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; }
      catch { b.textContent = "Copy failed"; }
      setTimeout(() => (b.textContent = "Copy"), 1500);
    };
    return b;
  }

  function card(j) {
    const node = $("cardTpl").content.firstElementChild.cloneNode(true);
    const t = track(j.id);
    if (!j.active) node.classList.add("closed");

    const score = node.querySelector(".score");
    if (j.fit) { score.textContent = j.fit.fit_score; score.classList.add(j.fit.verdict); score.title = j.fit.verdict; }
    else { score.textContent = "n/a"; score.classList.add("none"); score.title = "Not scored yet"; }

    const a = node.querySelector(".title");
    a.textContent = j.title;
    a.href = j.url;
    node.querySelector(".meta").textContent =
      [j.company, j.location, `via ${j.source}`, `found ${ago(j.firstSeen)}`, j.active ? null : "listing closed"].filter(Boolean).join(" · ");

    const sel = node.querySelector(".status");
    for (const [v, l] of STATUSES) sel.add(new Option(l, v, false, v === t.status));
    sel.onchange = () => { setTrack(j.id, { status: sel.value }); renderStats(); };

    node.querySelector(".summary").textContent = j.fit?.summary || "";
    const tags = node.querySelector(".tags");
    const addTag = (text, cls = "") => { const s = document.createElement("span"); s.className = `tag ${cls}`; s.textContent = text; tags.append(s); };
    const pay = payText(j);
    addTag(pay ? pay : "pay not posted", pay ? "pay" : "");
    if (j.remote) addTag("remote");
    if (Date.now() - new Date(j.firstSeen).getTime() < 864e5) addTag("new", "new");
    if (j.fit?.salary_note) addTag(j.fit.salary_note);

    if (j.fit) {
      node.querySelector(".fit").innerHTML =
        list("Why it fits", j.fit.why_fit) + list("Gaps", j.fit.gaps) + list("Red flags", j.fit.red_flags, "flags");

      const pb = node.querySelector(".pitch-body");
      const p = document.createElement("p"); p.textContent = j.fit.pitch; pb.append(p, copyButton(j.fit.pitch));
      pb.insertAdjacentHTML("beforeend", list("Move these to the top of the resume", j.fit.resume_emphasis));
    } else {
      node.querySelector(".pitch-box").remove();
    }

    if (j.coverLetter) {
      const lb = node.querySelector(".letter-body");
      const p = document.createElement("div"); p.textContent = j.coverLetter; lb.append(p, copyButton(j.coverLetter));
    } else {
      node.querySelector(".letter-box").remove();
    }

    node.querySelector(".desc").textContent = j.description || "(no description captured; open the posting)";

    const notes = node.querySelector(".notes");
    notes.value = t.notes || "";
    let timer;
    notes.oninput = () => { clearTimeout(timer); timer = setTimeout(() => setTrack(j.id, { notes: notes.value }), 400); };
    return node;
  }

  function render() {
    renderStats();
    const items = filtered();
    $("count").textContent = `Showing ${items.length} of ${data.jobs.length} jobs`;
    const listEl = $("list");
    listEl.replaceChildren(...items.map(card));
    if (!items.length) listEl.innerHTML = `<p class="empty">Nothing matches these filters. Try lowering the score filter or including unscored jobs.</p>`;
  }

  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), tracking }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `job-tracking-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("importInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text()).tracking || {};
      tracking = { ...tracking, ...incoming };
      safeSet(STORE_KEY, tracking);
      render();
    } catch { alert("That file doesn't look like a tracking export."); }
    e.target.value = "";
  };

  fetch(`data/jobs.json?t=${Date.now()}`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      data = d;
      const s = d.stats || {};
      $("updated").textContent =
        `Updated ${new Date(d.generatedAt).toLocaleString()} · ${s.sourcesChecked ?? "?"} sources checked · ${s.newThisRun ?? 0} new this run · min pay $${(d.criteria?.minSalary ?? 0).toLocaleString()}`;
      render();
    })
    .catch(() => { $("updated").textContent = "No data yet. The first scheduled run will create it."; render(); });
})();
