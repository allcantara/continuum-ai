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
    app.replaceChildren(alertBox('Page not found.', 'warning'));
  } catch (error) {
    app.replaceChildren(alertBox(error.message, 'danger'));
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
    return el('a', {
      className: 'list-group-item list-group-item-action py-3',
      href: `#/projects/${encodeURIComponent(project.hash)}`,
    },
      el('div', { className: 'd-flex justify-content-between align-items-start gap-3' },
        el('div', {},
          el('div', { className: 'fw-semibold' }, label),
          el('div', { className: 'small text-body-secondary' }, `${project.type} · ${project.hash}`),
        ),
        el('span', { className: 'badge text-bg-secondary rounded-pill' }, `${project.sessionCount} session(s)`),
      ),
    );
  });
  app.replaceChildren(
    pageHeader('Projects', 'Markdown files are the source of truth. The SQLite index is derived.'),
    items.length
      ? el('div', { className: 'list-group' }, ...items)
      : emptyState('No saved projects yet.'),
  );
}

async function renderProject(hash) {
  var projects = await api('/api/projects');
  var project = projects.projects.find((item) => item.hash === hash);
  var sessions = await api(`/api/projects/${encodeURIComponent(hash)}/sessions`);
  var title = project ? (project.slug || project.hash) : hash;
  var items = sessions.sessions.map((session) =>
    el('a', {
      className: 'list-group-item list-group-item-action py-3',
      href: `#/projects/${encodeURIComponent(hash)}/sessions/${encodeURIComponent(session.sessionId)}`,
    },
      el('div', { className: 'd-flex justify-content-between align-items-start gap-3' },
        el('div', {},
          el('div', { className: 'fw-semibold' }, session.sessionId),
          el('div', { className: 'small text-body-secondary' }, session.summary),
        ),
        el('span', { className: 'small text-body-secondary text-nowrap' }, session.createdAt),
      ),
    ),
  );
  app.replaceChildren(
    breadcrumb([{ href: '#/', label: 'Projects' }, { label: title }]),
    el('div', { className: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-4' },
      el('div', {},
        el('h1', { className: 'h3 mb-1' }, title),
        el('p', { className: 'text-body-secondary mb-0' }, `${project ? project.type : 'project'} · ${hash}`),
      ),
      button('Move project to trash', 'btn btn-outline-danger btn-sm', async () => {
        if (!confirm('Move this entire project to trash?')) {
          return;
        }
        await api(`/api/projects/${encodeURIComponent(hash)}/stash`, { method: 'POST' });
        location.hash = '#/trash';
      }),
    ),
    items.length
      ? el('div', { className: 'list-group' }, ...items)
      : emptyState('No sessions in this project.'),
  );
}

async function renderSession(hash, sessionId) {
  var session = await api(`/api/projects/${encodeURIComponent(hash)}/sessions/${encodeURIComponent(sessionId)}`);
  var body = el('pre', { className: 'session-body bg-body-tertiary border rounded p-3 mb-3' });
  body.textContent = session.content;
  var statusClass = session.status === 'trashed' ? 'text-bg-warning' : 'text-bg-success';
  var actions = [];
  if (session.status === 'active') {
    actions.push(
      button('Move to trash', 'btn btn-outline-danger btn-sm', async () => {
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
    breadcrumb([
      { href: '#/', label: 'Projects' },
      { href: `#/projects/${encodeURIComponent(hash)}`, label: session.scopeSlug || hash },
      { label: session.sessionId },
    ]),
    el('div', { className: 'd-flex flex-wrap justify-content-between align-items-start gap-3 mb-3' },
      el('div', {},
        el('h1', { className: 'h3 mb-2' }, session.sessionId),
        el('p', { className: 'text-body-secondary mb-2' }, session.summary),
        el('div', { className: 'd-flex flex-wrap gap-2' },
          el('span', { className: `badge ${statusClass}` }, session.status),
          el('span', { className: 'badge text-bg-secondary' }, session.createdAt),
        ),
      ),
      el('div', {}, ...actions),
    ),
    body,
    el('div', { className: 'alert alert-info mb-0' },
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
      el('div', { className: 'list-group-item d-flex justify-content-between align-items-start gap-3' },
        el('div', {},
          el('div', { className: 'fw-semibold' }, item.sessionId),
          el('div', { className: 'small text-body-secondary' }, item.summary),
        ),
        button('Restore session', 'btn btn-outline-primary btn-sm', async () => {
          await api('/api/restore', {
            method: 'POST',
            body: JSON.stringify({ scopeHash: item.scopeHash, sessionId: item.sessionId }),
          });
          await renderTrash();
        }),
      ),
    );
    sections.push(
      el('div', { className: 'card mb-3' },
        el('div', { className: 'card-header d-flex justify-content-between align-items-center gap-3' },
          el('span', { className: 'fw-semibold' }, group.slug || scopeHash),
          button('Restore project', 'btn btn-primary btn-sm', async () => {
            await api('/api/restore', {
              method: 'POST',
              body: JSON.stringify({ scopeHash, project: true }),
            });
            location.hash = `#/projects/${encodeURIComponent(scopeHash)}`;
          }),
        ),
        el('div', { className: 'list-group list-group-flush' }, ...rows),
      ),
    );
  });

  app.replaceChildren(
    pageHeader('Trash', 'Stash moves files to .trash/. Restore puts them back. Nothing is deleted permanently in v1.'),
    sections.length ? el('div', {}, ...sections) : emptyState('Trash is empty.'),
  );
}

async function renderIndex() {
  var data = await api('/api/index');
  var rows = data.entries.map((entry) =>
    el('tr', {},
      cell(entry.id),
      cell(entry.scopeSlug || entry.scopeHash),
      cell(entry.scopeType),
      el('td', {}, el('span', {
        className: entry.status === 'trashed' ? 'badge text-bg-warning' : 'badge text-bg-success',
      }, entry.status)),
      cell(entry.summary),
      cell(entry.createdAt),
    ),
  );
  var table = el('div', { className: 'table-responsive' },
    el('table', { className: 'table table-hover table-sm align-middle' },
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
    ),
  );
  app.replaceChildren(
    pageHeader('SQLite index', 'Read-only view of index.sqlite. Rows are rebuilt from markdown files; editing them here is not available.'),
    data.entries.length ? table : emptyState('Index is empty.'),
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

function pageHeader(title, lead) {
  return el('div', { className: 'mb-4' },
    el('h1', { className: 'h3 mb-2' }, title),
    el('p', { className: 'text-body-secondary mb-0' }, lead),
  );
}

function breadcrumb(items) {
  var crumbs = items.map((item, index) => {
    var isLast = index === items.length - 1;
    if (item.href && !isLast) {
      return el('li', { className: 'breadcrumb-item' }, el('a', { href: item.href }, item.label));
    }
    return el('li', { className: 'breadcrumb-item active' }, item.label);
  });
  return el('nav', { className: 'mb-3' }, el('ol', { className: 'breadcrumb mb-0' }, ...crumbs));
}

function emptyState(message) {
  return el('div', { className: 'text-body-secondary border rounded-3 p-4 text-center' }, message);
}

function alertBox(message, variant) {
  return el('div', { className: `alert alert-${variant}` }, message);
}

function button(label, className, onClick) {
  var node = el('button', { className, type: 'button' }, label);
  node.addEventListener('click', () => {
    onClick().catch((error) => {
      app.prepend(alertBox(error.message, 'danger'));
    });
  });
  return node;
}

function cell(value, tag) {
  return el(tag || 'td', {}, value);
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
