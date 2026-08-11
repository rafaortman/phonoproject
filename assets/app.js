/* ==========================================================================
   Dashboard de Projeto Fonográfico — v2
   Site estático (GitHub Pages). Estado inicial: data/projects.json.
   Edições em localStorage. Export/Import move dados de volta ao repo.

   Modelo:
   - Projeto: people[], stages[] (configurável), tracks[].
   - Etapa (stage): { id, label, mode: "holistic" | "instruments" }.
       Os rótulos são só sugestões — nenhum comportamento é amarrado ao nome.
   - Faixa (track): ficha + instruments[] (arranjo) + stageState por etapa.
       holística       → { status: todo|wip|done, note }
       por instrumento → { signedOff, note, items: { instId: {check, note} } }
   - Uma etapa "por instrumento" IMPORTA (sync ao vivo) os instrumentos que
     concluíram a etapa por-instrumento anterior. A primeira delas parte do
     arranjo completo. Sync "seguro": nunca apaga em silêncio — o que
     desconclui lá atrás fica sinalizado (⚠), preservando check/nota.
   ========================================================================== */

const LS_KEY = "fono-dashboard-v2";

const DEFAULT_STAGES = [
  { id: "composicao", label: "Composição", mode: "holistic" },
  { id: "gravacao",   label: "Gravação",   mode: "instruments" },
  { id: "edicao",     label: "Edição",     mode: "instruments" },
  { id: "premix",     label: "Pré-mix",    mode: "instruments" },
  { id: "mix",        label: "Mix",        mode: "instruments" },
  { id: "master",     label: "Master",     mode: "holistic" },
];

const TRACK_TYPES = [
  { key: "inedita",    label: "Inédita" },
  { key: "regravacao", label: "Regravação" },
  { key: "versao",     label: "Versão / Cover" },
];

const STATE_CYCLE = { todo: "wip", wip: "done", done: "todo" };
const STATE_ICON  = { todo: "", wip: "◐", done: "✓" };
const STATE_LABEL = { todo: "não iniciada", wip: "em andamento", done: "concluída" };

let db = { version: 2, projects: [] };
let route = { view: "home", projectId: null, trackId: null };

/* ---------- Persistence ---------- */
async function loadData() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) { try { db = JSON.parse(saved); return; } catch (e) {} }
  try {
    const res = await fetch("data/projects.json", { cache: "no-store" });
    db = await res.json();
  } catch (e) { db = { version: 2, projects: [] }; }
  save();
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(db)); }

/* ---------- Images (client-side downscale → data URI) ---------- */
function downscaleImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
function pickImage(maxDim, quality, cb) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; if (!f) return;
    try { cb(await downscaleImage(f, maxDim, quality)); }
    catch (e) { toast("Não consegui carregar a imagem"); }
  });
  inp.click();
}

/* ---------- Helpers ---------- */
function uid(base) {
  const slug = (base || "item").toString().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
  return slug + "-" + Math.random().toString(36).slice(2, 6);
}
function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function getProject(id) { return db.projects.find(p => p.id === id); }
function getTrack(p, id) { return p ? p.tracks.find(t => t.id === id) : null; }

function classify(n) {
  if (n <= 0) return { key: "draft", label: "Rascunho" };
  if (n <= 3)  return { key: "single", label: "Single" };
  if (n <= 6)  return { key: "ep", label: "EP" };
  return { key: "album", label: "Álbum" };
}
function personName(p, id) { const x = (p.people || []).find(y => y.id === id); return x ? x.name : ""; }
function ensurePerson(p, name) {
  name = (name || "").trim(); if (!name) return null;
  p.people = p.people || [];
  let x = p.people.find(y => y.name.toLowerCase() === name.toLowerCase());
  if (!x) { x = { id: uid(name), name }; p.people.push(x); }
  return x.id;
}
function pushSkill(person, name) {
  name = (name || "").trim(); if (!name || !person) return;
  person.skills = person.skills || [];
  if (!person.skills.some(s => s.toLowerCase() === name.toLowerCase())) person.skills.push(name);
}
function personRefs(p, id) {
  let n = 0;
  (p.tracks || []).forEach(t => {
    if ((t.composers || []).includes(id)) n++;
    (t.instruments || []).forEach(i => { if (i.personId === id) n++; });
  });
  return n;
}
function removePerson(p, id) {
  const refs = personRefs(p, id);
  const who = personName(p, id);
  if (refs > 0 && !confirm(`"${who}" aparece em ${refs} lugar(es) (compositor/músico). Remover do elenco e limpar essas referências?`)) return false;
  p.tracks.forEach(t => {
    t.composers = (t.composers || []).filter(c => c !== id);
    (t.instruments || []).forEach(i => { if (i.personId === id) i.personId = null; });
  });
  p.people = (p.people || []).filter(x => x.id !== id);
  return true;
}

/* ---------- Stage-state model ---------- */
function ensureState(track, stage) {
  track.stageState = track.stageState || {};
  if (!track.stageState[stage.id]) {
    track.stageState[stage.id] = stage.mode === "instruments"
      ? { signedOff: false, note: "", items: {} }
      : { status: "todo", note: "" };
  }
  const st = track.stageState[stage.id];
  if (stage.mode === "instruments" && !st.items) st.items = {};
  return st;
}
function instrStages(p) { return p.stages.filter(s => s.mode === "instruments"); }

// instruments that "arrive" at a stage (base set), before local flags
function baseInstrumentIds(p, track, stageId) {
  const order = instrStages(p).map(s => s.id);
  const idx = order.indexOf(stageId);
  if (idx <= 0) return track.instruments.filter(i => i.used).map(i => i.id);
  const prev = track.stageState[order[idx - 1]] || { items: {} };
  const items = prev.items || {};
  return track.instruments.filter(i => i.used && items[i.id] && items[i.id].check).map(i => i.id);
}
// visible rows for an instruments-stage: base ∪ (locally-worked items no longer upstream → flagged)
function stageItems(p, track, stageId) {
  const st = track.stageState[stageId] || { items: {} };
  const items = st.items || {};
  const baseSet = new Set(baseInstrumentIds(p, track, stageId));
  const rows = [];
  for (const inst of track.instruments) {
    if (baseSet.has(inst.id)) {
      const it = items[inst.id] || {};
      rows.push({ inst, checked: !!it.check, note: it.note || "", flagged: false });
    }
  }
  for (const inst of track.instruments) {
    if (!baseSet.has(inst.id)) {
      const it = items[inst.id];
      if (it && (it.check || it.note)) rows.push({ inst, checked: !!it.check, note: it.note || "", flagged: true });
    }
  }
  return rows;
}

function stageProgress(p, track, stage) {
  const st = ensureState(track, stage);
  if (stage.mode === "holistic") return st.status === "done" ? 1 : st.status === "wip" ? 0.5 : 0;
  if (st.signedOff) return 1;
  const rows = stageItems(p, track, stage.id);
  if (!rows.length) return 0;
  return (rows.filter(r => r.checked).length / rows.length) * 0.95;
}
function stageStatus(p, track, stage) {
  const st = ensureState(track, stage);
  if (stage.mode === "holistic") return st.status || "todo";
  if (st.signedOff) return "done";
  const rows = stageItems(p, track, stage.id);
  return rows.some(r => r.checked) ? "wip" : "todo";
}
function trackProgress(p, track) {
  if (!p.stages.length) return 0;
  return p.stages.reduce((s, st) => s + stageProgress(p, track, st), 0) / p.stages.length;
}
function projectBar(p) {
  let total = 0, done = 0, partial = 0;
  for (const t of p.tracks) for (const s of p.stages) {
    total++;
    const pr = stageProgress(p, t, s);
    if (pr >= 1) done++; else partial += pr;
  }
  if (!total) return { pct: 0, donePct: 0, wipPct: 0 };
  return { pct: Math.round((done + partial) / total * 100), donePct: done / total * 100, wipPct: partial / total * 100 };
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");

function render() {
  const p = route.projectId ? getProject(route.projectId) : null;
  if (route.view === "track" && p) { const t = getTrack(p, route.trackId); if (t) return renderTrack(p, t); }
  if (route.view === "project" && p) return renderProject(p);
  route = { view: "home" }; renderHome();
}
function goHome() { route = { view: "home" }; render(); }
function goProject(id) { route = { view: "project", projectId: id }; render(); }
function goTrack(pid, tid) { route = { view: "track", projectId: pid, trackId: tid }; render(); }

function progressBar(bar) {
  return `<div class="progress">
      <div class="seg-done" style="width:${bar.donePct}%"></div>
      <div class="seg-wip" style="width:${bar.wipPct}%"></div>
    </div>`;
}

/* ----- Home ----- */
function renderHome() {
  const cards = db.projects.map(p => {
    const bar = projectBar(p), cls = classify(p.tracks.length);
    return `<div class="card" data-open="${p.id}">
        ${p.cover ? `<div class="card-cover"><img src="${p.cover}" alt=""></div>` : ""}
        <div class="card-body">
          <div class="card-top">
            <div><h3>${esc(p.title)}</h3><div class="artist">${esc(p.artist) || "&nbsp;"}</div></div>
            <span class="badge ${cls.key}">${cls.label}</span>
          </div>
          <div class="meta-row">
            <span><b>${p.tracks.length}</b> faixa${p.tracks.length === 1 ? "" : "s"}</span>
            <span><b>${(p.people || []).length}</b> no elenco</span>
          </div>
          <div class="progress-label"><span>Progresso</span><b>${bar.pct}%</b></div>
          ${progressBar(bar)}
        </div>
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="section-head"><h2>Meus projetos</h2>
      <span class="count">${db.projects.length} projeto${db.projects.length === 1 ? "" : "s"}</span></div>
    ${db.projects.length ? `<div class="grid">${cards}</div>` : `
      <div class="empty"><h3>Nenhum projeto ainda</h3>
        <p>Crie seu primeiro projeto fonográfico para começar.</p>
        <button class="btn primary" data-action="new">+ Novo projeto</button></div>`}`;

  app.querySelectorAll("[data-open]").forEach(el => el.addEventListener("click", () => goProject(el.dataset.open)));
  const nb = app.querySelector('[data-action="new"]'); if (nb) nb.addEventListener("click", openNewProjectModal);
}

/* ----- Project (tracks overview) ----- */
function renderProject(p) {
  const bar = projectBar(p), cls = classify(p.tracks.length);
  const rows = p.tracks.map((t, i) => {
    const tb = projectBar({ tracks: [t], stages: p.stages });
    const pend = nextAction(p, t);
    return `<div class="track-row" data-track="${t.id}">
        <span class="num">${i + 1}</span>
        <div class="track-row-main">
          <div class="track-row-title">${esc(t.title) || "<span class='faint'>Sem título</span>"}</div>
          <div class="track-row-sub">${esc(pend || "—")}</div>
        </div>
        <div class="track-row-prog">
          <div class="progress-label"><span></span><b>${tb.pct}%</b></div>
          ${progressBar(tb)}
        </div>
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="crumb" data-home>← Projetos</div>
    <div class="detail-head">
      <div class="proj-title-wrap">
        <div class="proj-cover ${p.cover ? "" : "empty"}" data-cover title="${p.cover ? "Trocar capa" : "Adicionar capa"}">
          ${p.cover ? `<img src="${p.cover}" alt="capa"><button class="cover-x" data-cover-rm title="Remover capa">×</button>` : `<span>+ capa</span>`}
        </div>
        <div>
          <h2>${esc(p.title)}</h2>
          <div class="detail-sub">
            <span class="badge ${cls.key}">${cls.label}</span>
            ${esc(p.artist) ? `<span>${esc(p.artist)}</span>` : ""}
            <span>${p.tracks.length} faixa${p.tracks.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>
      <div class="head-actions">
        <button class="btn ghost" data-stages>⚙ Etapas</button>
        <button class="btn danger" data-del-project>Excluir projeto</button>
      </div>
    </div>
    <div class="overall-box">
      <div class="progress-label"><span>Progresso geral</span><b>${bar.pct}%</b></div>
      ${progressBar(bar)}
    </div>

    <div class="elenco">
      <div class="elenco-head">Elenco <span class="count">${(p.people || []).length}</span></div>
      <div class="people-list">
        ${(p.people || []).map(x => `
          <div class="person-row">
            <div class="person-name">${esc(x.name)}</div>
            <div class="skills">
              ${(x.skills || []).map((sk, i) => `<span class="skill-tag">${esc(sk)}<button data-rm-skill="${x.id}" data-skill-i="${i}" title="Remover skill">×</button></span>`).join("")}
              <input class="skill-input" data-add-skill="${x.id}" list="skills-list" placeholder="+ skill">
            </div>
            <button class="row-x" data-rm-person="${x.id}" title="Remover do elenco">×</button>
          </div>`).join("")}
      </div>
      <div class="add-person-row"><input class="chip-input" data-add-person placeholder="+ participante (Enter)"></div>
    </div>
    ${skillsDatalist(p)}

    ${p.tracks.length ? `<div class="track-list">${rows}</div>` :
      `<div class="empty"><h3>Sem faixas</h3><p>Adicione a primeira faixa deste projeto.</p></div>`}
    <div class="add-track-bar"><button class="btn primary" data-add-track>+ Adicionar faixa</button></div>`;

  app.querySelector("[data-home]").addEventListener("click", goHome);
  app.querySelectorAll("[data-track]").forEach(el => el.addEventListener("click", () => goTrack(p.id, el.dataset.track)));
  app.querySelector("[data-add-track]").addEventListener("click", () => openTrackModal(p));
  app.querySelector("[data-stages]").addEventListener("click", () => openStagesModal(p));

  const addPerson = app.querySelector("[data-add-person]");
  if (addPerson) addPerson.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); if (addPerson.value.trim()) { ensurePerson(p, addPerson.value); save(); render(); } }
  });
  app.querySelectorAll("[data-rm-person]").forEach(b => b.addEventListener("click", () => {
    if (removePerson(p, b.dataset.rmPerson)) { save(); render(); toast("Removido do elenco"); }
  }));
  app.querySelectorAll("[data-add-skill]").forEach(inp => inp.addEventListener("keydown", e => {
    if (e.key !== "Enter") return; e.preventDefault();
    const sk = inp.value.trim(); if (!sk) return;
    const person = (p.people || []).find(x => x.id === inp.dataset.addSkill); if (!person) return;
    person.skills = person.skills || [];
    if (!person.skills.some(s => s.toLowerCase() === sk.toLowerCase())) person.skills.push(sk);
    save(); render();
  }));
  app.querySelectorAll("[data-rm-skill]").forEach(b => b.addEventListener("click", () => {
    const person = (p.people || []).find(x => x.id === b.dataset.rmSkill); if (!person) return;
    person.skills.splice(+b.dataset.skillI, 1); save(); render();
  }));
  const coverEl = app.querySelector("[data-cover]");
  if (coverEl) coverEl.addEventListener("click", e => {
    if (e.target.closest("[data-cover-rm]")) return;
    pickImage(512, 0.72, dataURI => { p.cover = dataURI; save(); render(); toast("Capa atualizada"); });
  });
  const coverRm = app.querySelector("[data-cover-rm]");
  if (coverRm) coverRm.addEventListener("click", e => {
    e.stopPropagation(); p.cover = null; save(); render(); toast("Capa removida");
  });
  app.querySelector("[data-del-project]").addEventListener("click", () => {
    if (confirm(`Excluir o projeto "${p.title}" e todas as suas faixas? Não pode ser desfeito.`)) {
      db.projects = db.projects.filter(x => x.id !== p.id); save(); goHome(); toast("Projeto excluído");
    }
  });
}

// Short "what's next" hint for a track
function nextAction(p, t) {
  for (const s of p.stages) {
    const status = stageStatus(p, t, s);
    if (status !== "done") {
      if (s.mode === "instruments") {
        const rows = stageItems(p, t, s.id);
        const pend = rows.filter(r => !r.checked).length;
        if (!rows.length) return `${s.label}: aguardando etapa anterior`;
        if (pend) return `${s.label}: ${pend} instrumento${pend === 1 ? "" : "s"} pendente${pend === 1 ? "" : "s"}`;
        return `${s.label}: pronto para concluir`;
      }
      return `${s.label}: ${STATE_LABEL[status]}`;
    }
  }
  return "Tudo concluído 🎉";
}

/* ----- Track detail ----- */
function renderTrack(p, t) {
  const bar = projectBar({ tracks: [t], stages: p.stages });
  const typeLabel = (TRACK_TYPES.find(x => x.key === t.type) || TRACK_TYPES[0]).label;

  app.innerHTML = `
    <div class="crumb"><span data-home>Projetos</span> <span class="sep">/</span> <span data-proj>${esc(p.title)}</span></div>
    <div class="detail-head">
      <div style="flex:1">
        <input class="track-title-input" value="${esc(t.title)}" data-title placeholder="Título da faixa">
        <div class="detail-sub">
          <span class="badge">${esc(typeLabel)}</span>
          <span>${bar.pct}% concluído</span>
        </div>
      </div>
      <button class="btn danger" data-del-track>Excluir faixa</button>
    </div>
    <div class="overall-box"><div class="progress-label"><span>Progresso da faixa</span><b>${bar.pct}%</b></div>${progressBar(bar)}</div>

    ${renderFicha(p, t)}

    <h3 class="stages-title">Etapas de produção</h3>
    <div class="stages">${p.stages.map(s => renderStage(p, t, s)).join("")}</div>

    ${peopleDatalist(p)}${skillsDatalist(p)}`;

  wireTrack(p, t);
}

function peopleDatalist(p) {
  return `<datalist id="people-list">${(p.people || []).map(x => `<option value="${esc(x.name)}">`).join("")}</datalist>`;
}
function allSkills(p) {
  const set = new Set();
  (p.people || []).forEach(x => (x.skills || []).forEach(s => set.add(s)));
  return [...set];
}
function skillsDatalist(p) {
  return `<datalist id="skills-list">${allSkills(p).map(s => `<option value="${esc(s)}">`).join("")}</datalist>`;
}

function renderFicha(p, t) {
  const chips = (t.composers || []).map(id =>
    `<span class="chip">${esc(personName(p, id))}<button data-rm-comp="${id}" title="Remover">×</button></span>`).join("");
  const typeOpts = TRACK_TYPES.map(x => `<option value="${x.key}" ${t.type === x.key ? "selected" : ""}>${x.label}</option>`).join("");
  return `<div class="ficha">
    <div class="ficha-grid">
      <div class="field"><label>Tipo</label><select data-f="type">${typeOpts}</select></div>
      <div class="field"><label>Estilo / gênero</label><input data-f="style" value="${esc(t.style)}" placeholder="Ex.: MPB, indie…"></div>
      <div class="field"><label>BPM</label><input data-f="bpm" value="${esc(t.bpm)}" placeholder="—" inputmode="numeric"></div>
      <div class="field"><label>Tom</label><input data-f="key" value="${esc(t.key)}" placeholder="Ex.: Am"></div>
      <div class="field"><label>Duração</label><input data-f="duration" value="${esc(t.duration)}" placeholder="Ex.: 3:42"></div>
    </div>
    <div class="field">
      <label>Compositores</label>
      <div class="chips">${chips}<input class="chip-input" data-add-comp list="people-list" placeholder="+ adicionar (Enter)"></div>
    </div>
    <div class="field"><label>Referências</label>
      <textarea data-f="references" placeholder="Faixas de referência, links, o que buscar…">${esc(t.references)}</textarea></div>
    <div class="field"><label>Observações gerais</label>
      <textarea data-f="notes" placeholder="Pendências e decisões da faixa…">${esc(t.notes)}</textarea></div>
  </div>`;
}

function renderStage(p, t, stage) {
  const st = ensureState(t, stage);
  const status = stageStatus(p, t, stage);
  const dot = `<span class="stage-dot ${status}" title="${STATE_LABEL[status]}">${STATE_ICON[status]}</span>`;

  if (stage.mode === "holistic") {
    return `<section class="stage-card" data-stage="${stage.id}">
      <div class="stage-head">
        <div class="stage-name"><button class="stage-dot ${status} clickable" data-cycle title="Alternar estado">${STATE_ICON[status]}</button>
          <h4>${esc(stage.label)}</h4></div>
        <span class="stage-status">${STATE_LABEL[status]}</span>
      </div>
      <textarea class="stage-note" data-stage-note placeholder="Nota desta etapa…">${esc(st.note || "")}</textarea>
    </section>`;
  }

  // instruments mode
  const rows = stageItems(p, t, stage.id);
  const order = instrStages(p).map(s => s.id);
  const isFirst = order.indexOf(stage.id) === 0;
  const checkedN = rows.filter(r => r.checked).length;
  const allDone = rows.length > 0 && checkedN === rows.length;

  const body = rows.map(r => {
    const musico = r.inst.personId ? personName(p, r.inst.personId) : "";
    return `<div class="instr-row ${r.flagged ? "flagged" : ""}">
      <button class="mini-check ${r.checked ? "on" : ""}" data-check="${r.inst.id}" title="${r.checked ? "concluído" : "marcar"}">${r.checked ? "✓" : ""}</button>
      ${isFirst
        ? `<input class="instr-name" data-iname="${r.inst.id}" list="skills-list" value="${esc(r.inst.name)}" placeholder="Instrumento">
           <input class="instr-musico" data-imusico="${r.inst.id}" list="people-list" value="${esc(musico)}" placeholder="Músico">`
        : `<div class="instr-name ro">${esc(r.inst.name) || "<span class='faint'>—</span>"}</div>
           <div class="instr-musico ro">${esc(musico)}</div>`}
      <input class="instr-note" data-inote="${r.inst.id}" value="${esc(r.note)}" placeholder="nota (ex.: cortar 200Hz)">
      ${r.flagged ? `<span class="flag" title="Não está mais concluído na etapa anterior">⚠</span>` : ""}
      ${isFirst ? `<button class="row-x" data-idel="${r.inst.id}" title="Remover instrumento">×</button>` : "<span></span>"}
    </div>`;
  }).join("");

  const meter = rows.length
    ? `${checkedN} de ${rows.length} instrumento${rows.length === 1 ? "" : "s"} concluído${checkedN === 1 ? "" : "s"} nesta etapa`
    : (isFirst ? "Nenhum instrumento no arranjo ainda." : "Aguardando a etapa anterior concluir instrumentos.");

  return `<section class="stage-card" data-stage="${stage.id}">
    <div class="stage-head">
      <div class="stage-name">${dot}<h4>${esc(stage.label)}</h4>
        <span class="mode-tag">por instrumento${isFirst ? " · arranjo" : ""}</span></div>
      <span class="stage-status">${STATE_LABEL[status]}</span>
    </div>
    <div class="instr-list">${body || `<div class="instr-empty">${esc(meter)}</div>`}</div>
    ${isFirst ? `<button class="btn ghost small add-instr" data-add-instr>+ instrumento</button>` : ""}
    <div class="stage-foot">
      <span class="meter">${rows.length ? esc(meter) : ""}</span>
      <button class="btn ${st.signedOff ? "" : (allDone ? "primary pulse" : "ghost")} sign" data-sign>
        ${st.signedOff ? "✓ Concluída — reabrir" : "Marcar como concluída"}</button>
    </div>
    <textarea class="stage-note" data-stage-note placeholder="Nota geral da etapa…">${esc(st.note || "")}</textarea>
  </section>`;
}

/* ----- Track wiring ----- */
function wireTrack(p, t) {
  const rt = () => renderTrack(p, t);
  app.querySelector("[data-home]").addEventListener("click", goHome);
  app.querySelector("[data-proj]").addEventListener("click", () => goProject(p.id));

  app.querySelector("[data-title]").addEventListener("change", e => { t.title = e.target.value.trim(); save(); });

  // ficha fields
  app.querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", () => {
    const k = el.dataset.f;
    t[k] = k === "bpm" ? (el.value.trim() || null) : el.value;
    save();
    if (k === "type") rt();
  }));
  // composers
  app.querySelectorAll("[data-rm-comp]").forEach(b => b.addEventListener("click", () => {
    t.composers = (t.composers || []).filter(id => id !== b.dataset.rmComp); save(); rt();
  }));
  const addComp = app.querySelector("[data-add-comp]");
  if (addComp) addComp.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); const id = ensurePerson(p, addComp.value);
      if (id) { t.composers = t.composers || []; if (!t.composers.includes(id)) t.composers.push(id); }
      save(); rt(); }
  });

  app.querySelector("[data-del-track]").addEventListener("click", () => {
    if (confirm(`Excluir a faixa "${t.title || "sem título"}"?`)) {
      p.tracks = p.tracks.filter(x => x.id !== t.id); save(); goProject(p.id); toast("Faixa removida");
    }
  });

  // stages
  app.querySelectorAll(".stage-card").forEach(card => {
    const sid = card.dataset.stage;
    const stage = p.stages.find(s => s.id === sid);
    const st = ensureState(t, stage);

    const cycle = card.querySelector("[data-cycle]");
    if (cycle) cycle.addEventListener("click", () => { st.status = STATE_CYCLE[st.status || "todo"]; save(); rt(); });

    card.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.check; st.items = st.items || {};
      st.items[id] = st.items[id] || {}; st.items[id].check = !st.items[id].check;
      save(); rt();
    }));
    card.querySelectorAll("[data-inote]").forEach(inp => inp.addEventListener("change", () => {
      const id = inp.dataset.inote; st.items = st.items || {}; st.items[id] = st.items[id] || {};
      st.items[id].note = inp.value; save();
    }));
    card.querySelectorAll("[data-iname]").forEach(inp => inp.addEventListener("change", () => {
      const inst = t.instruments.find(i => i.id === inp.dataset.iname);
      if (inst) {
        inst.name = inp.value.trim();
        if (inst.personId) pushSkill(p.people.find(x => x.id === inst.personId), inst.name);
      }
      save();
    }));
    card.querySelectorAll("[data-imusico]").forEach(inp => inp.addEventListener("change", () => {
      const inst = t.instruments.find(i => i.id === inp.dataset.imusico);
      if (inst) {
        inst.personId = ensurePerson(p, inp.value);
        pushSkill(p.people.find(x => x.id === inst.personId), inst.name);
      }
      save(); rt();
    }));
    card.querySelectorAll("[data-idel]").forEach(b => b.addEventListener("click", () => {
      t.instruments = t.instruments.filter(i => i.id !== b.dataset.idel); save(); rt();
    }));
    const addInstr = card.querySelector("[data-add-instr]");
    if (addInstr) addInstr.addEventListener("click", () => {
      t.instruments.push({ id: uid("instr"), name: "", personId: null, used: true }); save(); rt();
      const names = app.querySelectorAll("[data-iname]"); if (names.length) names[names.length - 1].focus();
    });
    const sign = card.querySelector("[data-sign]");
    if (sign) sign.addEventListener("click", () => {
      if (!st.signedOff) {
        const rows = stageItems(p, t, sid);
        const allDone = rows.length > 0 && rows.every(r => r.checked);
        if (!allDone && !confirm("Ainda há instrumento(s) não concluído(s) nesta etapa. Concluir mesmo assim?")) return;
      }
      st.signedOff = !st.signedOff; save(); rt();
    });
    const note = card.querySelector("[data-stage-note]");
    if (note) note.addEventListener("change", () => { st.note = note.value; save(); });
  });
}

/* ---------- Modals ---------- */
function modal(html) {
  const b = document.createElement("div"); b.className = "modal-backdrop"; b.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(b);
  const close = () => b.remove();
  b.addEventListener("click", e => { if (e.target === b) close(); });
  return { b, close };
}

function openNewProjectModal() {
  const { b, close } = modal(`
    <h3>Novo projeto fonográfico</h3>
    <div class="field"><label>Título do projeto</label><input id="np-title" placeholder="Ex.: Blague II" autocomplete="off"></div>
    <div class="field"><label>Artista</label><input id="np-artist" placeholder="Ex.: Blague" autocomplete="off"></div>
    <div class="field"><label>Data-alvo <span class="faint">(opcional)</span></label><input id="np-date" type="date"></div>
    <div class="field"><label>Participantes / elenco <span class="faint">(opcional)</span></label>
      <div class="chips" id="np-chips"><input class="chip-input" id="np-person" placeholder="+ adicionar (Enter)"></div></div>
    <p class="hint">Tipo definido pelo nº de faixas: 1–3 Single · 4–6 EP · 7+ Álbum. O pipeline nasce no padrão e pode ser editado depois.</p>
    <div class="modal-actions"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn primary" data-ok>Criar projeto</button></div>`);
  const title = b.querySelector("#np-title"); title.focus();
  b.querySelector("[data-cancel]").addEventListener("click", close);

  const names = [];
  const chips = b.querySelector("#np-chips"); const personInput = b.querySelector("#np-person");
  const redrawChips = () => {
    chips.querySelectorAll(".chip").forEach(c => c.remove());
    names.forEach((nm, idx) => {
      const el = document.createElement("span"); el.className = "chip";
      el.innerHTML = `${esc(nm)}<button title="Remover">×</button>`;
      el.querySelector("button").addEventListener("click", () => { names.splice(idx, 1); redrawChips(); });
      chips.insertBefore(el, personInput);
    });
  };
  personInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); const nm = personInput.value.trim();
      if (nm && !names.some(x => x.toLowerCase() === nm.toLowerCase())) names.push(nm);
      personInput.value = ""; redrawChips(); }
  });

  const create = () => {
    const tt = title.value.trim(); if (!tt) return title.focus();
    const p = { id: uid(tt), title: tt, artist: b.querySelector("#np-artist").value.trim(),
      createdAt: new Date().toISOString().slice(0, 10), targetDate: b.querySelector("#np-date").value || null,
      cover: null, people: [], stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)), tracks: [] };
    names.forEach(nm => ensurePerson(p, nm));
    db.projects.push(p); save(); close(); goProject(p.id); toast("Projeto criado");
  };
  b.querySelector("[data-ok]").addEventListener("click", create);
  title.addEventListener("keydown", e => { if (e.key === "Enter") create(); });
}

function openTrackModal(p) {
  const typeOpts = TRACK_TYPES.map(x => `<option value="${x.key}">${x.label}</option>`).join("");
  const { b, close } = modal(`
    <h3>Nova faixa</h3>
    <div class="field"><label>Título</label><input id="tk-title" placeholder="Título da faixa" autocomplete="off"></div>
    <div class="field"><label>Tipo</label><select id="tk-type">${typeOpts}</select></div>
    <div class="field"><label>Compositores</label>
      <div class="chips" id="tk-chips"><input class="chip-input" id="tk-comp" list="people-list" placeholder="+ adicionar (Enter)"></div></div>
    <div class="field"><label>Estilo / gênero</label><input id="tk-style" placeholder="Opcional"></div>
    <p class="hint">BPM, tom, duração, referências e instrumentos você preenche na tela da faixa.</p>
    <div class="modal-actions"><button class="btn ghost" data-cancel>Cancelar</button><button class="btn primary" data-ok>Criar faixa</button></div>
    ${peopleDatalist(p)}`);
  const title = b.querySelector("#tk-title"); title.focus();
  const composers = [];
  const chips = b.querySelector("#tk-chips"); const compInput = b.querySelector("#tk-comp");
  const redrawChips = () => {
    chips.querySelectorAll(".chip").forEach(c => c.remove());
    composers.forEach(id => {
      const el = document.createElement("span"); el.className = "chip";
      el.innerHTML = `${esc(personName(p, id))}<button title="Remover">×</button>`;
      el.querySelector("button").addEventListener("click", () => { composers.splice(composers.indexOf(id), 1); redrawChips(); });
      chips.insertBefore(el, compInput);
    });
  };
  compInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); const id = ensurePerson(p, compInput.value);
      if (id && !composers.includes(id)) composers.push(id); compInput.value = ""; save(); redrawChips();
      compInput.setAttribute("list", "people-list"); }
  });
  b.querySelector("[data-cancel]").addEventListener("click", close);
  const create = () => {
    const tt = title.value.trim(); if (!tt) return title.focus();
    const track = { id: uid(tt), title: tt, type: b.querySelector("#tk-type").value,
      composers: composers.slice(), style: b.querySelector("#tk-style").value.trim(),
      bpm: null, key: "", duration: "", references: "", notes: "", instruments: [], stageState: {} };
    p.stages.forEach(s => ensureState(track, s));
    p.tracks.push(track); save(); close(); goTrack(p.id, track.id); toast("Faixa criada");
  };
  b.querySelector("[data-ok]").addEventListener("click", create);
}

function openStagesModal(p) {
  const draw = () => p.stages.map((s, i) => `
    <div class="stage-edit-row" data-i="${i}">
      <input class="se-label" value="${esc(s.label)}">
      <select class="se-mode">
        <option value="holistic" ${s.mode === "holistic" ? "selected" : ""}>Holística</option>
        <option value="instruments" ${s.mode === "instruments" ? "selected" : ""}>Por instrumento</option>
      </select>
      <button class="se-up" title="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="se-down" title="Descer" ${i === p.stages.length - 1 ? "disabled" : ""}>↓</button>
      <button class="se-del row-x" title="Remover">×</button>
    </div>`).join("");

  const { b, close } = modal(`
    <h3>Etapas do projeto</h3>
    <p class="hint">Os rótulos são só sugestões. Remova, renomeie, reordene ou crie etapas. "Por instrumento" importa (em sync) da etapa por-instrumento anterior.</p>
    <div id="se-list">${draw()}</div>
    <button class="btn ghost small" id="se-add">+ etapa</button>
    <div class="modal-actions"><button class="btn primary" data-ok>Fechar</button></div>`);

  const list = b.querySelector("#se-list");
  const rewire = () => {
    list.innerHTML = draw();
    list.querySelectorAll(".stage-edit-row").forEach(row => {
      const i = +row.dataset.i;
      row.querySelector(".se-label").addEventListener("change", e => { p.stages[i].label = e.target.value.trim() || p.stages[i].label; save(); });
      row.querySelector(".se-mode").addEventListener("change", e => { p.stages[i].mode = e.target.value; save(); rewire(); });
      row.querySelector(".se-up").addEventListener("click", () => { if (i > 0) { [p.stages[i - 1], p.stages[i]] = [p.stages[i], p.stages[i - 1]]; save(); rewire(); } });
      row.querySelector(".se-down").addEventListener("click", () => { if (i < p.stages.length - 1) { [p.stages[i + 1], p.stages[i]] = [p.stages[i], p.stages[i + 1]]; save(); rewire(); } });
      row.querySelector(".se-del").addEventListener("click", () => {
        if (confirm(`Remover a etapa "${p.stages[i].label}"? O progresso dela nas faixas será descartado.`)) {
          const sid = p.stages[i].id; p.stages.splice(i, 1);
          p.tracks.forEach(t => { if (t.stageState) delete t.stageState[sid]; });
          save(); rewire();
        }
      });
    });
  };
  rewire();
  b.querySelector("#se-add").addEventListener("click", () => {
    p.stages.push({ id: uid("etapa"), label: "Nova etapa", mode: "holistic" }); save(); rewire();
  });
  b.querySelector("[data-ok]").addEventListener("click", () => { close(); render(); });
}

/* ---------- Export / Import / Reset ---------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "projects.json"; a.click(); URL.revokeObjectURL(url);
  toast("projects.json exportado — commite no repo para salvar");
}
function importJSON() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
  inp.addEventListener("change", () => {
    const f = inp.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const parsed = JSON.parse(r.result);
      if (!parsed || !Array.isArray(parsed.projects)) throw new Error("formato inválido");
      db = parsed; save(); goHome(); toast("Dados importados"); }
      catch (e) { toast("Arquivo inválido: " + e.message); } };
    r.readAsText(f);
  });
  inp.click();
}
function resetToSeed() {
  if (!confirm("Descartar edições locais e recarregar os dados do repositório?")) return;
  localStorage.removeItem(LS_KEY); loadData().then(() => { goHome(); toast("Dados recarregados do repositório"); });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------- Boot ---------- */
document.getElementById("btn-new").addEventListener("click", openNewProjectModal);
document.getElementById("btn-export").addEventListener("click", exportJSON);
document.getElementById("btn-import").addEventListener("click", importJSON);
document.getElementById("btn-reset").addEventListener("click", resetToSeed);
document.getElementById("brand").addEventListener("click", goHome);
loadData().then(render);
