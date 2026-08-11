/* ==========================================================================
   Dashboard de Projeto Fonográfico
   Site estático (GitHub Pages). Estado inicial vem de data/projects.json;
   edições ficam no localStorage. Exportar/Importar move dados de volta ao repo.
   ========================================================================== */

const STAGES = [
  { key: "composicao", label: "Composição", short: "Comp" },
  { key: "gravacao",   label: "Gravação",   short: "Grav" },
  { key: "edicao",     label: "Edição",     short: "Edição" },
  { key: "premix",     label: "Pré-mix",    short: "Pré-mix" },
  { key: "mix",        label: "Mix",        short: "Mix" },
  { key: "master",     label: "Master",     short: "Master" },
];

const STATE_CYCLE = { todo: "wip", wip: "done", done: "todo" };
const STATE_ICON = { todo: "", wip: "◐", done: "✓" };
const LS_KEY = "fono-dashboard-v1";

let db = { version: 1, projects: [] };
let route = { view: "home", projectId: null };

/* ---------- Persistence ---------- */
async function loadData() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try { db = JSON.parse(saved); return; } catch (e) { /* fall through to seed */ }
  }
  try {
    const res = await fetch("data/projects.json", { cache: "no-store" });
    db = await res.json();
  } catch (e) {
    db = { version: 1, projects: [] };
  }
  save();
}

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

/* ---------- Helpers ---------- */
function uid(base) {
  const slug = (base || "item").toString().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
  return slug + "-" + Math.random().toString(36).slice(2, 6);
}

function classify(n) {
  if (n <= 0) return { key: "draft", label: "Rascunho" };
  if (n <= 3)  return { key: "single", label: "Single" };
  if (n <= 6)  return { key: "ep", label: "EP" };
  return { key: "album", label: "Álbum" };
}

function trackProgress(track) {
  let done = 0, wip = 0;
  for (const s of STAGES) {
    const v = track.stages[s.key] || "todo";
    if (v === "done") done++;
    else if (v === "wip") wip += 0.5;
  }
  return (done + wip) / STAGES.length; // 0..1
}

function projectStats(p) {
  if (!p.tracks.length) return { pct: 0, donePct: 0, wipPct: 0 };
  let total = 0, doneUnits = 0, wipUnits = 0;
  for (const t of p.tracks) {
    for (const s of STAGES) {
      total++;
      const v = t.stages[s.key] || "todo";
      if (v === "done") doneUnits++;
      else if (v === "wip") wipUnits++;
    }
  }
  return {
    pct: Math.round(((doneUnits + wipUnits * 0.5) / total) * 100),
    donePct: (doneUnits / total) * 100,
    wipPct: (wipUnits / total) * 100,
  };
}

function getProject(id) { return db.projects.find(p => p.id === id); }

function esc(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");

function render() {
  if (route.view === "detail" && getProject(route.projectId)) renderDetail(getProject(route.projectId));
  else { route.view = "home"; renderHome(); }
}

function renderHome() {
  const cards = db.projects.map(p => {
    const st = projectStats(p);
    const cls = classify(p.tracks.length);
    return `
      <div class="card" data-open="${p.id}">
        <div class="card-top">
          <div>
            <h3>${esc(p.title)}</h3>
            <div class="artist">${esc(p.artist) || "&nbsp;"}</div>
          </div>
          <span class="badge ${cls.key}">${cls.label}</span>
        </div>
        <div class="meta-row">
          <span><b>${p.tracks.length}</b> faixa${p.tracks.length === 1 ? "" : "s"}</span>
          ${p.targetDate ? `<span>Meta: <b>${esc(p.targetDate)}</b></span>` : ""}
        </div>
        <div class="progress-label"><span>Progresso</span><b>${st.pct}%</b></div>
        <div class="progress">
          <div class="seg-done" style="width:${st.donePct}%"></div>
          <div class="seg-wip" style="width:${st.wipPct}%"></div>
        </div>
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="section-head">
      <h2>Meus projetos</h2>
      <span class="count">${db.projects.length} projeto${db.projects.length === 1 ? "" : "s"}</span>
    </div>
    ${db.projects.length ? `<div class="grid">${cards}</div>` : `
      <div class="empty">
        <h3>Nenhum projeto ainda</h3>
        <p>Crie seu primeiro projeto fonográfico para começar.</p>
        <button class="btn primary" data-action="new">+ Novo projeto</button>
      </div>`}
  `;

  app.querySelectorAll("[data-open]").forEach(el =>
    el.addEventListener("click", () => { route = { view: "detail", projectId: el.dataset.open }; render(); }));
  const nb = app.querySelector('[data-action="new"]');
  if (nb) nb.addEventListener("click", openNewProjectModal);
}

function renderDetail(p) {
  const st = projectStats(p);
  const cls = classify(p.tracks.length);

  const rows = p.tracks.map((t, i) => {
    const stageCells = STAGES.map(s => {
      const v = t.stages[s.key] || "todo";
      return `<td class="stage-col">
        <button class="stage-dot ${v}" data-track="${t.id}" data-stage="${s.key}" title="${s.label}: ${v}">${STATE_ICON[v]}</button>
      </td>`;
    }).join("");
    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="track-title"><input value="${esc(t.title)}" data-edit-title="${t.id}" placeholder="Título da faixa"></td>
        ${stageCells}
        <td class="notes-cell"><textarea data-edit-notes="${t.id}" placeholder="Participantes, pendências, decisões…">${esc(t.notes)}</textarea></td>
        <td class="row-actions"><button class="btn danger small" data-del-track="${t.id}">Remover</button></td>
      </tr>`;
  }).join("");

  app.innerHTML = `
    <div class="crumb" data-home>← Projetos</div>
    <div class="detail-head">
      <div>
        <h2>${esc(p.title)}</h2>
        <div class="detail-sub">
          <span class="badge ${cls.key}">${cls.label}</span>
          ${esc(p.artist) ? `<span>${esc(p.artist)}</span>` : ""}
          <span>${p.tracks.length} faixa${p.tracks.length === 1 ? "" : "s"}</span>
          ${p.targetDate ? `<span>· meta ${esc(p.targetDate)}</span>` : ""}
        </div>
      </div>
      <button class="btn danger" data-del-project="${p.id}">Excluir projeto</button>
    </div>

    <div class="overall-box">
      <div class="progress-label"><span>Progresso geral</span><b>${st.pct}%</b></div>
      <div class="progress">
        <div class="seg-done" style="width:${st.donePct}%"></div>
        <div class="seg-wip" style="width:${st.wipPct}%"></div>
      </div>
    </div>

    ${p.tracks.length ? `
    <div class="table-wrap">
      <table class="pipeline">
        <thead>
          <tr>
            <th>#</th><th>Faixa</th>
            ${STAGES.map(s => `<th class="stage-col">${s.short}</th>`).join("")}
            <th>Observações</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : `<div class="empty"><h3>Sem faixas</h3><p>Adicione a primeira faixa deste projeto.</p></div>`}

    <div class="add-track-bar">
      <button class="btn primary" data-add-track>+ Adicionar faixa</button>
    </div>

    <div class="legend">
      <span><i class="k done"></i> Concluído</span>
      <span><i class="k wip"></i> Em andamento</span>
      <span><i class="k todo"></i> Não iniciado</span>
      <span style="color:var(--text-faint)">Clique numa célula para alternar o estado.</span>
    </div>
  `;

  app.querySelector("[data-home]").addEventListener("click", () => { route = { view: "home" }; render(); });

  app.querySelectorAll("[data-track][data-stage]").forEach(btn =>
    btn.addEventListener("click", () => {
      const t = p.tracks.find(x => x.id === btn.dataset.track);
      t.stages[btn.dataset.stage] = STATE_CYCLE[t.stages[btn.dataset.stage] || "todo"];
      save(); renderDetail(p);
    }));

  app.querySelectorAll("[data-edit-title]").forEach(inp =>
    inp.addEventListener("change", () => {
      const t = p.tracks.find(x => x.id === inp.dataset.editTitle);
      t.title = inp.value.trim(); save();
    }));

  app.querySelectorAll("[data-edit-notes]").forEach(ta =>
    ta.addEventListener("change", () => {
      const t = p.tracks.find(x => x.id === ta.dataset.editNotes);
      t.notes = ta.value; save();
    }));

  app.querySelectorAll("[data-del-track]").forEach(btn =>
    btn.addEventListener("click", () => {
      const t = p.tracks.find(x => x.id === btn.dataset.delTrack);
      if (confirm(`Remover a faixa "${t.title || "sem título"}"?`)) {
        p.tracks = p.tracks.filter(x => x.id !== btn.dataset.delTrack);
        save(); renderDetail(p); toast("Faixa removida");
      }
    }));

  app.querySelector("[data-add-track]").addEventListener("click", () => {
    p.tracks.push({
      id: uid("faixa"), title: "", notes: "",
      stages: { composicao: "todo", gravacao: "todo", edicao: "todo", premix: "todo", mix: "todo", master: "todo" },
    });
    save(); renderDetail(p);
    const inputs = app.querySelectorAll("[data-edit-title]");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  app.querySelector("[data-del-project]").addEventListener("click", () => {
    if (confirm(`Excluir o projeto "${p.title}" e todas as suas faixas? Esta ação não pode ser desfeita.`)) {
      db.projects = db.projects.filter(x => x.id !== p.id);
      save(); route = { view: "home" }; render(); toast("Projeto excluído");
    }
  });
}

/* ---------- New project modal ---------- */
function openNewProjectModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Novo projeto fonográfico</h3>
      <div class="field">
        <label>Título do projeto</label>
        <input id="np-title" placeholder="Ex.: Blague II" autocomplete="off">
      </div>
      <div class="field">
        <label>Artista</label>
        <input id="np-artist" placeholder="Ex.: Blague" autocomplete="off">
      </div>
      <div class="field">
        <label>Data-alvo de lançamento <span style="color:var(--text-faint)">(opcional)</span></label>
        <input id="np-date" type="date">
      </div>
      <p class="hint">O tipo (Single / EP / Álbum) é definido automaticamente pelo número de faixas: 1–3 Single · 4–6 EP · 7+ Álbum.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-cancel>Cancelar</button>
        <button class="btn primary" data-create>Criar projeto</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
  backdrop.querySelector("[data-cancel]").addEventListener("click", close);
  const titleInput = backdrop.querySelector("#np-title");
  titleInput.focus();

  const create = () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const p = {
      id: uid(title),
      title,
      artist: backdrop.querySelector("#np-artist").value.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      targetDate: backdrop.querySelector("#np-date").value || null,
      cover: null,
      tracks: [],
    };
    db.projects.push(p); save(); close();
    route = { view: "detail", projectId: p.id }; render();
    toast("Projeto criado");
  };
  backdrop.querySelector("[data-create]").addEventListener("click", create);
  titleInput.addEventListener("keydown", e => { if (e.key === "Enter") create(); });
}

/* ---------- Export / Import ---------- */
function exportJSON() {
  const data = JSON.stringify(db, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "projects.json"; a.click();
  URL.revokeObjectURL(url);
  toast("projects.json exportado — commite no repo para salvar");
}

function importJSON() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.projects)) throw new Error("formato inválido");
        db = parsed; save(); route = { view: "home" }; render();
        toast("Dados importados");
      } catch (e) { toast("Arquivo inválido: " + e.message); }
    };
    reader.readAsText(file);
  });
  input.click();
}

function resetToSeed() {
  if (!confirm("Descartar todas as edições locais e recarregar os dados do arquivo do repositório?")) return;
  localStorage.removeItem(LS_KEY);
  loadData().then(() => { route = { view: "home" }; render(); toast("Dados recarregados do repositório"); });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------- Boot ---------- */
document.getElementById("btn-new").addEventListener("click", openNewProjectModal);
document.getElementById("btn-export").addEventListener("click", exportJSON);
document.getElementById("btn-import").addEventListener("click", importJSON);
document.getElementById("btn-reset").addEventListener("click", resetToSeed);
document.getElementById("brand").addEventListener("click", () => { route = { view: "home" }; render(); });

loadData().then(render);
