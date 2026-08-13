/* ==========================================================================
   API — comunicação com o backend (Google Apps Script Web App).
   Persistência online por conta; token de sessão em localStorage.
   POST com Content-Type text/plain (requisição "simples", sem preflight CORS).
   ========================================================================== */

const API_URL = "https://script.google.com/macros/s/AKfycbwKKi4bniYndv3cyfEt59JoUKXu9iSlHrwxucWJezanqPUbEs2rsck0gIm-ewWhUhzh/exec";
const TOKEN_KEY = "fono-token";
const SESSION_KEY = "fono-session"; // { name, username }

async function apiCall(action, extra) {
  const body = Object.assign({ action, token: localStorage.getItem(TOKEN_KEY) || "" }, extra || {});
  let res;
  try {
    res = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    throw new Error("Sem conexão com o servidor.");
  }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error("Resposta inválida do servidor."); }
  if (!json.ok) {
    if (json.auth === false) api.clearSession();
    throw new Error(json.error || "Erro no servidor.");
  }
  return json;
}

const api = {
  isLoggedIn() { return !!localStorage.getItem(TOKEN_KEY); },
  session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; } },
  setSession(token, name, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name, username }));
  },
  clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY); },
  logout() { api.clearSession(); },

  async ping() { return apiCall("ping"); },

  async login(username, password) {
    const r = await apiCall("login", { username, password });
    api.setSession(r.token, r.name, r.username);
    return r; // { data, name, username }
  },
  async createAccount(name, username, password, coupon) {
    const r = await apiCall("createAccount", { name, username, password, coupon });
    api.setSession(r.token, r.name, r.username);
    return r;
  },

  async load() { return (await apiCall("load")).data; },
  async save(data) { return apiCall("save", { data }); },

  async uploadCover(imageBase64, mimeType) { return (await apiCall("uploadCover", { imageBase64, mimeType })).fileId; },
  async deleteCover(fileId) { return apiCall("deleteCover", { fileId }); },

  // URL de exibição da capa a partir do fileId (thumbnail do Drive, redimensionável)
  coverUrl(fileId) { return fileId ? ("https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400") : null; },
};
