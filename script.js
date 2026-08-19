// Botón hamburguesa
const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');

menuBtn.addEventListener('click', () => {
  menu.classList.toggle('open');
  menuBtn.textContent = menu.classList.contains('open') ? "✖" : "≡";
});

document.getElementById('year').textContent = new Date().getFullYear();

// Renderizado de tarjetas a partir de data.json
function renderCard(p) {
  const article = document.createElement('article');
  article.className = 'card';

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.setAttribute('aria-hidden', 'true');
  if (p.image) {
    thumb.style.backgroundImage = `url('${p.image}')`;
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  const h3 = document.createElement('h3');
  h3.textContent = p.title || '';

  const desc = document.createElement('p');
  desc.textContent = p.desc || '';

  body.appendChild(h3);
  body.appendChild(desc);

  if (Array.isArray(p.tags) && p.tags.length) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'tags';
    p.tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagsWrap.appendChild(span);
    });
    body.appendChild(tagsWrap);
  }

  article.appendChild(thumb);
  article.appendChild(body);

  if (Array.isArray(p.links) && p.links.length) {
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    p.links.forEach(l => {
      const a = document.createElement('a');
      a.className = 'btn' + (l.primary ? ' primary' : '');
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = l.label || 'Enlace';
      actions.appendChild(a);
    });
    article.appendChild(actions);
  }

  return article;
}

async function loadProjects() {
  const gridPropios = document.getElementById('grid-propios');
  const gridUni = document.getElementById('grid-uni');
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    const data = await res.json();

    (data.propios || []).forEach(p => gridPropios.appendChild(renderCard(p)));
    (data.uni || []).forEach(p => gridUni.appendChild(renderCard(p)));
  } catch (err) {
    console.error('No se pudieron cargar los proyectos:', err);
  }
}

loadProjects();
