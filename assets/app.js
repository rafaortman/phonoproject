/* ==========================================================================
   Dashboard de Projeto Fonográfico — v4
   Site estático (GitHub Pages), com modo local e sincronização por conta.

   Modelo:
   - Projeto: people[], tracks[].
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
const LS_OWNER = "fono-owner"; // username dono do db local (sincronizado); ausente = local/convidado
const ROUTE_KEY = "fono-route"; // sessionStorage: persiste somente durante a vida da aba

const DEFAULT_STAGES = [
  { id: "edicao",     label: "Edição",     mode: "instruments" },
  { id: "premix",     label: "Pré-mix",    mode: "instruments" },
  { id: "mix",        label: "Mix",        mode: "instruments" },
  { id: "master",     label: "Master",     mode: "holistic" },
];


const STATE_CYCLE = { todo: "wip", wip: "done", done: "todo" };
const STATE_LABEL = { todo: "não iniciada", wip: "em andamento", done: "concluída" };

/* ---------- Ícones (Material Symbols, inline, coloridos por currentColor) ---------- */
const ICONS = {
  check:'<path d="M22.24,31.77l-6.42-6.42,1.6-1.6,4.81,4.81,10.33-10.33,1.6,1.6-11.93,11.93Z"/>',
  chevron:'<path d="M25,29.01l-6.5-6.5,1.52-1.52,4.98,4.98,4.98-4.98,1.52,1.52-6.5,6.5Z"/>',
  can:'<path d="M19.44,35c-.61,0-1.13-.22-1.57-.65-.44-.44-.65-.96-.65-1.57v-14.44h-1.11v-2.22h5.56v-1.11h6.67v1.11h5.56v2.22h-1.11v14.44c0,.61-.22,1.13-.65,1.57-.44.44-.96.65-1.57.65h-11.11ZM30.56,18.33h-11.11v14.44h11.11v-14.44ZM21.67,30.56h2.22v-10h-2.22v10ZM26.11,30.56h2.22v-10h-2.22v10ZM19.44,18.33v14.44-14.44Z"/>',
  close:'<path d="M18.7,32.88l-1.58-1.58,6.3-6.3-6.3-6.3,1.58-1.58,6.3,6.3,6.3-6.3,1.58,1.58-6.3,6.3,6.3,6.3-1.58,1.58-6.3-6.3-6.3,6.3Z"/>',
  down:'<path d="M23.87,16v13.7l-6.3-6.3-1.58,1.6,9,9,9-9-1.58-1.6-6.3,6.3v-13.7h-2.25Z"/>',
  left:'<path d="M34,23.87h-13.7l6.3-6.3-1.6-1.58-9,9,9,9,1.6-1.58-6.3-6.3h13.7v-2.25Z"/>',
  right:'<g transform="translate(50 0) scale(-1 1)"><path d="M34,23.87h-13.7l6.3-6.3-1.6-1.58-9,9,9,9,1.6-1.58-6.3-6.3h13.7v-2.25Z"/></g>',
  edit:'<path d="M17.12,32.88h1.6l11-11-1.6-1.6-11,11v1.6ZM14.87,35.13v-4.78l14.86-14.83c.23-.21.47-.37.75-.48s.56-.17.86-.17.59.06.87.17.53.28.73.51l1.55,1.58c.23.21.39.45.49.73s.15.56.15.84c0,.3-.05.59-.15.86s-.27.52-.49.75l-14.83,14.83h-4.78Z"/>',
  pause:'<rect x="20.04" y="18.35" width="2.23" height="13.3"/><rect x="27.73" y="18.35" width="2.23" height="13.3"/>',
  plus:'<path d="M23.87,26.13h-6.75v-2.25h6.75v-6.75h2.25v6.75h6.75v2.25h-6.75v6.75h-2.25v-6.75Z"/>',
  record:'<path d="M19.22,30.78c-1.6-1.6-2.39-3.52-2.39-5.78s.8-4.18,2.39-5.78c1.6-1.6,3.52-2.39,5.78-2.39s4.18.8,5.78,2.39,2.39,3.52,2.39,5.78-.8,4.18-2.39,5.78c-1.6,1.6-3.52,2.39-5.78,2.39s-4.18-.8-5.78-2.39ZM29.13,29.13c1.14-1.14,1.71-2.51,1.71-4.13s-.57-2.99-1.71-4.13-2.51-1.71-4.13-1.71-2.99.57-4.13,1.71-1.71,2.51-1.71,4.13.57,2.99,1.71,4.13,2.51,1.71,4.13,1.71,2.99-.57,4.13-1.71Z"/>',
  stop:'<path d="M18.25,31.75v-13.51h13.51v13.51h-13.51ZM20.5,29.5h9v-9h-9v9Z"/>',
  up:'<path d="M23.87,34v-13.7l-6.3,6.3-1.58-1.6,9-9,9,9-1.58,1.6-6.3-6.3v13.7h-2.25Z"/>',
};
function icon(name, cls) { return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 50 50" width="24" height="24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`; }
// Ícone do estado "em andamento" conforme a etapa: gravar na Gravação, senão pausa
function workingIcon(stage) {
  return /grava/.test(((stage && stage.label) || "").toLowerCase()) ? "record" : "pause";
}
// Botão de estado que cicla □ não iniciado → ○/‖ em andamento → ✓ concluído
function stateBtn(status, working, attrs) {
  const name = status === "done" ? "check" : status === "wip" ? working : "stop";
  return `<button type="button" class="state-btn state-btn--${status}" ${attrs} title="Alternar estado (${STATE_LABEL[status]})">${icon(name)}</button>`;
}

let db = { version: 2, projects: [] };
let route = { view: "home", projectId: null, trackId: null };
let cortinaEl = null, cortinaCleanup = null;
const collapsedStages = new Set(); // etapas recolhidas (accordion) — estado de UI, não persistido
const expandedPeople = new Set();  // músicos expandidos; começam TODOS recolhidos
let tracksSectionOpen = true;
let peopleSectionOpen = false;
let trackInfoOpen = true;
let stagesSectionOpen = true;
const MAX_PROJECTS = 3;
const coverCache = new Map(); // fileId -> data URI; nunca é persistido no JSON da conta
const coverLoadFailed = new Set();

/* ---------- Persistence ---------- */
// Etapas passaram a ser da faixa: cada faixa herda uma cópia própria das etapas
// que eram do projeto (preserva stageState, que já vivia na faixa).
function migrate() {
  const upgradingToV4 = (+db.version || 0) < 4;
  let changed = db.version !== 4;
  (db.projects || []).forEach(p => {
    (p.tracks || []).forEach(t => {
      if (!Array.isArray(t.stages)) { t.stages = p.stages ? JSON.parse(JSON.stringify(p.stages)) : []; changed = true; }
      if (!t.stageState) { t.stageState = {}; changed = true; }
      if (!Array.isArray(t.rejectedStageLabels)) { t.rejectedStageLabels = []; changed = true; }
      if (!Array.isArray(t.producers)) { t.producers = []; changed = true; }
      if (typeof t.lyricsChord !== "string") { t.lyricsChord = ""; changed = true; }
      if (t.lyricsChordHeight != null && (!Number.isFinite(+t.lyricsChordHeight) || +t.lyricsChordHeight < 80 || +t.lyricsChordHeight > 2000)) {
        delete t.lyricsChordHeight; changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(t, "references")) { delete t.references; changed = true; }
      if (upgradingToV4) {
        const compositionIndex = t.stages.findIndex(s => s.id === "composicao" || (s.label || "").trim().toLowerCase() === "composição");
        if (compositionIndex >= 0) {
          const composition = t.stages[compositionIndex];
          t.stages.splice(compositionIndex, 1);
          delete t.stageState[composition.id];
          changed = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(t, "compositionStatus")) { delete t.compositionStatus; changed = true; }
      if (Object.prototype.hasOwnProperty.call(t, "compositionNote")) { delete t.compositionNote; changed = true; }
      if (upgradingToV4 && !t.baseStageId) {
        const recording = t.stages.find(s => s.id === "gravacao" || (s.label || "").trim().toLowerCase() === "gravação");
        if (recording) { t.baseStageId = recording.id; changed = true; }
      }
      const baseIndex = t.stages.findIndex(s => s.id === t.baseStageId);
      if (baseIndex > 0) {
        const base = t.stages.splice(baseIndex, 1)[0];
        t.stages.unshift(base); changed = true;
      }
    });
    if (Object.prototype.hasOwnProperty.call(p, "stages")) { delete p.stages; changed = true; }
  });
  db.version = 4;
  return changed;
}
// Salva no cache local sempre; no servidor (debounce ~1,5s) só se logado E sincronizado.
let saveTimer = null;
let hasUnsavedChanges = false;
function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
  hasUnsavedChanges = true;
  if (!isSynced() || coverBusy.size) return;
  clearTimeout(saveTimer);
  setSync("saving");
  saveTimer = setTimeout(() => {
    api.save(db).then(() => { hasUnsavedChanges = false; setSync("saved"); }).catch(e => { setSync("error"); toast("Falha ao salvar: " + e.message); });
  }, 1500);
}
function ensureDb(data) { return (data && Array.isArray(data.projects)) ? data : { version: 2, projects: [] }; }
function readLocalDb() { try { return ensureDb(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return { version: 2, projects: [] }; } }
function hasLocalData() { return (readLocalDb().projects || []).length > 0; }
// db local pertence à conta logada?
function isSynced() { const s = api.session(); return !!(api.isLoggedIn() && s && localStorage.getItem(LS_OWNER) === s.username); }
function setOwner() { const s = api.session(); if (s) localStorage.setItem(LS_OWNER, s.username); }
function clearOwner() { localStorage.removeItem(LS_OWNER); }
function slugify(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
let syncHideTimer = null;
function setSync(state) {
  const el = document.getElementById("sync");
  if (!el) return;
  clearTimeout(syncHideTimer);
  el.className = state ? "account__sync is-" + state : "account__sync";
  el.textContent = state === "saving" ? "salvando…" : state === "saved" ? "salvo ✓" : state === "error" ? "erro ao salvar" : "";
  if (state === "saved" || state === "error") {
    syncHideTimer = setTimeout(() => {
      el.className = "account__sync";
      el.textContent = "";
    }, state === "saved" ? 2500 : 5000);
  }
}

function cloudCoverId(cover) { return cover && typeof cover === "object" ? cover.fileId || "" : ""; }
function coverSrc(project) {
  if (!project || !project.cover) return "";
  if (typeof project.cover === "string") return project.cover;
  return coverCache.get(cloudCoverId(project.cover)) || "";
}
function dataUriParts(dataURI) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i.exec(String(dataURI || ""));
  if (!m) throw new Error("imagem inválida");
  return { mimeType: m[1].toLowerCase(), imageBase64: m[2] };
}
async function saveCloudNow() {
  clearTimeout(saveTimer);
  localStorage.setItem(LS_KEY, JSON.stringify(db));
  hasUnsavedChanges = true;
  setSync("saving");
  await api.save(db);
  hasUnsavedChanges = false;
  setSync("saved");
}
async function loadCloudCovers(data) {
  const ids = [...new Set((data.projects || []).map(p => cloudCoverId(p.cover)).filter(id => id && !coverCache.has(id)))];
  if (!ids.length) return;
  await Promise.all(ids.map(async id => {
    try { coverCache.set(id, await api.getCover(id)); coverLoadFailed.delete(id); }
    catch (e) { coverLoadFailed.add(id); }
  }));
  if (db === data) render();
}

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
        let q = quality, dataURI = canvas.toDataURL("image/jpeg", q);
        const bytes = uri => Math.ceil((uri.split(",")[1] || "").length * 3 / 4);
        while (bytes(dataURI) > 96 * 1024 && q > 0.3) {
          q = Math.max(0.3, q - 0.08);
          dataURI = canvas.toDataURL("image/jpeg", q);
        }
        if (bytes(dataURI) > 100 * 1024) return reject(new Error("imagem acima de 100 KB"));
        resolve(dataURI);
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
    catch (e) { toast(e.message === "imagem acima de 100 KB" ? "A imagem não pôde ser reduzida para 100 KB" : "Não consegui carregar a imagem"); }
  });
  inp.click();
}

const coverBusy = new Set();
async function setProjectCover(project, dataURI) {
  if (coverBusy.has(project.id)) return;
  if (!isSynced()) {
    project.cover = dataURI; save(); render(); toast("Capa atualizada"); return;
  }
  coverBusy.add(project.id);
  const previous = project.cover;
  let newFileId = "";
  try {
    const image = dataUriParts(dataURI);
    setSync("saving");
    newFileId = await api.uploadCover(image.imageBase64, image.mimeType);
    project.cover = { fileId: newFileId };
    coverCache.set(newFileId, dataURI);
    coverLoadFailed.delete(newFileId);
    await saveCloudNow();
    const oldFileId = cloudCoverId(previous);
    if (oldFileId) { coverCache.delete(oldFileId); api.deleteCover(oldFileId).catch(() => {}); }
    render(); toast("Capa atualizada");
  } catch (e) {
    project.cover = previous;
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    if (newFileId) { coverCache.delete(newFileId); api.deleteCover(newFileId).catch(() => {}); }
    setSync("error"); render(); toast("Falha ao salvar capa: " + e.message);
  } finally { coverBusy.delete(project.id); }
}
async function removeProjectCover(project) {
  if (coverBusy.has(project.id) || !project.cover) return;
  if (!isSynced()) {
    project.cover = null; save(); render(); toast("Capa removida"); return;
  }
  coverBusy.add(project.id);
  const previous = project.cover;
  const fileId = cloudCoverId(previous);
  project.cover = null;
  try {
    await saveCloudNow();
    if (fileId) { coverCache.delete(fileId); api.deleteCover(fileId).catch(() => {}); }
    render(); toast("Capa removida");
  } catch (e) {
    project.cover = previous;
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    setSync("error"); render(); toast("Falha ao remover capa: " + e.message);
  } finally { coverBusy.delete(project.id); }
}
async function removeProject(project) {
  const index = db.projects.indexOf(project);
  if (index < 0) return;
  const fileId = cloudCoverId(project.cover);
  db.projects.splice(index, 1);
  if (!isSynced()) { save(); goHome(); toast("Projeto excluído"); return; }
  try {
    await saveCloudNow();
    if (fileId) { coverCache.delete(fileId); api.deleteCover(fileId).catch(() => {}); }
    goHome(); toast("Projeto excluído");
  } catch (e) {
    db.projects.splice(index, 0, project);
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    setSync("error"); render(); toast("Falha ao excluir projeto: " + e.message);
  }
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
    if ((t.producers || []).includes(id)) n++;
    (t.instruments || []).forEach(i => { if (i.personId === id) n++; });
  });
  return n;
}
function doRemovePerson(p, id) {
  p.tracks.forEach(t => {
    t.composers = (t.composers || []).filter(c => c !== id);
    t.producers = (t.producers || []).filter(x => x !== id);
    (t.instruments || []).forEach(i => { if (i.personId === id) i.personId = null; });
  });
  p.people = (p.people || []).filter(x => x.id !== id);
}
// Remove um músico; se houver referências, confirma antes. onDone() roda após remover.
function removePerson(p, id, onDone) {
  const refs = personRefs(p, id);
  const who = personName(p, id);
  const go = () => { doRemovePerson(p, id); onDone && onDone(); };
  if (refs > 0) confirmDialog(`"${who}" aparece em ${refs} lugar(es) (compositor/músico). Remover dos músicos e limpar essas referências?`, go, { danger: true, okLabel: "Remover" });
  else go();
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
// Etapas são da faixa: instrStages e suggestNextStage operam sobre track.stages
function instrStages(track) { return (track.stages || []).filter(s => s.mode === "instruments"); }

// Próxima etapa da sequência padrão ainda não usada na faixa (rótulo editável depois)
function suggestNextStage(track) {
  const used = new Set((track.stages || []).map(s => (s.label || "").toLowerCase()));
  const rejected = new Set((track.rejectedStageLabels || []).map(s => (s || "").trim().toLowerCase()));
  const next = DEFAULT_STAGES.find(d => !used.has(d.label.toLowerCase()) && !rejected.has(d.label.toLowerCase()));
  return next
    ? { id: uid(next.id), label: next.label, mode: next.mode }
    : { id: uid("etapa"), label: "Nova etapa", mode: "holistic" };
}

// Linhas de uma etapa por-instrumento: o arranjo inteiro da faixa.
// Sem sincronização entre etapas — cada etapa carrega o estado que o humano marcou nela.
function stageItems(p, track, stageId) {
  const st = track.stageState[stageId] || { items: {} };
  const items = st.items || {};
  return track.instruments.filter(i => i.used).map(inst => {
    const it = items[inst.id] || {};
    const state = it.state || (it.check ? "done" : "todo"); // compat com o modelo antigo (check booleano)
    return { inst, state, note: it.note || "" };
  });
}

function stageStatus(p, track, stage) {
  const st = ensureState(track, stage);
  if (stage.mode === "holistic") return st.status || "todo";
  if (st.signedOff) return "done";
  const rows = stageItems(p, track, stage.id);
  return rows.some(r => r.state !== "todo") ? "wip" : "todo";
}

/* ---------- Rendering ---------- */
const app = document.getElementById("app");

function render() {
  closeCortina();
  const p = route.projectId ? getProject(route.projectId) : null;
  if (route.view === "track" && p) { const t = getTrack(p, route.trackId); if (t) return renderTrack(p, t); }
  if (route.view === "project" && p) return renderProject(p);
  route = { view: "home" }; rememberRoute(); renderHome();
}
function rememberRoute() { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(route)); }
function restoredRoute() {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(ROUTE_KEY) || "null"); } catch (e) { return { view: "home" }; }
  if (!saved || !["home", "project", "track"].includes(saved.view)) return { view: "home" };
  if (saved.view === "home") return { view: "home" };
  const p = getProject(saved.projectId);
  if (!p) return { view: "home" };
  if (saved.view === "project") return { view: "project", projectId: p.id };
  const t = getTrack(p, saved.trackId);
  return t ? { view: "track", projectId: p.id, trackId: t.id } : { view: "project", projectId: p.id };
}
// Navegação: empurra uma entrada no histórico do navegador e sobe o scroll.
// (Só a navegação sobe o scroll — re-renders internos usam render()/rt() e não sobem.)
function navTo(r) {
  route = r;
  rememberRoute();
  history.pushState(r, "");
  render();
  window.scrollTo(0, 0);
}
function goHome() { navTo({ view: "home" }); }
function goProject(id) {
  tracksSectionOpen = true;
  peopleSectionOpen = false;
  expandedPeople.clear();
  navTo({ view: "project", projectId: id });
}
function goTrack(pid, tid) {
  trackInfoOpen = true;
  stagesSectionOpen = true;
  navTo({ view: "track", projectId: pid, trackId: tid });
}
window.addEventListener("popstate", e => {
  route = e.state || { view: "home" };
  rememberRoute();
  render();
  window.scrollTo(0, 0);
});

/* ----- Seção recolhível (accordion) — cabeçalho + corpo ----- */
// key: identifica o toggle; open: aberta?; title/count: rótulo; body: HTML interno.
function accordionSection({ key, open, title, count, body }) {
  const bodyId = "section-" + key;
  const badge = count == null ? "" : ` <span class="count">${count}</span>`;
  return `<section class="section${open ? "" : " is-collapsed"}">
    <h3 class="section__heading">
      <button type="button" class="section__toggle" data-section-toggle="${key}" aria-expanded="${open}" aria-controls="${bodyId}">
        ${icon("chevron", open ? "" : "rot-right")}<span>${esc(title)}${badge}</span>
      </button>
    </h3>
    <div class="section__body" id="${bodyId}">${body}</div>
  </section>`;
}
// Estado aberto/fechado de cada seção recolhível (um único ponto de verdade).
const SECTION_STATE = {
  people:       { get: () => peopleSectionOpen, set: v => peopleSectionOpen = v },
  tracks:       { get: () => tracksSectionOpen, set: v => tracksSectionOpen = v },
  "track-info": { get: () => trackInfoOpen,     set: v => trackInfoOpen = v },
  stages:       { get: () => stagesSectionOpen, set: v => stagesSectionOpen = v },
};
function wireSectionToggles() {
  app.querySelectorAll("[data-section-toggle]").forEach(btn => btn.addEventListener("click", () => {
    const s = SECTION_STATE[btn.dataset.sectionToggle];
    if (s) { s.set(!s.get()); render(); }
  }));
}

/* ----- Home ----- */
function renderHome() {
  const cards = db.projects.map(p => {
    const cls = classify(p.tracks.length);
    const src = coverSrc(p);
    const nTracks = p.tracks.length, nPeople = (p.people || []).length;
    return `<li class="project-card${src ? "" : " project-card--no-cover"}">
        <a class="project-card__link" href="#" data-open="${p.id}">
          ${src ? `<span class="project-card__cover"><img src="${esc(src)}" alt=""></span>` : ""}
          <div class="project-card__body">
            <div class="project-card__top">
              <div class="project-card__id">
                <h3 class="project-card__title">${esc(p.title)}</h3>
                <div class="project-card__artist">${esc(p.artist) || "&nbsp;"}</div>
              </div>
              <span class="badge badge--${cls.key}">${cls.label}</span>
            </div>
            <div class="project-card__meta">
              <span><b>${nTracks}</b> faixa${nTracks === 1 ? "" : "s"}</span>
              <span><b>${nPeople}</b> músico${nPeople === 1 ? "" : "s"}</span>
            </div>
          </div>
        </a>
      </li>`;
  }).join("");
  const newCard = db.projects.length < MAX_PROJECTS
    ? `<li class="project-card project-card--new"><button type="button" class="project-card__new" data-action="new">+ Novo projeto</button></li>`
    : "";

  app.innerHTML = `
    ${contextBox()}
    <div class="list-head"><h2>Meus projetos</h2>
      <span class="count">${db.projects.length} projeto${db.projects.length === 1 ? "" : "s"}</span></div>
    <ul class="project-grid">${cards}${newCard}</ul>`;

  wireContextBox();
  app.querySelectorAll("[data-open]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); goProject(el.dataset.open); }));
  const nb = app.querySelector('[data-action="new"]'); if (nb) nb.addEventListener("click", openNewProjectModal);
}

/* ----- Project (tracks overview) ----- */
function renderProject(p) {
  const cls = classify(p.tracks.length);
  const nominal = projectNominal(p);
  const cover = coverSrc(p);
  const nTracks = p.tracks.length;
  const nPeople = (p.people || []).length;
  const rows = p.tracks.map((t, i) => {
    const pend = nextAction(p, t);
    const authors = (t.composers || []).map(id => personName(p, id)).filter(Boolean).join(", ");
    return `<li class="track-row">
        <a class="track-row__link" href="#" data-track="${t.id}">
          <span class="track-row__num" aria-hidden="true">${i + 1}</span>
          <span class="track-row__main">
            <span class="track-row__title">${esc(t.title) || "<span class='faint'>Sem título</span>"}</span>
            ${authors ? `<span class="track-row__authors">De: ${esc(authors)}</span>` : ""}
            <span class="track-row__status">${esc(pend || "—")}</span>
          </span>
        </a>
        <div class="row-actions">
          <button type="button" class="icon-button" data-move-track="up" data-tid="${t.id}" title="Subir" ${i === 0 ? "disabled" : ""}>${icon("up")}</button>
          <button type="button" class="icon-button" data-move-track="down" data-tid="${t.id}" title="Descer" ${i === nTracks - 1 ? "disabled" : ""}>${icon("down")}</button>
          <button type="button" class="icon-button icon-button--danger" data-del-track-row="${t.id}" title="Excluir faixa">${icon("close")}</button>
        </div>
      </li>`;
  }).join("");

  app.innerHTML = `
    <nav class="breadcrumb" aria-label="Trilha de navegação">
      <button type="button" class="breadcrumb__link" data-home>${icon("left")} Projetos</button>
    </nav>
    ${guestBanner()}
    <header class="detail-head">
      <div class="detail-head__id">
        <div class="project-cover">
          <button type="button" class="project-cover__pick${cover ? "" : " project-cover__pick--empty"}" data-cover title="${p.cover ? "Trocar capa" : "Adicionar capa"}">
            ${cover ? `<img src="${esc(cover)}" alt="Capa do projeto ${esc(p.title)}">` : `<span>${coverLoadFailed.has(cloudCoverId(p.cover)) ? "capa indisponível" : p.cover ? "carregando…" : "+ capa"}</span>`}
          </button>
          ${cover ? `<button type="button" class="project-cover__remove" data-cover-rm title="Remover capa">×</button>` : ""}
        </div>
        <div>
          <h2>${esc(p.title)}</h2>
          <p class="detail-head__sub">
            <span class="badge badge--${cls.key}">${cls.label}</span>
            ${esc(p.artist) ? `<span>${esc(p.artist)}</span>` : ""}
            <span>${nTracks} faixa${nTracks === 1 ? "" : "s"}</span>
          </p>
        </div>
      </div>
      <div class="detail-head__actions">
        <button type="button" class="btn btn--danger btn--icon" data-del-project title="Excluir projeto">${icon("can")}</button>
      </div>
    </header>
    <section class="project-status" aria-label="Situação das faixas">
      ${nominal.length
        ? `<ul class="project-status__list">${nominal.map(b => `<li class="project-status__row"><b>${b.count}</b> <span>${esc(b.label)}</span></li>`).join("")}</ul>`
        : `<p class="faint">Sem faixas ainda.</p>`}
    </section>

    <div class="field">
      <label for="proj-notes">Observações do projeto</label>
      <textarea id="proj-notes" class="note-field" data-proj-notes placeholder="Notas, decisões e pendências do projeto…">${esc(p.notes || "")}</textarea>
    </div>

    ${accordionSection({ key: "people", open: peopleSectionOpen, title: "Músicos", count: nPeople, body: `
      <ul class="people">
        ${(p.people || []).map((x, i, arr) => `
          <li class="person${expandedPeople.has(x.id) ? "" : " is-collapsed"}" data-person="${x.id}">
            <div class="person__top">
              <button type="button" class="person__toggle" data-person-acc="${x.id}" aria-expanded="${expandedPeople.has(x.id)}" title="Recolher/expandir">${icon("chevron", expandedPeople.has(x.id) ? "" : "rot-right")}</button>
              <input class="person__name" data-rename-person="${x.id}" value="${esc(x.name)}" aria-label="Nome do músico" placeholder="Nome do músico" autocomplete="off">
              <div class="row-actions">
                <button type="button" class="icon-button" data-move-person="up" data-pid="${x.id}" title="Subir" ${i === 0 ? "disabled" : ""}>${icon("up")}</button>
                <button type="button" class="icon-button" data-move-person="down" data-pid="${x.id}" title="Descer" ${i === arr.length - 1 ? "disabled" : ""}>${icon("down")}</button>
                <button type="button" class="icon-button icon-button--danger" data-rm-person="${x.id}" title="Remover dos músicos">${icon("close")}</button>
              </div>
            </div>
            <ul class="person__skills">
              ${(x.skills || []).map((sk, si) => `
                <li class="skill-row">
                  <input class="skill-row__input" data-skill-person="${x.id}" data-skill-i="${si}" value="${esc(sk)}" aria-label="Habilidade" autocomplete="off">
                  <button type="button" class="remove-btn" data-rm-skill="${x.id}" data-skill-i="${si}" title="Remover skill">×</button>
                </li>`).join("")}
              <li class="skill-row skill-row--add">
                <input class="skill-row__input" data-add-skill="${x.id}" placeholder="+ skill (Enter)" aria-label="Adicionar habilidade" autocomplete="off">
                <button type="button" class="add-btn" data-add-skill-btn="${x.id}" title="Adicionar skill">+</button>
              </li>
            </ul>
          </li>`).join("")}
      </ul>
      <div class="add-row">
        <input class="add-row__input" data-add-person placeholder="Nome do músico" aria-label="Nome do novo músico" autocomplete="off">
        <button type="button" class="add-btn" data-add-person-btn title="Adicionar músico">${icon("plus")}</button>
      </div>` })}

    ${accordionSection({ key: "tracks", open: tracksSectionOpen, title: "Faixas", count: nTracks, body: `
      ${nTracks ? `<ol class="track-list">${rows}</ol>` :
        `<div class="empty-state"><h4>Sem faixas</h4><p>Adicione a primeira faixa deste projeto.</p></div>`}
      <div class="add-row add-row--wide"><button type="button" class="btn btn--ghost" data-add-track>+ Adicionar faixa</button></div>` })}`;

  app.querySelector("[data-home]").addEventListener("click", goHome);
  wireSectionToggles();
  const gl = app.querySelector("[data-guest-login]"); if (gl) gl.addEventListener("click", () => openAuthModal("login"));
  app.querySelectorAll("[data-track]").forEach(el => el.addEventListener("click", e => { e.preventDefault(); goTrack(p.id, el.dataset.track); }));
  app.querySelector("[data-add-track]").addEventListener("click", () => openTrackModal(p));

  // reordenar faixas (↑↓) e excluir faixa direto do card — sem abrir a faixa
  app.querySelectorAll("[data-move-track]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const i = p.tracks.findIndex(t => t.id === btn.dataset.tid);
    const j = btn.dataset.moveTrack === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= p.tracks.length) return;
    [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]]; save(); render();
  }));
  app.querySelectorAll("[data-del-track-row]").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const tk = p.tracks.find(t => t.id === btn.dataset.delTrackRow);
    confirmDialog(`Excluir a faixa "${(tk && tk.title) || "sem título"}"?`,
      () => { p.tracks = p.tracks.filter(t => t.id !== btn.dataset.delTrackRow); save(); render(); toast("Faixa removida"); },
      { danger: true, okLabel: "Excluir" });
  }));
  // recolher/expandir músico
  app.querySelectorAll("[data-person-acc]").forEach(btn => btn.addEventListener("click", () => {
    const id = btn.dataset.personAcc;
    if (expandedPeople.has(id)) expandedPeople.delete(id); else expandedPeople.add(id);
    render();
  }));
  // reordenar músicos (↑↓)
  app.querySelectorAll("[data-move-person]").forEach(btn => btn.addEventListener("click", () => {
    const i = (p.people || []).findIndex(x => x.id === btn.dataset.pid);
    const j = btn.dataset.movePerson === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= p.people.length) return;
    [p.people[i], p.people[j]] = [p.people[j], p.people[i]]; save(); render();
  }));

  const projNotes = app.querySelector("[data-proj-notes]");
  if (projNotes) projNotes.addEventListener("change", () => { p.notes = projNotes.value; save(); });

  const addPerson = app.querySelector("[data-add-person]");
  const doAddPerson = () => { if (addPerson.value.trim()) { ensurePerson(p, addPerson.value); save(); render(); } };
  if (addPerson) addPerson.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doAddPerson(); } });
  const addPersonBtn = app.querySelector("[data-add-person-btn]");
  if (addPersonBtn) addPersonBtn.addEventListener("click", doAddPerson);
  app.querySelectorAll("[data-rm-person]").forEach(b => b.addEventListener("click", () => {
    removePerson(p, b.dataset.rmPerson, () => { save(); render(); toast("Removido dos músicos"); });
  }));
  const addSkillTo = (personId, val) => {
    const person = (p.people || []).find(x => x.id === personId); if (!person) return;
    const sk = (val || "").trim(); if (!sk) return;
    person.skills = person.skills || [];
    if (!person.skills.some(s => s.toLowerCase() === sk.toLowerCase())) person.skills.push(sk);
    save(); render();
    setTimeout(() => { const again = app.querySelector(`[data-add-skill="${personId}"]`); if (again) again.focus(); }, 0);
  };
  app.querySelectorAll("[data-add-skill]").forEach(inp => {
    const pid = inp.dataset.addSkill;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addSkillTo(pid, inp.value); } });
    // mesma cortina do resto do app: sugere outras skills do projeto (não as que a pessoa já tem) → criar nova
    attachCortina(inp, {
      owned: () => [],
      others: () => {
        const person = (p.people || []).find(x => x.id === pid);
        const cur = new Set(((person && person.skills) || []).map(s => s.toLowerCase()));
        return allSkills(p).filter(s => !cur.has(s.toLowerCase()));
      },
      onPick: val => addSkillTo(pid, val)
    });
  });
  app.querySelectorAll("[data-add-skill-btn]").forEach(btn => btn.addEventListener("click", () => {
    const pid = btn.dataset.addSkillBtn; const inp = app.querySelector(`[data-add-skill="${pid}"]`);
    addSkillTo(pid, inp ? inp.value : "");
  }));
  app.querySelectorAll("[data-rename-person]").forEach(inp => inp.addEventListener("change", () => {
    const person = (p.people || []).find(x => x.id === inp.dataset.renamePerson); if (!person) return;
    person.name = inp.value.trim() || person.name; inp.value = person.name; save();
  }));
  app.querySelectorAll("[data-skill-person]").forEach(inp => inp.addEventListener("change", () => {
    const person = (p.people || []).find(x => x.id === inp.dataset.skillPerson); if (!person) return;
    const i = +inp.dataset.skillI, v = inp.value.trim();
    if (!v) person.skills.splice(i, 1); else person.skills[i] = v;
    save(); render();
  }));
  app.querySelectorAll("[data-rm-skill]").forEach(b => b.addEventListener("click", () => {
    const person = (p.people || []).find(x => x.id === b.dataset.rmSkill); if (!person) return;
    person.skills.splice(+b.dataset.skillI, 1); save(); render();
  }));
  const coverEl = app.querySelector("[data-cover]");
  if (coverEl) coverEl.addEventListener("click", () => pickImage(512, 0.72, dataURI => setProjectCover(p, dataURI)));
  const coverRm = app.querySelector("[data-cover-rm]");
  if (coverRm) coverRm.addEventListener("click", () => removeProjectCover(p));
  app.querySelector("[data-del-project]").addEventListener("click", () => {
    confirmDialog(`Excluir o projeto "${p.title}" e todas as suas faixas? Não pode ser desfeito.`,
      () => removeProject(p),
      { danger: true, okLabel: "Excluir" });
  });
}

// Short "what's next" hint for a track — sempre a etapa em vigência (nunca "tudo concluído")
function nextAction(p, t) {
  const stages = t.stages || [];
  if (!stages.length) return "sem etapas";
  for (const s of stages) {
    const status = stageStatus(p, t, s);
    if (status !== "done") {
      if (s.mode === "instruments") {
        const rows = stageItems(p, t, s.id);
        const pend = rows.filter(r => r.state !== "done").length;
        if (!rows.length) return `${s.label}: sem instrumentos`;
        if (pend) return `${s.label}: ${pend} instrumento${pend === 1 ? "" : "s"} pendente${pend === 1 ? "" : "s"}`;
        return `${s.label}: pronto para concluir`;
      }
      return `${s.label}: ${STATE_LABEL[status]}`;
    }
  }
  // tudo pronto → mostra a última etapa (a vigente), sem fogos
  return `${stages[stages.length - 1].label}: concluída`;
}

// Situação nominal da faixa: a etapa em que ela está + qualificador (sem número)
function trackSituacao(p, t) {
  const stages = t.stages || [];
  if (!stages.length) return "sem etapas";
  let curIdx = -1;
  for (let i = 0; i < stages.length; i++) {
    if (stageStatus(p, t, stages[i]) !== "done") { curIdx = i; break; }
  }
  if (curIdx === -1) return `${stages[stages.length - 1].label} concluída`;
  const cur = stages[curIdx];
  if (stageStatus(p, t, cur) === "wip") return `${cur.label} em andamento`;
  if (curIdx > 0) return `${stages[curIdx - 1].label} concluída`;
  return "não iniciada";
}
// Estado geral do projeto: agrupa as faixas por situação nominal (maior grupo primeiro)
function projectNominal(p) {
  const map = new Map();
  (p.tracks || []).forEach(t => { const s = trackSituacao(p, t); map.set(s, (map.get(s) || 0) + 1); });
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/* ----- Track detail ----- */
function renderTrack(p, t) {
  const idx = p.tracks.indexOf(t);
  const prev = p.tracks[idx - 1], next = p.tracks[idx + 1];

  app.innerHTML = `
    <nav class="breadcrumb" aria-label="Trilha de navegação">
      <button type="button" class="breadcrumb__link" data-home>Projetos</button>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <button type="button" class="breadcrumb__link" data-proj>${esc(p.title)}</button>
      <span class="breadcrumb__sep" aria-hidden="true">/</span>
      <span class="breadcrumb__current" aria-current="page">${esc(t.title) || "Sem título"}</span>
    </nav>
    <header class="detail-head">
      <div class="field detail-head__title">
        <label for="track-title">Título da faixa</label>
        <input id="track-title" class="track-title-input" value="${esc(t.title)}" data-title placeholder="Título da faixa">
      </div>
      <button type="button" class="btn btn--danger btn--icon" data-del-track title="Excluir faixa">${icon("can")}</button>
    </header>

    ${accordionSection({ key: "track-info", open: trackInfoOpen, title: "Informações gerais", body: renderFicha(p, t) })}

    ${accordionSection({ key: "stages", open: stagesSectionOpen, title: "Etapas de produção", body: `
      <div class="stage-list">${(t.stages || []).length
        ? t.stages.map(s => renderStage(p, t, s)).join("")
        : `<p class="stage-list__empty">Nenhuma etapa ainda. Crie a primeira abaixo.</p>`}</div>
      <div class="add-row add-row--wide">
        <button type="button" class="btn btn--ghost btn--icon" data-add-stage>${icon("plus")} Etapa</button>
      </div>` })}

    <nav class="track-nav" aria-label="Navegação entre faixas">
      <button type="button" class="icon-button" data-track-prev title="Faixa anterior" ${prev ? "" : "disabled"}>${icon("left")}</button>
      <span class="track-nav__pos">${idx + 1} de ${p.tracks.length}</span>
      <button type="button" class="icon-button" data-track-next title="Próxima faixa" ${next ? "" : "disabled"}>${icon("right")}</button>
    </nav>

    <div class="track-foot">
      <button type="button" class="btn btn--ghost btn--icon" data-foot-back>${icon("left")} Voltar</button>
      <button type="button" class="btn btn--ghost btn--icon" data-new-track>${icon("plus")} Nova faixa</button>
    </div>

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

/* ---------- Cortina: dropdown de skills ancorado ao campo ----------
   opts = { owned: () => [str], others: () => [str], onPick: (val) => void }
   Ordem: skills do músico → outras skills do projeto → criar nova. */
function closeCortina() {
  if (cortinaCleanup) { cortinaCleanup(); cortinaCleanup = null; }
  if (cortinaEl) { cortinaEl.remove(); cortinaEl = null; }
}
function flashField(el) {
  if (!el) return;
  el.classList.remove("is-flashing"); void el.offsetWidth; // reinicia a animação
  el.classList.add("is-flashing");
  setTimeout(() => el.classList.remove("is-flashing"), 900);
}
function attachCortina(input, opts) {
  const norm = s => (s || "").trim().toLowerCase();
  const open = () => {
    closeCortina();
    cortinaEl = document.createElement("div");
    cortinaEl.className = "cortina";
    cortinaEl._input = input;
    document.body.appendChild(cortinaEl);

    const position = () => {
      const r = input.getBoundingClientRect();
      cortinaEl.style.left = r.left + "px";
      cortinaEl.style.top = (r.bottom + 4) + "px";
      cortinaEl.style.minWidth = r.width + "px";
    };
    const build = () => {
      const q = norm(input.value);
      const seen = new Set();
      const uniq = arr => (arr || []).filter(s => { const n = norm(s); return s && !seen.has(n) && (seen.add(n), true); });
      const owned = uniq(opts.owned ? opts.owned() : []);
      const others = uniq(opts.others ? opts.others() : []);
      const match = s => !q || norm(s).includes(q);
      const ownedF = owned.filter(match), othersF = others.filter(match);
      const exact = [...owned, ...others].some(s => norm(s) === q);
      const opt = s => `<button type="button" class="cortina__opt" data-val="${esc(s)}">${esc(s)}</button>`;

      const lbl = v => (typeof v === "function" ? v() : v);
      const ownedLabel = lbl(opts.ownedLabel) || "Skills do músico";
      const othersLabel = lbl(opts.othersLabel) || "Outras skills do projeto";
      const typed = input.value.trim();
      let html = "";
      if (ownedF.length) html += `<div class="cortina__group">${esc(ownedLabel)}</div>` + ownedF.map(opt).join("");
      if (othersF.length) html += `<div class="cortina__group">${esc(othersLabel)}</div>` + othersF.map(opt).join("");
      if (q && !exact) {
        const cl = opts.createLabel ? opts.createLabel(typed) : `+ criar “${typed}”`;
        html += `<button type="button" class="cortina__opt cortina__opt--create" data-val="${esc(typed)}">${esc(cl)}</button>`;
      }
      if (!html) html = `<div class="cortina__empty">${esc(opts.emptyText || "Digite para criar…")}</div>`;
      cortinaEl.innerHTML = html;
      cortinaEl.querySelectorAll(".cortina__opt").forEach(btn => btn.addEventListener("mousedown", e => {
        e.preventDefault(); // impede blur antes do clique
        opts.onPick(btn.dataset.val); closeCortina();
      }));
      position();
    };

    const onInput = () => build();
    const onScroll = () => { if (cortinaEl) position(); };
    const onKey = e => { if (e.key === "Escape") { closeCortina(); input.blur(); } };
    const onDocDown = e => { if (cortinaEl && e.target !== input && !cortinaEl.contains(e.target)) closeCortina(); };
    const onBlur = () => setTimeout(() => { if (cortinaEl && cortinaEl._input === input) closeCortina(); }, 120);

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);
    input.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", position);
    document.addEventListener("mousedown", onDocDown);
    cortinaCleanup = () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", position);
      document.removeEventListener("mousedown", onDocDown);
    };
    build();
  };
  input.addEventListener("focus", open);
}

function renderFicha(p, t) {
  const compChips = (t.composers || []).map(id =>
    `<li class="chip">${esc(personName(p, id))}<button type="button" class="chip__remove" data-rm-comp="${id}" title="Remover">×</button></li>`).join("");
  const producerChips = (t.producers || []).map(id =>
    `<li class="chip">${esc(personName(p, id))}<button type="button" class="chip__remove" data-rm-producer="${id}" title="Remover">×</button></li>`).join("");
  return `<div class="ficha">
    <div class="field">
      <label for="add-comp">Compositores</label>
      <ul class="chips">${compChips}</ul>
      <div class="add-row">
        <input id="add-comp" class="add-row__input" data-add-comp list="people-list" placeholder="Nome" autocomplete="off">
        <button type="button" class="add-btn" data-add-comp-btn title="Adicionar compositor">${icon("plus")}</button>
      </div>
    </div>
    <div class="ficha__grid">
      <div class="field"><label for="f-style">Estilo / gênero</label><input id="f-style" data-f="style" value="${esc(t.style)}" placeholder="Ex.: MPB, indie…"></div>
      <div class="field"><label for="f-bpm">BPM</label><input id="f-bpm" data-f="bpm" value="${esc(t.bpm)}" placeholder="—" inputmode="numeric"></div>
      <div class="field"><label for="f-key">Tom</label><input id="f-key" data-f="key" value="${esc(t.key)}" placeholder="Ex.: Am"></div>
      <div class="field"><label for="f-duration">Duração</label><input id="f-duration" data-f="duration" value="${esc(t.duration)}" placeholder="Ex.: 3:42"></div>
    </div>
    <div class="field">
      <label for="add-producer">Produtor fonográfico</label>
      <ul class="chips">${producerChips}</ul>
      <div class="add-row">
        <input id="add-producer" class="add-row__input" data-add-producer list="people-list" placeholder="Nome" autocomplete="off">
        <button type="button" class="add-btn" data-add-producer-btn title="Adicionar produtor fonográfico">${icon("plus")}</button>
      </div>
    </div>
    <div class="field">
      <label for="f-lyrics">Letra/cifra</label>
      <textarea id="f-lyrics" class="lyrics-chord" data-f="lyricsChord" placeholder="Letra e cifra…"${t.lyricsChordHeight ? ` style="height:${Math.round(+t.lyricsChordHeight)}px"` : ""}>${esc(t.lyricsChord || "")}</textarea>
    </div>
    <div class="field">
      <label for="f-notes">Observações</label>
      <textarea id="f-notes" data-f="notes" placeholder="Pendências e decisões da faixa…">${esc(t.notes)}</textarea>
    </div>
  </div>`;
}

// Controles do cabeçalho da etapa: subir / descer / remover
function stageCtrls(t, stage, idx, n) {
  if (stage.id === t.baseStageId) return "";
  return `<div class="row-actions">
    <button type="button" class="icon-button" data-move="up" title="Subir" ${idx <= (t.baseStageId ? 1 : 0) ? "disabled" : ""}>${icon("up")}</button>
    <button type="button" class="icon-button" data-move="down" title="Descer" ${idx === n - 1 ? "disabled" : ""}>${icon("down")}</button>
    <button type="button" class="icon-button icon-button--danger" data-stage-del title="Remover etapa">${icon("close")}</button>
  </div>`;
}

function renderStage(p, t, stage) {
  const st = ensureState(t, stage);
  const status = stageStatus(p, t, stage);
  const idx = t.stages.indexOf(stage);

  if (stage.mode === "holistic") {
    const collapsed = collapsedStages.has(stage.id);
    return `<article class="stage-card stage-card--${status}${collapsed ? " is-collapsed" : ""}" data-stage="${stage.id}">
      <header class="stage-card__head">
        <div class="stage-card__name">
          <button type="button" class="stage-card__toggle" data-accordion aria-expanded="${!collapsed}" title="Recolher/expandir">${icon("chevron", collapsed ? "rot-right" : "")}</button>
          <input class="stage-card__name-input" data-stage-rename value="${esc(stage.label)}" size="${Math.max(2, (stage.label || "").length)}" aria-label="Nome da etapa" placeholder="Nome da etapa" autocomplete="off">
        </div>
        ${stageCtrls(t, stage, idx, t.stages.length)}
      </header>
      <div class="stage-card__body">
        <button type="button" class="stage-state stage-state--${status}" data-cycle title="Alternar estado">${icon(status === "done" ? "check" : status === "wip" ? "pause" : "stop")}<span>${STATE_LABEL[status]}</span></button>
        <textarea class="stage-card__note" data-stage-note aria-label="Nota da etapa ${esc(stage.label)}" placeholder="Nota desta etapa…">${esc(st.note || "")}</textarea>
      </div>
    </article>`;
  }

  // instruments mode
  const rows = stageItems(p, t, stage.id);
  const order = instrStages(t).map(s => s.id);
  const isFirst = order.indexOf(stage.id) === 0;
  const checkedN = rows.filter(r => r.state === "done").length;
  const allDone = rows.length > 0 && checkedN === rows.length;
  const wIcon = workingIcon(stage);

  const body = rows.map(r => {
    const musico = r.inst.personId ? personName(p, r.inst.personId) : "";
    return `<li class="instr-row">
      ${stateBtn(r.state, wIcon, `data-check="${r.inst.id}"`)}
      ${isFirst
        ? `<input class="instr-row__name" data-iname="${r.inst.id}" value="${esc(r.inst.name)}" aria-label="Instrumento" placeholder="Instrumento" autocomplete="off">
           <input class="instr-row__musico" data-imusico="${r.inst.id}" value="${esc(musico)}" aria-label="Músico" placeholder="Músico" autocomplete="off">`
        : `<span class="instr-row__name instr-row__name--readonly">${esc(r.inst.name) || "<span class='faint'>—</span>"}</span>
           <span class="instr-row__musico instr-row__musico--readonly">${esc(musico)}</span>`}
      <input class="instr-row__note" data-inote="${r.inst.id}" value="${esc(r.note)}" aria-label="Nota do instrumento" placeholder="nota (ex.: cortar 200Hz)">
      ${isFirst ? `<button type="button" class="remove-btn" data-idel="${r.inst.id}" title="Remover instrumento">×</button>` : "<span></span>"}
    </li>`;
  }).join("");

  const meter = rows.length
    ? `${checkedN} de ${rows.length} instrumento${rows.length === 1 ? "" : "s"} concluído${checkedN === 1 ? "" : "s"} nesta etapa`
    : "Nenhum instrumento no arranjo ainda.";

  const collapsed = collapsedStages.has(stage.id);

  return `<article class="stage-card stage-card--${status}${collapsed ? " is-collapsed" : ""}" data-stage="${stage.id}">
    <header class="stage-card__head">
      <div class="stage-card__name">
        <button type="button" class="stage-card__toggle" data-accordion aria-expanded="${!collapsed}" title="Recolher/expandir">${icon("chevron", collapsed ? "rot-right" : "")}</button>
        <input class="stage-card__name-input" data-stage-rename value="${esc(stage.label)}" size="${Math.max(2, (stage.label || "").length)}" aria-label="Nome da etapa" placeholder="Nome da etapa" autocomplete="off"></div>
      ${stageCtrls(t, stage, idx, t.stages.length)}
    </header>
    <div class="stage-card__body">
      ${body ? `<ul class="instr-list">${body}</ul>` : `<p class="instr-list__empty">${esc(meter)}</p>`}
      ${isFirst ? `<button type="button" class="btn btn--ghost btn--icon stage-card__add-instr" data-add-instr>${icon("plus")} Instrumento</button>` : ""}
      <p class="stage-card__meter">${rows.length ? esc(meter) : ""}</p>
      <textarea class="stage-card__note" data-stage-note aria-label="Nota geral da etapa ${esc(stage.label)}" placeholder="Nota geral da etapa…">${esc(st.note || "")}</textarea>
      <div class="stage-card__sign">
        <button type="button" class="btn btn--sign btn--icon ${st.signedOff ? "is-done" : (allDone ? "btn--ghost is-ready" : "btn--ghost")}" data-sign>${icon("check")} ${st.signedOff ? "Concluída" : "Concluir"}</button>
      </div>
    </div>
  </article>`;
}

/* ----- Track wiring ----- */
function wireTrack(p, t) {
  const rt = () => renderTrack(p, t);
  app.querySelector("[data-home]").addEventListener("click", goHome);
  app.querySelector("[data-proj]").addEventListener("click", () => goProject(p.id));

  app.querySelector("[data-title]").addEventListener("change", e => { t.title = e.target.value.trim(); save(); });
  wireSectionToggles();
  app.querySelector("[data-foot-back]").addEventListener("click", () => goProject(p.id));

  // ficha fields
  app.querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", () => {
    const k = el.dataset.f;
    t[k] = k === "bpm" ? (el.value.trim() || null) : el.value;
    save();
  }));
  const lyricsChord = app.querySelector(".lyrics-chord");
  if (lyricsChord) lyricsChord.addEventListener("pointerdown", () => {
    const initialHeight = lyricsChord.offsetHeight;
    const rememberHeight = () => {
      const height = Math.round(lyricsChord.offsetHeight);
      if (height !== initialHeight) { t.lyricsChordHeight = Math.max(80, Math.min(2000, height)); save(); }
    };
    window.addEventListener("pointerup", rememberHeight, { once: true });
  });
  // composers
  app.querySelectorAll("[data-rm-comp]").forEach(b => b.addEventListener("click", () => {
    t.composers = (t.composers || []).filter(id => id !== b.dataset.rmComp); save(); rt();
  }));
  const addComp = app.querySelector("[data-add-comp]");
  const doAddComp = () => {
    const id = ensurePerson(p, addComp.value);
    if (id) { t.composers = t.composers || []; if (!t.composers.includes(id)) t.composers.push(id); }
    save(); rt();
  };
  if (addComp) addComp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doAddComp(); } });
  const addCompBtn = app.querySelector("[data-add-comp-btn]");
  if (addCompBtn) addCompBtn.addEventListener("click", doAddComp);

  // produtores fonográficos (vários; nomes novos entram nos músicos do projeto)
  app.querySelectorAll("[data-rm-producer]").forEach(b => b.addEventListener("click", () => {
    t.producers = (t.producers || []).filter(id => id !== b.dataset.rmProducer); save(); rt();
  }));
  const addProducer = app.querySelector("[data-add-producer]");
  const doAddProducer = () => {
    const id = ensurePerson(p, addProducer.value);
    if (id) { t.producers = t.producers || []; if (!t.producers.includes(id)) t.producers.push(id); }
    save(); rt();
  };
  if (addProducer) addProducer.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doAddProducer(); } });
  const addProducerBtn = app.querySelector("[data-add-producer-btn]");
  if (addProducerBtn) addProducerBtn.addEventListener("click", doAddProducer);

  app.querySelector("[data-del-track]").addEventListener("click", () => {
    confirmDialog(`Excluir a faixa "${t.title || "sem título"}"?`,
      () => { p.tracks = p.tracks.filter(x => x.id !== t.id); save(); goProject(p.id); toast("Faixa removida"); },
      { danger: true, okLabel: "Excluir" });
  });

  app.querySelector("[data-add-stage]").addEventListener("click", () => { t.stages.push(suggestNextStage(t)); save(); rt(); });
  app.querySelector("[data-new-track]").addEventListener("click", () => openTrackModal(p));
  const idx = p.tracks.indexOf(t);
  const prevBtn = app.querySelector("[data-track-prev]"), nextBtn = app.querySelector("[data-track-next]");
  if (prevBtn && p.tracks[idx - 1]) prevBtn.addEventListener("click", () => goTrack(p.id, p.tracks[idx - 1].id));
  if (nextBtn && p.tracks[idx + 1]) nextBtn.addEventListener("click", () => goTrack(p.id, p.tracks[idx + 1].id));

  // stages
  app.querySelectorAll(".stage-card").forEach(card => {
    const sid = card.dataset.stage;
    const stage = t.stages.find(s => s.id === sid);
    const st = ensureState(t, stage);

    const acc = card.querySelector("[data-accordion]");
    if (acc) acc.addEventListener("click", () => {
      if (collapsedStages.has(sid)) collapsedStages.delete(sid); else collapsedStages.add(sid);
      rt();
    });

    const cycle = card.querySelector("[data-cycle]");
    if (cycle) cycle.addEventListener("click", () => { st.status = STATE_CYCLE[st.status || "todo"]; save(); rt(); });

    const rename = card.querySelector("[data-stage-rename]");
    if (rename) {
      rename.addEventListener("input", () => { rename.size = Math.max(2, rename.value.length); });
      rename.addEventListener("change", () => {
        const oldLabel = stage.label;
        const newLabel = rename.value.trim() || oldLabel;
        if (newLabel.toLowerCase() !== oldLabel.toLowerCase()) {
          t.rejectedStageLabels = t.rejectedStageLabels || [];
          if (!t.rejectedStageLabels.some(x => x.toLowerCase() === oldLabel.toLowerCase())) t.rejectedStageLabels.push(oldLabel);
        }
        stage.label = newLabel;
        rename.value = stage.label; rename.size = Math.max(2, rename.value.length); save();
      });
    }

    const stageDel = card.querySelector("[data-stage-del]");
    if (stageDel) stageDel.addEventListener("click", () => {
      if (sid === t.baseStageId) return;
      confirmDialog(`Remover a etapa "${stage.label}" desta faixa? O progresso dela será descartado.`, () => {
        t.rejectedStageLabels = t.rejectedStageLabels || [];
        if (!t.rejectedStageLabels.some(x => x.toLowerCase() === stage.label.toLowerCase())) t.rejectedStageLabels.push(stage.label);
        t.stages = t.stages.filter(s => s.id !== sid);
        if (t.stageState) delete t.stageState[sid];
        save(); rt();
      }, { danger: true, okLabel: "Remover" });
    });

    // reordenar etapas com ↑ / ↓ no cabeçalho
    card.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => {
      const i = t.stages.findIndex(s => s.id === sid);
      const j = btn.dataset.move === "up" ? i - 1 : i + 1;
      if (sid === t.baseStageId || i < 0 || j < 0 || j >= t.stages.length || (t.baseStageId && j === 0)) return;
      [t.stages[i], t.stages[j]] = [t.stages[j], t.stages[i]];
      save(); rt();
    }));

    card.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.check; st.items = st.items || {};
      const it = st.items[id] = st.items[id] || {};
      const cur = it.state || (it.check ? "done" : "todo");
      it.state = STATE_CYCLE[cur]; delete it.check; // migra pro tri-estado
      save(); rt();
    }));
    card.querySelectorAll("[data-inote]").forEach(inp => inp.addEventListener("change", () => {
      const id = inp.dataset.inote; st.items = st.items || {}; st.items[id] = st.items[id] || {};
      st.items[id].note = inp.value; save();
    }));
    card.querySelectorAll("[data-iname]").forEach(inp => {
      inp.addEventListener("change", () => {
        const inst = t.instruments.find(i => i.id === inp.dataset.iname);
        if (inst) inst.name = inp.value.trim();
        save();
      });
      // cortina: skills do músico atribuído → outras skills do projeto → criar nova
      attachCortina(inp, {
        owned: () => {
          const inst = t.instruments.find(i => i.id === inp.dataset.iname);
          const per = inst && inst.personId ? p.people.find(x => x.id === inst.personId) : null;
          return per ? (per.skills || []) : [];
        },
        others: () => allSkills(p),
        onPick: val => {
          const inst = t.instruments.find(i => i.id === inp.dataset.iname);
          let who = "";
          if (inst) {
            inst.name = val;
            if (inst.personId) { const per = p.people.find(x => x.id === inst.personId); who = per ? per.name : ""; }
          }
          save(); rt();
          if (inst) flashField(app.querySelector(`[data-iname="${inst.id}"]`));
          toast(who ? `“${val}” · ${who}` : `Instrumento: “${val}”`);
        }
      });
    });
    card.querySelectorAll("[data-imusico]").forEach(inp => {
      inp.addEventListener("change", () => {
        const inst = t.instruments.find(i => i.id === inp.dataset.imusico);
        if (inst) inst.personId = ensurePerson(p, inp.value);
        save(); rt();
      });
      // cortina: músicos que já tocam esse instrumento → outros músicos → criar novo
      const instOf = () => t.instruments.find(i => i.id === inp.dataset.imusico);
      attachCortina(inp, {
        owned: () => {
          const inst = instOf(); const nm = inst ? (inst.name || "").toLowerCase() : "";
          if (!nm) return [];
          return (p.people || []).filter(per => (per.skills || []).some(s => s.toLowerCase() === nm)).map(per => per.name);
        },
        others: () => (p.people || []).map(per => per.name),
        ownedLabel: () => { const inst = instOf(); return `Já tocam “${inst && inst.name ? inst.name : "esse instrumento"}”`; },
        othersLabel: "Outros músicos",
        createLabel: v => `+ criar músico “${v}”`,
        emptyText: "Digite para criar um músico…",
        onPick: val => {
          const inst = instOf();
          if (inst) inst.personId = ensurePerson(p, val);
          save(); rt();
          if (inst) flashField(app.querySelector(`[data-imusico="${inst.id}"]`));
          toast(inst && inst.name ? `${val} · ${inst.name}` : `Músico: ${val}`);
        }
      });
    });
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
      if (st.signedOff) { st.signedOff = false; save(); rt(); return; }
      const rows = stageItems(p, t, sid);
      const allDone = rows.length > 0 && rows.every(r => r.state === "done");
      const done = () => { st.signedOff = true; save(); rt(); };
      if (allDone) done();
      else confirmDialog("Ainda há instrumento(s) não concluído(s) nesta etapa. Concluir mesmo assim?", done, { okLabel: "Concluir" });
    });
    const note = card.querySelector("[data-stage-note]");
    if (note) note.addEventListener("change", () => { st.note = note.value; save(); });
  });
}

/* ---------- Modals ---------- */
function modal(html) {
  const b = document.createElement("div"); b.className = "modal-backdrop"; b.innerHTML = `<div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
  document.body.appendChild(b);
  const close = () => b.remove();
  b.addEventListener("click", e => { if (e.target === b) close(); });
  return { b, close };
}

// Confirmação própria (substitui o confirm() nativo). Chama onConfirm() no "sim".
function confirmDialog(message, onConfirm, opts = {}) {
  const { b, close } = modal(`
    <h3>${esc(opts.title || "Confirmar")}</h3>
    <p class="modal__message">${esc(message)}</p>
    <div class="modal__actions">
      <button class="btn btn--ghost" data-cancel>Cancelar</button>
      <button type="button" class="btn ${opts.danger ? "btn--danger-solid" : "btn--primary"}" data-ok>${esc(opts.okLabel || "Confirmar")}</button>
    </div>`);
  b.querySelector("[data-cancel]").addEventListener("click", close);
  const ok = b.querySelector("[data-ok]");
  ok.addEventListener("click", () => { close(); onConfirm(); });
  ok.focus();
}

function openNewProjectModal() {
  if ((db.projects || []).length >= MAX_PROJECTS) return;
  const { b, close } = modal(`
    <h3>Novo projeto fonográfico</h3>
    <div class="field"><label for="np-title">Título do projeto</label><input id="np-title" placeholder="Ex.: Meu novo álbum" autocomplete="off"></div>
    <div class="field"><label for="np-artist">Artista</label><input id="np-artist" placeholder="Ex.: Nome do artista" autocomplete="off"></div>
    <p class="modal__hint">Tipo definido pelo nº de faixas: 1–3 Single · 4–6 EP · 7+ Álbum. Músicos, faixas e etapas você monta depois, na tela do projeto.</p>
    <div class="modal__actions"><button class="btn btn--ghost" data-cancel>Cancelar</button><button class="btn btn--primary" data-ok>Criar projeto</button></div>`);
  const title = b.querySelector("#np-title"); title.focus();
  b.querySelector("[data-cancel]").addEventListener("click", close);

  const create = () => {
    const tt = title.value.trim(); if (!tt) return title.focus();
    const p = { id: uid(tt), title: tt, artist: b.querySelector("#np-artist").value.trim(),
      createdAt: new Date().toISOString().slice(0, 10), targetDate: null,
      cover: null, notes: "", people: [], tracks: [] };
    db.projects.push(p); save(); close(); goProject(p.id); toast("Projeto criado");
  };
  b.querySelector("[data-ok]").addEventListener("click", create);
  title.addEventListener("keydown", e => { if (e.key === "Enter") create(); });
  b.querySelector("#np-artist").addEventListener("keydown", e => { if (e.key === "Enter") create(); });
}

function openTrackModal(p) {
  const { b, close } = modal(`
    <h3>Nova faixa</h3>
    <div class="field"><label for="tk-title">Título</label><input id="tk-title" placeholder="Título da faixa" autocomplete="off"></div>
    <div class="modal__actions"><button class="btn btn--ghost" data-cancel>Cancelar</button><button class="btn btn--primary" data-ok>Criar faixa</button></div>`);
  const title = b.querySelector("#tk-title"); title.focus();
  b.querySelector("[data-cancel]").addEventListener("click", close);
  const create = () => {
    const tt = title.value.trim(); if (!tt) return title.focus();
    const track = { id: uid(tt), title: tt,
      composers: [], style: "",
      bpm: null, key: "", duration: "", lyricsChord: "", lyricsChordHeight: null, notes: "", producers: [], instruments: [],
      baseStageId: "gravacao", stages: [{ id: "gravacao", label: "Gravação", mode: "instruments" }],
      rejectedStageLabels: [], stageState: { gravacao: { signedOff: false, note: "", items: {} } } };
    p.tracks.push(track); save(); close(); goTrack(p.id, track.id); toast("Faixa criada");
  };
  b.querySelector("[data-ok]").addEventListener("click", create);
  title.addEventListener("keydown", e => { if (e.key === "Enter") create(); });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("is-visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

/* ---------- Autenticação (4 estados) ---------- */
const DISC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="42" height="42"><path d="M480-316q70 0 120-47.5T650-480q0-71-49.5-120.5T480-650q-69 0-116.5 50T316-480q0 69 47.5 116.5T480-316Zm0-104q-25 0-42.5-17.5T420-480q0-25 17.5-42.5T480-540q25 0 42.5 17.5T540-480q0 25-17.5 42.5T480-420Zm0 340q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>`;
let pendingLocal = null, pendingCloud = null;

// Preenche a topbar: convidado (Entrar) · logado (nome + sync + Sair) · não-sinc (nome + chip + Sair)
function updateChrome() {
  const slot = document.getElementById("authslot");
  const sess = api.session();
  if (api.isLoggedIn() && sess && isSynced()) {
    slot.innerHTML = `<span class="account__name">${esc(sess.name || sess.username)}</span><span class="account__sync" id="sync"></span><button class="btn btn--ghost" data-act="logout">Sair</button>`;
  } else if (api.isLoggedIn() && sess) {
    slot.innerHTML = `<span class="account__name">${esc(sess.name || sess.username)}</span><span class="account__sync" id="sync"></span><span class="account__badge">não sincronizado</span><button class="btn btn--ghost" data-act="logout">Sair</button>`;
  } else {
    slot.innerHTML = `<button class="btn btn--ghost" data-act="login">Entrar</button>`;
  }
  slot.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "logout") doLogout();
    else if (a === "login") openAuthModal("login");
    else if (a === "signup") openAuthModal("signup");
  }));
}

function enterAppShell() { updateChrome(); route = restoredRoute(); history.replaceState(route, ""); rememberRoute(); render(); }
function enterGuest() {
  db = readLocalDb();
  if (migrate()) localStorage.setItem(LS_KEY, JSON.stringify(db));
  enterAppShell();
}
function adoptCloud(data) {
  db = ensureDb(data); const migrated = migrate(); setOwner(); localStorage.setItem(LS_KEY, JSON.stringify(db));
  hasUnsavedChanges = migrated;
  enterAppShell(); setSync("saved");
  loadCloudCovers(db);
  if (migrated) api.save(db).then(() => { hasUnsavedChanges = false; }).catch(e => { setSync("error"); toast("Falha ao migrar dados: " + e.message); });
}
function adoptGuestLoggedIn(local) {
  db = ensureDb(local); migrate(); clearOwner(); localStorage.setItem(LS_KEY, JSON.stringify(db));
  enterAppShell();
}
async function enterApp() {
  app.innerHTML = `<div class="context-box"><p class="context-box__loading">Carregando…</p></div>`;
  try { adoptCloud(await api.load()); }
  catch (e) {
    if (!api.isLoggedIn()) { clearOwner(); toast(e.message || "Sessão expirada"); return boot(); }
    app.innerHTML = `<div class="context-box"><div class="context-box__text"><b>Não foi possível carregar seus projetos</b><p>${esc(e.message || "Erro no servidor.")}</p></div><div class="context-box__actions"><button class="btn btn--primary" data-retry-load>Tentar novamente</button><button class="btn btn--ghost" data-load-logout>Sair</button></div></div>`;
    app.querySelector("[data-retry-load]").addEventListener("click", enterApp);
    app.querySelector("[data-load-logout]").addEventListener("click", doLogout);
  }
}
let loggingOut = false;
async function doLogout() {
  if (loggingOut) return;
  const wasSynced = isSynced();
  if (wasSynced && hasUnsavedChanges) {
    loggingOut = true;
    clearTimeout(saveTimer);
    setSync("saving");
    try { await api.save(db); hasUnsavedChanges = false; }
    catch (e) {
      loggingOut = false;
      setSync("error");
      toast("Não foi possível salvar antes de sair: " + e.message);
      return;
    }
  }
  api.logout(); clearOwner();
  coverCache.clear();
  coverLoadFailed.clear();
  if (wasSynced) { localStorage.removeItem(LS_KEY); db = { version: 2, projects: [] }; }
  loggingOut = false;
  boot();
}

// Box de contexto no topo da home (antes do .list-head), conforme o estado
function contextBox() {
  const sess = api.session();
  if (api.isLoggedIn() && sess && isSynced()) return "";
  if (api.isLoggedIn() && sess) {
    return `<div class="context-box">
      <div class="context-box__text"><b>Projeto encontrado neste dispositivo</b><p>Ele ainda não está na sua conta. Salve para acessá-lo de outros dispositivos.</p></div>
      <div class="context-box__actions"><button class="btn btn--ghost" data-ctx="discard">Descartar</button><button class="btn btn--primary" data-ctx="save">Salvar na minha conta</button></div>
    </div>`;
  }
  if ((db.projects || []).length) {
    return `<div class="context-box">
      <div class="context-box__text"><b>Modo local</b><p>Seus projetos ficam salvos só neste dispositivo. Crie uma conta para guardá-los na nuvem e acessar de qualquer lugar. <button class="link-btn" data-ctx="info">Entenda como funciona</button>.</p></div>
      <div class="context-box__actions"><button class="btn btn--ghost" data-ctx="login">Entrar</button></div>
    </div>`;
  }
  return `<div class="context-box context-box--welcome">
    <div class="context-box__text"><b>Bem-vindo</b><p>Organize a produção dos seus projetos musicais — faixas, pessoas, instrumentos e etapas de produção. Comece agora sem cadastro (salvo só neste dispositivo) ou crie uma conta para guardá-los na nuvem e acessar de qualquer lugar. <button class="link-btn" data-ctx="info">Entenda como funciona</button>.</p></div>
    <div class="context-box__actions"><button class="btn btn--primary" data-ctx="new">Criar projeto</button><button class="btn btn--ghost" data-ctx="login">Entrar</button></div>
  </div>`;
}
function wireContextBox() {
  app.querySelectorAll("[data-ctx]").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.ctx;
    if (a === "new") openNewProjectModal();
    else if (a === "login") openAuthModal("login");
    else if (a === "signup") openAuthModal("signup");
    else if (a === "info") openStorageInfo();
    else if (a === "save") saveLocalToAccount();
    else if (a === "discard") discardLocalProjects();
  }));
}
function discardLocalProjects() {
  confirmDialog("Descartar os projetos deste dispositivo? As alterações locais que ainda não foram salvas na sua conta serão perdidas.", () => {
    api.load().then(data => {
      pendingLocal = null; pendingCloud = null;
      adoptCloud(data);
      toast("Projetos locais descartados");
    }).catch(e => toast(e.message));
  }, { danger: true, okLabel: "Descartar" });
}
function saveLocalToAccount() {
  pendingLocal = readLocalDb();
  const run = () => syncLocalToAccount();
  if (pendingCloud) run();
  else api.load().then(c => { pendingCloud = ensureDb(c); run(); }).catch(e => toast(e.message));
}
function openStorageInfo() {
  const { b, close } = modal(`
    <h3>Como funciona o armazenamento?</h3>
    <p class="modal__message">Sem conta, seus projetos ficam salvos <b>só neste navegador</b> (armazenamento local). Não se perdem ao recarregar, mas ficam presos a este dispositivo.</p>
    <p class="modal__message">Com uma conta, eles são <b>salvos na nuvem</b> automaticamente — você acessa de qualquer lugar e não corre risco de perder se limpar o navegador.</p>
    <div class="modal__actions"><button class="btn btn--primary" data-ok>Entendi</button></div>`);
  b.querySelector("[data-ok]").addEventListener("click", close);
}

/* ----- Login / criar conta (modal) ----- */
function openAuthModal(mode) {
  const isLogin = mode !== "signup";
  const ph = isLogin ? { user: "", pass: "" } : {
    name: "Seu nome",
    user: "Não precisa ser email",
    pass: "Lembre-se da sua senha, não poderemos reenviá-la",
    coupon: "Se não tem cupom, solicite ao desenvolvedor.",
  };
  const { b, close } = modal(`
    <div class="auth">
    <div class="auth__logo">${DISC_SVG}</div>
    <h3 class="auth__title">${isLogin ? "Entrar" : "Criar conta"}</h3>
    ${isLogin ? "" : `<div class="field"><label for="au-name">Nome</label><input id="au-name" autocomplete="name" placeholder="${ph.name}"></div>`}
    <div class="field"><label for="au-user">Usuário</label><input id="au-user" autocomplete="username" placeholder="${ph.user}"></div>
    <div class="field"><label for="au-pass">Senha</label><input id="au-pass" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="${ph.pass}"></div>
    ${isLogin ? "" : `<div class="field"><label for="au-coupon">Cupom</label><input id="au-coupon" autocomplete="off" placeholder="${ph.coupon}"></div>`}
    <div class="auth__message" id="au-msg"></div>
    <div class="modal__actions"><button type="button" class="btn btn--ghost" data-cancel>Cancelar</button><button type="button" class="btn btn--primary" id="au-go">${isLogin ? "Entrar" : "Criar conta"}</button></div>
    <div class="auth__alt">${isLogin ? `Não tem conta? <button type="button" class="link-btn" data-swap="signup">Criar conta</button>` : `Já tem conta? <button type="button" class="link-btn" data-swap="login">Entrar</button>`}</div>
    </div>`);
  const msg = t => { b.querySelector("#au-msg").textContent = t || ""; };
  const go = b.querySelector("#au-go");
  const submit = () => {
    const user = b.querySelector("#au-user").value.trim();
    const pass = b.querySelector("#au-pass").value;
    if (!user || !pass) return msg("Preencha usuário e senha.");
    go.disabled = true; msg(isLogin ? "Entrando…" : "Criando conta…");
    const p = isLogin ? api.login(user, pass)
      : api.createAccount(b.querySelector("#au-name").value.trim(), user, pass, b.querySelector("#au-coupon").value.trim());
    p.then(r => { close(); onAuthed(r.data); }).catch(e => { go.disabled = false; msg(e.message); });
  };
  go.addEventListener("click", submit);
  b.querySelector("[data-cancel]").addEventListener("click", close);
  b.querySelector("[data-swap]").addEventListener("click", () => { close(); openAuthModal(b.querySelector("[data-swap]").dataset.swap); });
  b.querySelectorAll("input").forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter") submit(); }));
  const first = b.querySelector("input"); if (first) first.focus();
}
function onAuthed(cloudData) {
  const sess = api.session();
  const local = readLocalDb();
  const hasGuest = (local.projects || []).length > 0 && localStorage.getItem(LS_OWNER) !== (sess || {}).username;
  if (hasGuest) { pendingCloud = ensureDb(cloudData); adoptGuestLoggedIn(local); } // box oferece "Salvar na minha conta"
  else adoptCloud(cloudData);
}

/* ----- Reconciliação por slug ----- */
function conflictDialog(title, onNew, onDiscard) {
  const { b, close } = modal(`
    <h3>Já existe "${esc(title)}" na sua conta</h3>
    <p class="modal__message">Um projeto com esse nome já está na sua conta. O que fazer com o deste dispositivo?</p>
    <div class="modal__actions"><button class="btn btn--ghost" data-discard>Descartar o local</button><button class="btn btn--primary" data-new>Salvar como novo</button></div>`);
  b.querySelector("[data-new]").addEventListener("click", () => { close(); onNew(); });
  b.querySelector("[data-discard]").addEventListener("click", () => { close(); onDiscard(); });
}
function projectLimitDialog(title, onDiscard, onCancel) {
  const { b, close } = modal(`
    <h3>Limite de ${MAX_PROJECTS} projetos</h3>
    <p class="modal__message">Não há espaço na conta para salvar "${esc(title)}". Descarte este projeto local para continuar ou cancele a sincronização.</p>
    <div class="modal__actions"><button class="btn btn--ghost" data-cancel-sync>Cancelar sincronização</button><button class="btn btn--danger" data-discard>Descartar o local</button></div>`);
  b.querySelector("[data-discard]").addEventListener("click", () => { close(); onDiscard(); });
  b.querySelector("[data-cancel-sync]").addEventListener("click", () => { close(); onCancel(); });
}
async function uploadEmbeddedCovers(targetDb, uploadedIds) {
  for (const project of (targetDb.projects || [])) {
    if (typeof project.cover !== "string" || !project.cover.startsWith("data:image/")) continue;
    const dataURI = project.cover;
    const image = dataUriParts(dataURI);
    const fileId = await api.uploadCover(image.imageBase64, image.mimeType);
    uploadedIds.push(fileId);
    coverCache.set(fileId, dataURI);
    project.cover = { fileId };
  }
}
function syncLocalToAccount() {
  const localDb = pendingLocal || readLocalDb();
  const merged = ensureDb(JSON.parse(JSON.stringify(pendingCloud || { version: 2, projects: [] })));
  const locals = JSON.parse(JSON.stringify(localDb.projects || []));
  const slugs = new Set(merged.projects.map(p => slugify(p.title)));
  const finish = async () => {
    const uploadedIds = [];
    try {
      setSync("saving");
      await uploadEmbeddedCovers(merged, uploadedIds);
      db = merged; clearOwner(); localStorage.setItem(LS_KEY, JSON.stringify(db));
      hasUnsavedChanges = true;
      enterAppShell(); setSync("saving");
      await api.save(db);
      hasUnsavedChanges = false;
      setOwner(); pendingLocal = null; pendingCloud = null;
      updateChrome(); render(); setSync("saved");
      toast("Projeto salvo na sua conta");
    } catch (e) {
      uploadedIds.forEach(id => { coverCache.delete(id); api.deleteCover(id).catch(() => {}); });
      db = ensureDb(JSON.parse(JSON.stringify(localDb)));
      clearOwner(); localStorage.setItem(LS_KEY, JSON.stringify(db));
      updateChrome(); render(); setSync("error");
      toast("Falha ao salvar: " + e.message);
    }
  };
  const step = i => {
    if (i >= locals.length) return finish();
    const lp = locals[i];
    if (merged.projects.length >= MAX_PROJECTS) {
      return projectLimitDialog(lp.title,
        () => step(i + 1),
        () => toast("Sincronização cancelada"));
    }
    if (slugs.has(slugify(lp.title))) {
      conflictDialog(lp.title,
        () => { lp.id = uid(lp.title); merged.projects.push(lp); slugs.add(slugify(lp.title)); step(i + 1); },
        () => step(i + 1));
    } else { merged.projects.push(lp); slugs.add(slugify(lp.title)); step(i + 1); }
  };
  step(0);
}

// Banner sintético dentro de um projeto quando deslogado
function guestBanner() {
  if (api.isLoggedIn()) return "";
  return `<div class="guest-banner" role="note">Você está deslogado. Entre para acessar este projeto em outros dispositivos. <button type="button" class="link-btn" data-guest-login>Entrar</button></div>`;
}

/* ---------- Boot ---------- */
function boot() {
  const local = readLocalDb();
  const hasLocal = (local.projects || []).length > 0;
  const sess = api.session();
  if (api.isLoggedIn() && sess) {
    if (localStorage.getItem(LS_OWNER) === sess.username) return enterApp(); // sincronizado → nuvem
    if (hasLocal) return adoptGuestLoggedIn(local);                          // logado com local não sinc.
    return enterApp();                                                       // sem local → nuvem
  }
  enterGuest();                                                             // convidado (com ou sem projeto) → app + box
}
document.getElementById("brand").addEventListener("click", e => { e.preventDefault(); goHome(); });
boot();
