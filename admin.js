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
    showStatus(statusEl, '✓ Conectado. Proyectos cargados correctamente.', true);
    document.getElementById('existingSection').style.display = 'block';
    document.getElementById('newSection').style.display = 'block';
    renderExistingLists();
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
