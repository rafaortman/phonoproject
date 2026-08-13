/*** PhonoProject — backend (Google Apps Script Web App) ***
 * Contas em uma planilha (aba "Accounts").
 * JSON de cada conta e capas ficam como arquivos no Google Drive.
 * Token de sessão é assinado (HMAC), sem tabela de sessões.
 *
 * Propriedades do script necessárias: COUPON, SECRET, MAX_ACCOUNTS.
 * (DATA_FOLDER_ID e COVERS_FOLDER_ID são criadas sozinhas.)
 * Rode setup() uma vez para autorizar e criar as pastas.
 ***/

const SHEET_NAME = 'Accounts';
const TOKEN_DAYS = 30;
const HASH_ITER  = 2000;

function props_() { return PropertiesService.getScriptProperties(); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Entradas HTTP ---------- */
function doGet(e) {           // usado só pra ping / teste de CORS
  return json_({ ok: true, pong: true, time: new Date().toISOString() });
}
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'ping':          return json_({ ok: true, pong: true });
      case 'createAccount': return createAccount_(body);
      case 'login':         return login_(body);
      case 'load':          return withAuth_(body, load_);
      case 'save':          return withAuth_(body, save_);
      case 'uploadCover':   return withAuth_(body, uploadCover_);
      case 'deleteCover':   return withAuth_(body, deleteCover_);
      default:              return json_({ ok: false, error: 'ação desconhecida' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- Setup (rode uma vez) ---------- */
function setup() {
  dataFolder_(); coversFolder_();
  Logger.log('DATA_FOLDER_ID=' + props_().getProperty('DATA_FOLDER_ID'));
  Logger.log('COVERS_FOLDER_ID=' + props_().getProperty('COVERS_FOLDER_ID'));
  Logger.log('OK — pastas criadas e autorizado.');
}

/* ---------- Planilha ---------- */
function sheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME); }
function accounts_() {
  const rows = sheet_().getDataRange().getValues().slice(1);
  return rows.map((r, i) => ({ row: i + 2, id: r[0], username: r[1], name: r[2], passwordHash: r[3], salt: r[4], createdAt: r[5] }))
             .filter(a => a.username);
}
function findAccount_(username) {
  username = String(username || '').trim().toLowerCase();
  return accounts_().find(a => String(a.username).toLowerCase() === username) || null;
}

/* ---------- Cripto / token ---------- */
function bytesToHex_(bytes) {
  return bytes.map(function (b) { b = (b < 0) ? b + 256 : b; return ('0' + b.toString(16)).slice(-2); }).join('');
}
function hashPassword_(password, salt) {
  let h = String(salt) + '|' + String(password);
  for (let i = 0; i < HASH_ITER; i++) {
    h = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h));
  }
  return h;
}
function sign_(payload) {
  const secret = props_().getProperty('SECRET');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret)).replace(/=+$/, '');
}
function makeToken_(accountId) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * TOKEN_DAYS;
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ aid: accountId, exp: exp })).replace(/=+$/, '');
  return payload + '.' + sign_(payload);
}
function verifyToken_(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  if (sign_(parts[0]) !== parts[1]) return null;
  let obj;
  try { obj = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (e) { return null; }
  if (!obj.exp || Date.now() > obj.exp) return null;
  return obj.aid;
}
function withAuth_(body, fn) {
  const aid = verifyToken_(body.token);
  if (!aid) return json_({ ok: false, auth: false, error: 'sessão inválida ou expirada' });
  return fn(body, aid);
}

/* ---------- Drive (JSON e capas) ---------- */
function folderByProp_(propKey, name) {
  const p = props_();
  const id = p.getProperty(propKey);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(name);
  p.setProperty(propKey, f.getId());
  return f;
}
function dataFolder_()   { return folderByProp_('DATA_FOLDER_ID', 'PhonoProject Data'); }
function coversFolder_() { return folderByProp_('COVERS_FOLDER_ID', 'PhonoProject Covers'); }

function dataFileName_(accountId) { return accountId + '.json'; }
function readData_(accountId) {
  const it = dataFolder_().getFilesByName(dataFileName_(accountId));
  if (!it.hasNext()) return { version: 2, projects: [] };
  try { return JSON.parse(it.next().getBlob().getDataAsString()); }
  catch (e) { return { version: 2, projects: [] }; }
}
function writeData_(accountId, obj) {
  const folder = dataFolder_();
  const name = dataFileName_(accountId);
  const content = JSON.stringify(obj);
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(content);
  else folder.createFile(name, content, 'application/json');
}

/* ---------- Ações ---------- */
function createAccount_(body) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const p = props_();
    if (String(body.coupon || '').trim() !== p.getProperty('COUPON')) return json_({ ok: false, error: 'cupom inválido' });
    const max = parseInt(p.getProperty('MAX_ACCOUNTS') || '10', 10);
    if (accounts_().length >= max) return json_({ ok: false, error: 'limite de contas atingido' });
    const username = String(body.username || '').trim();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!username || !password) return json_({ ok: false, error: 'usuário e senha são obrigatórios' });
    if (findAccount_(username)) return json_({ ok: false, error: 'esse usuário já existe' });
    const id = Utilities.getUuid();
    const salt = Utilities.getUuid();
    sheet_().appendRow([id, username, name, hashPassword_(password, salt), salt, new Date().toISOString().slice(0, 10)]);
    const data = { version: 2, projects: [] };
    writeData_(id, data);
    return json_({ ok: true, token: makeToken_(id), name: name, username: username, data: data });
  } finally { lock.releaseLock(); }
}
function login_(body) {
  const acc = findAccount_(body.username);
  const bad = json_({ ok: false, error: 'usuário ou senha inválidos' });
  if (!acc) return bad;
  if (hashPassword_(String(body.password || ''), acc.salt) !== acc.passwordHash) return bad;
  return json_({ ok: true, token: makeToken_(acc.id), name: acc.name, username: acc.username, data: readData_(acc.id) });
}
function load_(body, aid) { return json_({ ok: true, data: readData_(aid) }); }
function save_(body, aid) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    if (!body.data || typeof body.data !== 'object') return json_({ ok: false, error: 'dados inválidos' });
    writeData_(aid, body.data);
    return json_({ ok: true });
  } finally { lock.releaseLock(); }
}
function uploadCover_(body, aid) {
  const b64 = String(body.imageBase64 || '');
  if (!b64) return json_({ ok: false, error: 'imagem vazia' });
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > 100 * 1024) return json_({ ok: false, error: 'imagem acima de 100 KB' });
  const blob = Utilities.newBlob(bytes, String(body.mimeType || 'image/jpeg'), aid + '-' + Date.now());
  const file = coversFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return json_({ ok: true, fileId: file.getId() });
}
function deleteCover_(body, aid) {
  try { DriveApp.getFileById(String(body.fileId)).setTrashed(true); } catch (e) {}
  return json_({ ok: true });
}
