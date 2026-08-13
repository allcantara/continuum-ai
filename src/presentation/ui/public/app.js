const app = document.getElementById('app');

window.addEventListener('hashchange', render);
render();

async function render() {
  var route = parseRoute(location.hash.slice(1) || '/');
  try {
    if (route.name === 'home') {
      await renderHome();
      return;
    }
    if (route.name === 'project') {
      await renderProject(route.hash);
      return;
    }
    if (route.name === 'session') {
      await renderSession(route.hash, route.sessionId);
      return;
    }
    if (route.name === 'trash') {
      await renderTrash();
      return;
    }
    if (route.name === 'index') {
      await renderIndex();
      return;
    }
    app.replaceChildren(el('p', { className: 'error' }, 'Page not found.'));
  } catch (error) {
    app.replaceChildren(el('p', { className: 'error' }, error.message));
  }
}

function parseRoute(path) {
  if (path === '/' || path === '') {
    return { name: 'home' };
  }
  if (path === '/trash') {
    return { name: 'trash' };
  }
  if (path === '/index') {
    return { name: 'index' };
  }
  var session = /^\/projects\/([^/]+)\/sessions\/([^/]+)$/.exec(path);
  if (session) {
    return { name: 'session', hash: decodeURIComponent(session[1]), sessionId: decodeURIComponent(session[2]) };
  }
  var project = /^\/projects\/([^/]+)$/.exec(path);
  if (project) {
    return { name: 'project', hash: decodeURIComponent(project[1]) };
  }
  return { name: 'unknown' };
}

async function renderHome() {
  var data = await api('/api/projects');
  var items = data.projects.map((project) => {
    var label = project.slug || project.hash;
    return el('li', {},
      el('a', { href: `#/projects/${encodeURIComponent(project.hash)}` },
        el('div', { className: 'row' },
          el('strong', {}, label),
          el('span', { className: 'muted' }, `${project.sessionCount} session(s)`),
        ),
        el('div', { className: 'muted' }, `${project.type} · ${project.hash}`),
      ),
    );
  });
  app.replaceChildren(
    el('h1', {}, 'Projects'),
    el('p', { className: 'muted' }, 'Markdown files are the source of truth. The SQLite index is derived.'),
    items.length ? el('ul', { className: 'list' }, ...items) : el('p', { className: 'muted' }, 'No saved projects yet.'),
  );
}

async function renderProject(hash) {
  var projects = await api('/api/projects');
  var project = projects.projects.find((item) => item.hash === hash);
  var sessions = await api(`/api/projects/${encodeURIComponent(hash)}/sessions`);
  var title = project ? (project.slug || project.hash) : hash;
  var items = sessions.sessions.map((session) =>
    el('li', {},
      el('a', { href: `#/projects/${encodeURIComponent(hash)}/sessions/${encodeURIComponent(session.sessionId)}` },
        el('div', { className: 'row' },
          el('strong', {}, session.sessionId),
          el('span', { className: 'muted' }, session.createdAt),
        ),
        el('div', { className: 'muted' }, session.summary),
      ),
    ),
  );
  app.replaceChildren(
    el('p', { className: 'crumb' }, el('a', { href: '#/' }, 'Projects'), text(` / ${title}`)),
    el('h1', {}, title),
    el('p', { className: 'muted' }, `${project ? project.type : 'project'} · ${hash}`),
    el('div', { className: 'actions' },
      button('Move project to trash', 'danger', async () => {
        if (!confirm('Move this entire project to trash?')) {
          return;
        }
        await api(`/api/projects/${encodeURIComponent(hash)}/stash`, { method: 'POST' });
        location.hash = '#/trash';
      }),
    ),
    items.length ? el('ul', { className: 'list' }, ...items) : el('p', { className: 'muted' }, 'No sessions in this project.'),
  );
}

async function renderSession(hash, sessionId) {
  var session = await api(`/api/projects/${encodeURIComponent(hash)}/sessions/${encodeURIComponent(sessionId)}`);
  var body = el('pre', {});
  body.textContent = session.content;
  var actions = [];
  if (session.status === 'active') {
    actions.push(
      button('Move to trash', 'danger', async () => {
        if (!confirm('Move this session to trash?')) {
          return;
        }
        await api(
          `/api/projects/${encodeURIComponent(hash)}/sessions/${encodeURIComponent(sessionId)}/stash`,
          { method: 'POST' },
        );
        location.hash = `#/projects/${encodeURIComponent(hash)}`;
      }),
    );
  }
  app.replaceChildren(
    el('p', { className: 'crumb' },
      el('a', { href: '#/' }, 'Projects'),
      text(' / '),
      el('a', { href: `#/projects/${encodeURIComponent(hash)}` }, session.scopeSlug || hash),
      text(` / ${session.sessionId}`),
    ),
    el('h1', {}, session.sessionId),
    el('p', { className: 'muted' }, `${session.summary} · ${session.status} · ${session.createdAt}`),
    el('div', { className: 'actions' }, ...actions),
    body,
    el('p', { className: 'note' },
      'This file is read-only in v1. Editing a session (overwrite the file, or save as a new snapshot) is planned for v2.',
    ),
  );
}

async function renderTrash() {
  var data = await api('/api/trash');
  var byScope = new Map();
  data.items.forEach((item) => {
    var group = byScope.get(item.scopeHash) || { slug: item.scopeSlug, items: [] };
    group.items.push(item);
    byScope.set(item.scopeHash, group);
  });

  var sections = [];
  byScope.forEach((group, scopeHash) => {
    var rows = group.items.map((item) =>
      el('li', { className: 'card' },
        el('div', { className: 'row' },
          el('strong', {}, item.sessionId),
          button('Restore session', '', async () => {
            await api('/api/restore', {
              method: 'POST',
              body: JSON.stringify({ scopeHash: item.scopeHash, sessionId: item.sessionId }),
            });
            await renderTrash();
          }),
        ),
        el('div', { className: 'muted' }, item.summary),
      ),
    );
    sections.push(
      el('section', {},
        el('div', { className: 'row' },
          el('strong', {}, group.slug || scopeHash),
          button('Restore project', '', async () => {
            await api('/api/restore', {
              method: 'POST',
              body: JSON.stringify({ scopeHash, project: true }),
            });
            location.hash = `#/projects/${encodeURIComponent(scopeHash)}`;
          }),
        ),
        el('ul', { className: 'list' }, ...rows),
      ),
    );
  });

  app.replaceChildren(
    el('h1', {}, 'Trash'),
    el('p', { className: 'muted' }, 'Stash moves files to .trash/. Restore puts them back. Nothing is deleted permanently in v1.'),
    sections.length ? el('div', {}, ...sections) : el('p', { className: 'muted' }, 'Trash is empty.'),
  );
}

async function renderIndex() {
  var data = await api('/api/index');
  var rows = data.entries.map((entry) =>
    el('tr', {},
      cell(entry.id),
      cell(entry.scopeSlug || entry.scopeHash),
      cell(entry.scopeType),
      cell(entry.status),
      cell(entry.summary),
      cell(entry.createdAt),
    ),
  );
  var table = el('table', {},
    el('thead', {},
      el('tr', {},
        cell('id', 'th'),
        cell('scope', 'th'),
        cell('type', 'th'),
        cell('status', 'th'),
        cell('summary', 'th'),
        cell('created_at', 'th'),
      ),
    ),
    el('tbody', {}, ...rows),
  );
  app.replaceChildren(
    el('h1', {}, 'SQLite index'),
    el('p', { className: 'muted' },
      'Read-only view of index.sqlite. Rows are rebuilt from markdown files; editing them here is not available.',
    ),
    data.entries.length ? table : el('p', { className: 'muted' }, 'Index is empty.'),
  );
}

async function api(path, options) {
  var response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  var data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function button(label, className, onClick) {
  var node = el('button', { className, type: 'button' }, label);
  node.addEventListener('click', () => {
    onClick().catch((error) => {
      app.prepend(el('p', { className: 'error' }, error.message));
    });
  });
  return node;
}

function cell(value, tag) {
  return el(tag || 'td', {}, value);
}

function text(value) {
  return document.createTextNode(value);
}

function el(tag, attrs, ...children) {
  var node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value) {
      node[key] = value;
    }
  });
  children.forEach((child) => {
    if (typeof child === 'string') {
      node.appendChild(document.createTextNode(child));
      return;
    }
    node.appendChild(child);
  });
  return node;
}
