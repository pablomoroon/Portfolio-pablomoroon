// ---- Utilidades ----

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'proyecto-' + Date.now();
}

function showStatus(el, msg, ok) {
  el.textContent = msg;
  el.classList.remove('ok', 'err');
  el.classList.add('show', ok ? 'ok' : 'err');
}

// ---- Estado de conexión ----

const config = {
  owner: '', repo: '', branch: 'main', token: ''
};

function ghHeaders() {
  return {
    'Authorization': `Bearer ${config.token}`,
    'Accept': 'application/vnd.github+json'
  };
}

function apiUrl(path) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
}

async function ghGetFile(path) {
  const res = await fetch(`${apiUrl(path)}?ref=${encodeURIComponent(config.branch)}`, {
    headers: ghHeaders()
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API (GET ${path}): ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json;
}

async function ghPutFile(path, base64Content, message, sha) {
  const body = {
    message,
    content: base64Content,
    branch: config.branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub API (PUT ${path}): ${res.status} ${await res.text()}`);
  return res.json();
}

// ---- Carga inicial de credenciales guardadas ----

function loadSavedConfig() {
  const saved = localStorage.getItem('portfolioAdminConfig');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      document.getElementById('owner').value = parsed.owner || '';
      document.getElementById('repo').value = parsed.repo || '';
      document.getElementById('branch').value = parsed.branch || 'main';
      document.getElementById('remember').checked = true;
    } catch (e) {}
  }
  const savedToken = localStorage.getItem('portfolioAdminToken') || sessionStorage.getItem('portfolioAdminToken');
  if (savedToken) document.getElementById('token').value = savedToken;
}
loadSavedConfig();

// ---- Cargar y listar proyectos existentes ----

let currentData = { propios: [], uni: [] };
let currentSha = null;

async function connectAndLoad() {
  const statusEl = document.getElementById('connectStatus');
  config.owner = document.getElementById('owner').value.trim();
  config.repo = document.getElementById('repo').value.trim();
  config.branch = document.getElementById('branch').value.trim() || 'main';
  config.token = document.getElementById('token').value.trim();

  if (!config.owner || !config.repo || !config.token) {
    showStatus(statusEl, 'Rellena usuario, repositorio y token.', false);
    return;
  }

  const remember = document.getElementById('remember').checked;
  if (remember) {
    localStorage.setItem('portfolioAdminConfig', JSON.stringify({
      owner: config.owner, repo: config.repo, branch: config.branch
    }));
    localStorage.setItem('portfolioAdminToken', config.token);
    sessionStorage.removeItem('portfolioAdminToken');
  } else {
    sessionStorage.setItem('portfolioAdminToken', config.token);
    localStorage.removeItem('portfolioAdminConfig');
    localStorage.removeItem('portfolioAdminToken');
  }

  try {
    const file = await ghGetFile('data.json');
    if (!file) {
      currentData = { propios: [], uni: [] };
      currentSha = null;
    } else {
      currentData = JSON.parse(b64DecodeUnicode(file.content));
      currentSha = file.sha;
    }
    await loadBankConfig();
    showStatus(statusEl, '✓ Conectado. Proyectos y bancos de preguntas cargados correctamente.', true);
    document.getElementById('existingSection').style.display = 'block';
    document.getElementById('newSection').style.display = 'block';
    document.getElementById('quizSection').style.display = 'block';
    document.getElementById('bankFormSection').style.display = 'block';
    renderExistingLists();
    renderBankList();
  } catch (err) {
    showStatus(statusEl, 'Error al conectar: ' + err.message, false);
  }
}

function renderExistingLists() {
  const listPropios = document.getElementById('listPropios');
  const listUni = document.getElementById('listUni');
  listPropios.innerHTML = '';
  listUni.innerHTML = '';

  (currentData.propios || []).forEach((p, idx) => {
    listPropios.appendChild(buildExistingItem(p, 'propios', idx));
  });
  (currentData.uni || []).forEach((p, idx) => {
    listUni.appendChild(buildExistingItem(p, 'uni', idx));
  });

  if (!currentData.propios || !currentData.propios.length) {
    listPropios.innerHTML = '<div style="color:var(--muted); font-size:13px;">Sin proyectos.</div>';
  }
  if (!currentData.uni || !currentData.uni.length) {
    listUni.innerHTML = '<div style="color:var(--muted); font-size:13px;">Sin proyectos.</div>';
  }
}

function buildExistingItem(p, section, idx) {
  const row = document.createElement('div');
  row.className = 'existing-item';
  const span = document.createElement('span');
  span.textContent = p.title;
  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = 'Eliminar';
  del.addEventListener('click', () => deleteProject(section, idx));
  row.appendChild(span);
  row.appendChild(del);
  return row;
}

async function deleteProject(section, idx) {
  if (!confirm('¿Eliminar este proyecto del portfolio?')) return;
  currentData[section].splice(idx, 1);
  await saveData(`Eliminar proyecto de ${section}`);
  renderExistingLists();
}

async function saveData(message) {
  const content = b64EncodeUnicode(JSON.stringify(currentData, null, 2));
  const result = await ghPutFile('data.json', content, message, currentSha);
  currentSha = result.content.sha;
}

// ---- Subida de imagen ----

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---- Publicar nuevo proyecto ----

async function publishProject() {
  const statusEl = document.getElementById('publishStatus');
  const section = document.getElementById('section').value;
  const title = document.getElementById('title').value.trim();
  const desc = document.getElementById('desc').value.trim();
  const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const imageFile = document.getElementById('imageFile').files[0];

  const links = [];
  const l1label = document.getElementById('link1label').value.trim();
  const l1url = document.getElementById('link1url').value.trim();
  const l2label = document.getElementById('link2label').value.trim();
  const l2url = document.getElementById('link2url').value.trim();
  if (l1url) links.push({ label: l1label || 'Enlace', url: l1url, primary: true });
  if (l2url) links.push({ label: l2label || 'Enlace', url: l2url, primary: false });

  if (!title || !desc) {
    showStatus(statusEl, 'Título y descripción son obligatorios.', false);
    return;
  }
  if (!config.token) {
    showStatus(statusEl, 'Conéctate primero en el paso 1.', false);
    return;
  }

  const id = slugify(title);
  let imagePath = '';

  try {
    showStatus(statusEl, 'Publicando…', true);

    if (imageFile) {
      const ext = imageFile.name.split('.').pop();
      imagePath = `imagenes/${id}.${ext}`;
      const b64 = await readFileAsBase64(imageFile);
      await ghPutFile(imagePath, b64, `Subir imagen para ${title}`);
    }

    const newProject = { id, title, desc, image: imagePath, tags, links };
    if (!currentData[section]) currentData[section] = [];
    currentData[section].push(newProject);

    await saveData(`Añadir proyecto: ${title}`);

    showStatus(statusEl, '✓ Proyecto publicado. Puede tardar un minuto en verse online (GitHub Pages).', true);
    renderExistingLists();

    // limpiar formulario
    document.getElementById('title').value = '';
    document.getElementById('desc').value = '';
    document.getElementById('tags').value = '';
    document.getElementById('imageFile').value = '';
    document.getElementById('link1label').value = '';
    document.getElementById('link1url').value = '';
    document.getElementById('link2label').value = '';
    document.getElementById('link2url').value = '';
  } catch (err) {
    showStatus(statusEl, 'Error al publicar: ' + err.message, false);
  }
}

document.getElementById('connectBtn').addEventListener('click', connectAndLoad);
document.getElementById('publishBtn').addEventListener('click', publishProject);


// ---- Administración de bancos tipo test ----

const DEFAULT_BANK_CONFIG = {
  version: 1,
  subjects: [
    { id:'PMBOK', label:'PMBOK 8 · Difícil', group:'PMBOK 8 / PMP', meta:'90 preguntas · nivel alto', icon:'◆', file:'preguntas_PMBOOK8_S1_S2_S3_dificil.json', mode:'single', difficulty:'hard', accent:'cyan' },
    { id:'PMP_HARD', label:'PMP HARD · 80/20', group:'PMBOK 8 / PMP', meta:'100 preguntas · 80% situacionales', icon:'⚡', file:'preguntas_PMP_HARD_S1_S2_S3_80_20.json', mode:'single', difficulty:'hard', accent:'warning' },
    { id:'CIMSI', label:'CIMSI', group:'Otros bancos', meta:'Estudio general', icon:'◈', file:'preguntas_estudioCIMSI.json', mode:'single', difficulty:'normal' },
    { id:'CIMSI_HARD', label:'CIMSI · Difícil', group:'Otros bancos', meta:'Simulación exigente', icon:'▲', file:'preguntas_examenCIMSI.json', mode:'single', difficulty:'hard' },
    { id:'PD', label:'PD', group:'Otros bancos', meta:'Banco de estudio', icon:'▣', file:'preguntas_estudioPD.json', mode:'single', difficulty:'normal' },
    { id:'PD_HARD', label:'PD · Muy difícil', group:'Otros bancos', meta:'Banco avanzado', icon:'◇', file:'preguntas_estudioPD_dificil.json', mode:'single', difficulty:'hard' },
    { id:'SIE', label:'SIE', group:'Otros bancos', meta:'Selección múltiple', icon:'≡', file:'preguntas_estudioSIE.json', mode:'multi', difficulty:'normal' },
    { id:'SIE_2', label:'SIE · 2', group:'Otros bancos', meta:'Segundo banco', icon:'Ⅱ', file:'preguntas_estudioSIE_2.json', mode:'multi', difficulty:'normal' }
  ]
};

let bankConfig = { version: 1, subjects: [] };
let bankConfigSha = null;
let editingBankId = null;

function makeBankId(text) {
  return (text || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || ('BANCO_' + Date.now());
}

function bankFileName(id) {
  return `preguntas_${String(id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'')}.json`;
}

async function loadBankConfig() {
  const file = await ghGetFile('Preguntas_CIMSI/bancos.json');
  if (!file) {
    bankConfig = JSON.parse(JSON.stringify(DEFAULT_BANK_CONFIG));
    bankConfigSha = null;
    return;
  }
  try {
    const parsed = JSON.parse(b64DecodeUnicode(file.content));
    bankConfig = Array.isArray(parsed) ? { version: 1, subjects: parsed } : parsed;
    if (!Array.isArray(bankConfig.subjects)) bankConfig.subjects = [];
    bankConfigSha = file.sha;
  } catch (e) {
    bankConfig = JSON.parse(JSON.stringify(DEFAULT_BANK_CONFIG));
    bankConfigSha = file.sha;
  }
}

async function saveBankConfig(message) {
  const content = b64EncodeUnicode(JSON.stringify(bankConfig, null, 2));
  const result = await ghPutFile('Preguntas_CIMSI/bancos.json', content, message, bankConfigSha);
  bankConfigSha = result.content.sha;
}

function renderBankList() {
  const list = document.getElementById('bankList');
  if (!list) return;
  list.innerHTML = '';
  const subjects = bankConfig.subjects || [];
  if (!subjects.length) {
    list.innerHTML = '<div style="color:var(--muted); font-size:13px;">Todavía no hay asignaturas.</div>';
    return;
  }

  subjects.forEach(bank => {
    const row = document.createElement('div');
    row.className = 'existing-item bank-item';

    const copy = document.createElement('div');
    copy.className = 'bank-copy';
    const title = document.createElement('strong');
    title.textContent = `${bank.icon || '●'} ${bank.label || bank.id}`;
    const meta = document.createElement('small');
    meta.textContent = `${bank.group || 'Asignaturas'} · ${bank.mode === 'multi' ? 'múltiple' : 'una respuesta'} · ${bank.file || 'sin JSON'}`;
    copy.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'existing-actions';
    const edit = document.createElement('button');
    edit.className = 'edit';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => beginEditBank(bank.id));
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = 'Quitar';
    del.addEventListener('click', () => removeBank(bank.id));
    actions.append(edit, del);

    row.append(copy, actions);
    list.appendChild(row);
  });
}

function resetBankForm() {
  editingBankId = null;
  document.getElementById('bankFormTitle').textContent = '5 · Añadir una asignatura';
  document.getElementById('publishBankBtn').textContent = 'Añadir asignatura';
  document.getElementById('cancelBankEditBtn').style.display = 'none';
  document.getElementById('bankLabel').value = '';
  document.getElementById('bankId').value = '';
  document.getElementById('bankId').disabled = false;
  document.getElementById('bankGroup').value = 'Otros bancos';
  document.getElementById('bankMeta').value = '';
  document.getElementById('bankIcon').value = '●';
  document.getElementById('bankMode').value = 'single';
  document.getElementById('bankDifficulty').value = 'normal';
  document.getElementById('bankJsonFile').value = '';
  document.getElementById('bankFileNote').textContent = 'Al crear una asignatura nueva, selecciona su JSON. Al editar, solo hace falta elegir otro archivo si quieres sustituirlo.';
}

function beginEditBank(id) {
  const bank = (bankConfig.subjects || []).find(b => b.id === id);
  if (!bank) return;
  editingBankId = id;
  document.getElementById('bankFormTitle').textContent = `5 · Editar ${bank.label}`;
  document.getElementById('publishBankBtn').textContent = 'Guardar cambios';
  document.getElementById('cancelBankEditBtn').style.display = 'inline-flex';
  document.getElementById('bankLabel').value = bank.label || '';
  document.getElementById('bankId').value = bank.id || '';
  document.getElementById('bankId').disabled = true;
  document.getElementById('bankGroup').value = bank.group || 'Otros bancos';
  document.getElementById('bankMeta').value = bank.meta || '';
  document.getElementById('bankIcon').value = bank.icon || '●';
  document.getElementById('bankMode').value = bank.mode || 'single';
  document.getElementById('bankDifficulty').value = bank.difficulty || 'normal';
  document.getElementById('bankJsonFile').value = '';
  document.getElementById('bankFileNote').textContent = `JSON actual: ${bank.file}. Déjalo vacío si no quieres sustituir las preguntas.`;
  document.getElementById('bankFormSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeBank(id) {
  const bank = (bankConfig.subjects || []).find(b => b.id === id);
  if (!bank || !confirm(`¿Quitar "${bank.label}" de la página de tests?\n\nEl JSON no se borrará del repositorio, por seguridad.`)) return;
  bankConfig.subjects = bankConfig.subjects.filter(b => b.id !== id);
  try {
    await saveBankConfig(`Quitar banco de preguntas: ${bank.label}`);
    renderBankList();
    if (editingBankId === id) resetBankForm();
  } catch (err) {
    alert('No se pudo actualizar bancos.json: ' + err.message);
  }
}

function validateQuestionJson(text, mode) {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  const arr = Array.isArray(parsed) ? parsed : parsed.preguntas;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('El JSON no contiene preguntas.');
  arr.forEach((q, idx) => {
    if (!q || typeof q.enunciado !== 'string' || !Array.isArray(q.opciones) || q.opciones.length < 2) {
      throw new Error(`La pregunta ${idx + 1} no tiene enunciado/opciones válidos.`);
    }
    if (mode === 'multi') {
      if (!Array.isArray(q.correctas) && !Number.isInteger(q.correcta)) throw new Error(`La pregunta ${idx + 1} no define correcta/correctas.`);
    } else if (!Number.isInteger(q.correcta)) {
      throw new Error(`La pregunta ${idx + 1} no tiene el campo "correcta".`);
    }
  });
  return arr.length;
}

async function publishBank() {
  const statusEl = document.getElementById('bankStatus');
  const label = document.getElementById('bankLabel').value.trim();
  const rawId = document.getElementById('bankId').value.trim();
  const id = editingBankId || makeBankId(rawId || label);
  const group = document.getElementById('bankGroup').value.trim() || 'Otros bancos';
  const meta = document.getElementById('bankMeta').value.trim() || 'Banco de preguntas';
  const icon = document.getElementById('bankIcon').value.trim() || '●';
  const mode = document.getElementById('bankMode').value;
  const difficulty = document.getElementById('bankDifficulty').value;
  const jsonFile = document.getElementById('bankJsonFile').files[0];

  if (!label) return showStatus(statusEl, 'Pon un nombre visible a la asignatura.', false);
  if (!config.token) return showStatus(statusEl, 'Conéctate primero a GitHub.', false);
  if (!editingBankId && (bankConfig.subjects || []).some(b => b.id === id)) {
    return showStatus(statusEl, `Ya existe un banco con el identificador ${id}.`, false);
  }

  const existing = editingBankId ? bankConfig.subjects.find(b => b.id === editingBankId) : null;
  if (!existing && !jsonFile) return showStatus(statusEl, 'Selecciona el JSON de preguntas para crear la asignatura.', false);

  try {
    showStatus(statusEl, 'Publicando banco…', true);
    let fileName = existing?.file || bankFileName(id);
    let questionCount = null;

    if (jsonFile) {
      const text = await jsonFile.text();
      questionCount = validateQuestionJson(text, mode);
      if (!existing) fileName = bankFileName(id);
      const path = `Preguntas_CIMSI/${fileName}`;
      const current = await ghGetFile(path);
      await ghPutFile(path, b64EncodeUnicode(text.replace(/^\uFEFF/, '')), `${existing ? 'Actualizar' : 'Añadir'} preguntas: ${label}`, current?.sha);
    }

    const next = {
      id,
      label,
      group,
      meta: questionCount ? `${meta}${/preguntas/i.test(meta) ? '' : ` · ${questionCount} preguntas`}` : meta,
      icon,
      file: fileName,
      mode,
      difficulty,
      accent: existing?.accent || (difficulty === 'hard' ? 'warning' : '')
    };

    if (existing) {
      const idx = bankConfig.subjects.findIndex(b => b.id === editingBankId);
      bankConfig.subjects[idx] = next;
    } else {
      bankConfig.subjects.push(next);
    }

    await saveBankConfig(`${existing ? 'Editar' : 'Añadir'} banco de preguntas: ${label}`);
    showStatus(statusEl, `✓ ${existing ? 'Cambios guardados' : 'Asignatura añadida'}. GitHub Pages puede tardar alrededor de un minuto en actualizarse.`, true);
    renderBankList();
    resetBankForm();
  } catch (err) {
    showStatus(statusEl, 'Error: ' + err.message, false);
  }
}

document.getElementById('publishBankBtn')?.addEventListener('click', publishBank);
document.getElementById('cancelBankEditBtn')?.addEventListener('click', resetBankForm);
