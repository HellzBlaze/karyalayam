const STORAGE_KEY = 'office-desk-data-v1';

const state = {
  notes: [],
  calls: [],
  projects: [],
  tasks: [],
  search: '',
  priorityFilter: 'all',
  activeView: 'notes',
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
  } catch (e) {
    console.error('Failed to load data', e);
  }
}

function saveState() {
  const toSave = {
    notes: state.notes,
    calls: state.calls,
    projects: state.projects,
    tasks: state.tasks,
    activeView: state.activeView,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

let currentRecorder = null;
let currentRecorderStream = null;
let currentRecorderChunks = [];

function uid() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function init() {
  loadState();
  initTheme();
  wireNav();
  wireToolbar();
  wireFilters();
  wireModal();
  renderAll();
}

function initTheme() {
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  if (prefersLight) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  const btn = document.getElementById('toggle-theme');
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    if (next === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  });
}

function wireCallRecordingControls(form) {
  const startBtn = form.querySelector('#call-record-start');
  const stopBtn = form.querySelector('#call-record-stop');
  const statusEl = form.querySelector('#call-record-status');
  const audioEl = form.querySelector('#call-record-audio');

  if (!startBtn || !stopBtn || !statusEl || !audioEl) return;

  // Reset any existing state in the UI
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = '';
  audioEl.classList.add('hidden');
  audioEl.removeAttribute('src');

  const cleanupRecorder = () => {
    if (currentRecorderStream) {
      currentRecorderStream.getTracks().forEach((t) => t.stop());
    }
    currentRecorder = null;
    currentRecorderStream = null;
    currentRecorderChunks = [];
  };

  startBtn.onclick = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentRecorderStream = stream;
      currentRecorderChunks = [];
      const recorder = new MediaRecorder(stream);
      currentRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          currentRecorderChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(currentRecorderChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        audioEl.src = url;
        audioEl.classList.remove('hidden');
        statusEl.textContent = 'Recording ready. Use the player menu to download/save the file.';
        cleanupRecorder();
      };

      recorder.start();
      statusEl.textContent = 'Recording…';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } catch (err) {
      console.error('Failed to start recording', err);
      alert('Could not start recording. Check microphone permissions.');
    }
  };

  stopBtn.onclick = () => {
    if (currentRecorder && currentRecorder.state === 'recording') {
      currentRecorder.stop();
      stopBtn.disabled = true;
      startBtn.disabled = false;
      statusEl.textContent = 'Finishing recording…';
    }
  };
}

function wireNav() {
  const buttons = document.querySelectorAll('.nav-item');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      state.activeView = view;
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((section) => {
        section.classList.toggle('active-view', section.id === `view-${view}`);
      });
      renderAll();
    });
  });
}

function wireToolbar() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    renderAll();
  });

  document.getElementById('add-note').addEventListener('click', () => {
    openModal('note');
  });
  document.getElementById('add-call').addEventListener('click', () => {
    openModal('call');
  });
  document.getElementById('add-project').addEventListener('click', () => {
    openModal('project');
  });
  document.getElementById('add-task').addEventListener('click', () => {
    openModal('task');
  });

  document.getElementById('export-data').addEventListener('click', exportData);
  document.getElementById('import-data').addEventListener('click', () =>
    document.getElementById('import-file').click(),
  );
  document.getElementById('import-file').addEventListener('change', importData);
}

function wireFilters() {
  const pills = document.querySelectorAll('#priority-filters .pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      state.priorityFilter = pill.dataset.priority;
      pills.forEach((p) => p.classList.toggle('pill-active', p === pill));
      renderAll();
    });
  });
}

function wireModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');

  function close() {
    backdrop.classList.add('hidden');
    const form = document.getElementById('modal-form');
    form.innerHTML = '';
    form.dataset.mode = '';
    form.dataset.id = '';
    form.dataset.type = '';
  }

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
}

function openModal(type, mode = 'create', id = null) {
  const title = document.getElementById('modal-title');
  const form = document.getElementById('modal-form');
  const backdrop = document.getElementById('modal-backdrop');

  form.innerHTML = '';

  let templateId;
  if (type === 'note') templateId = 'note-form-template';
  else if (type === 'call') templateId = 'call-form-template';
  else if (type === 'project') templateId = 'project-form-template';
  else templateId = 'task-form-template';

  const template = document.getElementById(templateId);
  const content = template.content.cloneNode(true);
  form.appendChild(content);

  form.dataset.type = type;
  form.dataset.mode = mode;
  if (id) form.dataset.id = id;

  if (type === 'call') {
    wireCallRecordingControls(form);
  }

  if (mode === 'edit' && id) {
    const items = state[`${type}s`];
    const item = items.find((i) => i.id === id);
    if (item) {
      if (type === 'note') {
        form.querySelector('[name="title"]').value = item.title || '';
        form.querySelector('[name="body"]').value = item.body || '';
        form.querySelector('[name="tags"]').value = (item.tags || []).join(', ');
        form.querySelector('[name="priority"]').value = item.priority || 'medium';
      } else if (type === 'call') {
        form.querySelector('[name="contact"]').value = item.contact || '';
        form.querySelector('[name="date"]').value = item.date || '';
        form.querySelector('[name="direction"]').value = item.direction || 'outgoing';
        form.querySelector('[name="priority"]').value = item.priority || 'medium';
        form.querySelector('[name="summary"]').value = item.summary || '';
        form.querySelector('[name="followup"]').value = item.followup || '';
        const locField = form.querySelector('[name="recordingLocation"]');
        if (locField) locField.value = item.recordingLocation || '';
      } else if (type === 'project') {
        form.querySelector('[name="name"]').value = item.name || '';
        form.querySelector('[name="description"]').value = item.description || '';
        form.querySelector('[name="priority"]').value = item.priority || 'medium';
        form.querySelector('[name="dueDate"]').value = item.dueDate || '';
        form.querySelector('[name="tasks"]').value = (item.tasks || [])
          .map((t) => t.text)
          .join('\n');
      } else if (type === 'task') {
        form.querySelector('[name="title"]').value = item.title || '';
        form.querySelector('[name="description"]').value = item.description || '';
        form.querySelector('[name="priority"]').value = item.priority || 'medium';
        form.querySelector('[name="dueDate"]').value = item.dueDate || '';
        form.querySelector('[name="project"]').value = item.project || '';
        form.querySelector('[name="status"]').value = item.status || 'not-started';
      }
    }
    title.textContent = `Edit ${type}`;
  } else {
    title.textContent = `New ${type}`;
    form.dataset.id = '';
  }

  if (!form.dataset.bound) {
    form.addEventListener('submit', handleModalSubmit);
    form.dataset.bound = 'true';
  }

  backdrop.classList.remove('hidden');
}

function handleModalSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.type;
  const mode = form.dataset.mode;
  const id = form.dataset.id || null;

  if (type === 'note') {
    const title = form.querySelector('[name="title"]').value.trim();
    if (!title) return;
    const body = form.querySelector('[name="body"]').value.trim();
    const tagsRaw = form.querySelector('[name="tags"]').value.trim();
    const priority = form.querySelector('[name="priority"]').value || 'medium';
    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (mode === 'create') {
      state.notes.unshift({
        id: uid(),
        title,
        body,
        tags,
        priority,
        createdAt: new Date().toISOString(),
      });
    } else {
      const idx = state.notes.findIndex((n) => n.id === id);
      if (idx !== -1) {
        state.notes[idx] = { ...state.notes[idx], title, body, tags, priority };
      }
    }
  } else if (type === 'call') {
    const contact = form.querySelector('[name="contact"]').value.trim();
    if (!contact) return;
    const date = form.querySelector('[name="date"]').value;
    const direction = form.querySelector('[name="direction"]').value || 'outgoing';
    const priority = form.querySelector('[name="priority"]').value || 'medium';
    const summary = form.querySelector('[name="summary"]').value.trim();
    const followup = form.querySelector('[name="followup"]').value.trim();
    const recordingLocation = form.querySelector('[name="recordingLocation"]')
      ? form.querySelector('[name="recordingLocation"]').value.trim()
      : '';

    if (mode === 'create') {
      state.calls.unshift({
        id: uid(),
        contact,
        date,
        direction,
        priority,
        summary,
        followup,
        recordingLocation,
        createdAt: new Date().toISOString(),
      });
    } else {
      const idx = state.calls.findIndex((n) => n.id === id);
      if (idx !== -1) {
        state.calls[idx] = {
          ...state.calls[idx],
          contact,
          date,
          direction,
          priority,
          summary,
          followup,
          recordingLocation,
        };
      }
    }
  } else if (type === 'project') {
    const name = form.querySelector('[name="name"]').value.trim();
    if (!name) return;
    const description = form.querySelector('[name="description"]').value.trim();
    const priority = form.querySelector('[name="priority"]').value || 'high';
    const dueDate = form.querySelector('[name="dueDate"]').value;
    const tasksRaw = form.querySelector('[name="tasks"]').value;
    const tasks = tasksRaw
      ? tasksRaw
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => ({ id: uid(), text: t, done: false }))
      : [];

    if (mode === 'create') {
      state.projects.unshift({
        id: uid(),
        name,
        description,
        priority,
        dueDate,
        tasks,
        status: 'not-started',
        createdAt: new Date().toISOString(),
      });
    } else {
      const idx = state.projects.findIndex((p) => p.id === id);
      if (idx !== -1) {
        state.projects[idx] = {
          ...state.projects[idx],
          name,
          description,
          priority,
          dueDate,
          tasks: tasks.length ? tasks : state.projects[idx].tasks || [],
        };
      }
    }
  } else if (type === 'task') {
    const title = form.querySelector('[name="title"]').value.trim();
    if (!title) return;
    const description = form.querySelector('[name="description"]').value.trim();
    const priority = form.querySelector('[name="priority"]').value || 'medium';
    const dueDate = form.querySelector('[name="dueDate"]').value;
    const project = form.querySelector('[name="project"]').value.trim();
    const status = form.querySelector('[name="status"]').value || 'not-started';

    if (mode === 'create') {
      state.tasks.unshift({
        id: uid(),
        title,
        description,
        priority,
        dueDate,
        project,
        status,
        createdAt: new Date().toISOString(),
      });
    } else {
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx !== -1) {
        state.tasks[idx] = {
          ...state.tasks[idx],
          title,
          description,
          priority,
          dueDate,
          project,
          status,
        };
      }
    }
  }

  saveState();
  renderAll();

  document.getElementById('modal-backdrop').classList.add('hidden');
  form.innerHTML = '';
}

function matchesFilters(item, type) {
  if (state.priorityFilter !== 'all' && item.priority !== state.priorityFilter) {
    return false;
  }
  if (!state.search) return true;
  const q = state.search;
  if (type === 'note') {
    const haystack = `${item.title} ${item.body} ${(item.tags || []).join(' ')}`.toLowerCase();
    return haystack.includes(q);
  }
  if (type === 'call') {
    const haystack = `${item.contact} ${item.summary} ${item.followup}`.toLowerCase();
    return haystack.includes(q);
  }
  if (type === 'project') {
    const taskText = (item.tasks || []).map((t) => t.text).join(' ');
    const haystack = `${item.name} ${item.description} ${taskText}`.toLowerCase();
    return haystack.includes(q);
  }
  if (type === 'task') {
    const haystack = `${item.title} ${item.description} ${item.project || ''}`.toLowerCase();
    return haystack.includes(q);
  }
  return true;
}

function renderAll() {
  renderNotes();
  renderCalls();
  renderProjects();
  renderTasks();
}

function priorityBadge(priority) {
  const cls =
    priority === 'high'
      ? 'badge badge-high'
      : priority === 'low'
        ? 'badge badge-low'
        : 'badge badge-medium';
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  const dotClass =
    priority === 'high'
      ? 'priority-dot priority-dot-high'
      : priority === 'low'
        ? 'priority-dot priority-dot-low'
        : 'priority-dot priority-dot-medium';
  return `<span class="${cls}"><span class="${dotClass}"></span>${label}</span>`;
}

function renderNotes() {
  const container = document.getElementById('notes-list');
  const items = state.notes.filter((n) => matchesFilters(n, 'note'));
  if (!items.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No notes found. Try a different filter or add a note.</p>';
    return;
  }
  container.classList.remove('empty-state');
  container.innerHTML = items
    .map(
      (note) => `
      <article class="card" data-id="${note.id}">
        <header class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(note.title || 'Untitled note')}</h3>
            <div class="card-meta">
              ${note.tags && note.tags.length ? `<span>${note.tags.join(' · ')}</span>` : ''}
              ${
                note.createdAt
                  ? `<span>${new Date(note.createdAt).toLocaleDateString()}</span>`
                  : ''
              }
            </div>
          </div>
          ${priorityBadge(note.priority || 'medium')}
        </header>
        ${
          note.body
            ? `<div class="card-body">${escapeHtml(limitText(note.body, 260))}</div>`
            : ''
        }
        <footer class="card-footer">
          <div class="tag-row">
            <span class="tag">Note</span>
          </div>
          <div class="card-actions">
            <button data-action="edit">Edit</button>
            <button class="danger" data-action="delete">Delete</button>
          </div>
        </footer>
      </article>
    `,
    )
    .join('');

  container.querySelectorAll('.card-actions button').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      const id = card.dataset.id;
      const action = e.target.dataset.action;
      if (action === 'edit') {
        openModal('note', 'edit', id);
      } else if (action === 'delete') {
        state.notes = state.notes.filter((n) => n.id !== id);
        saveState();
        renderAll();
      }
    }),
  );
}

function renderCalls() {
  const container = document.getElementById('calls-list');
  const items = state.calls.filter((n) => matchesFilters(n, 'call'));
  if (!items.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No calls found. Try a different filter or add a call.</p>';
    return;
  }
  container.classList.remove('empty-state');
  container.innerHTML = items
    .map((call) => {
      const dirLabel = call.direction === 'incoming' ? 'Incoming' : 'Outgoing';
      const dateLabel = call.date ? new Date(call.date).toLocaleDateString() : 'No date';
      return `
      <article class="card" data-id="${call.id}">
        <header class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(call.contact || 'Call')}</h3>
            <div class="card-meta">
              <span>${dirLabel}</span>
              <span>${dateLabel}</span>
            </div>
          </div>
          ${priorityBadge(call.priority || 'medium')}
        </header>
        <div class="card-body">
          ${
            call.summary
              ? `<div><strong>Summary:</strong> ${escapeHtml(limitText(call.summary, 200))}</div>`
              : ''
          }
          ${
            call.followup
              ? `<div style="margin-top:0.25rem;"><strong>Follow‑up:</strong> ${escapeHtml(
                  limitText(call.followup, 120),
                )}</div>`
              : ''
          }
          ${
            call.recordingLocation
              ? `<div style="margin-top:0.25rem;"><strong>Recording:</strong> ${escapeHtml(
                  limitText(call.recordingLocation, 160),
                )}</div>`
              : ''
          }
        </div>
        <footer class="card-footer">
          <div class="tag-row">
            <span class="tag">Call</span>
          </div>
          <div class="card-actions">
            <button data-action="edit">Edit</button>
            <button class="danger" data-action="delete">Delete</button>
          </div>
        </footer>
      </article>
    `;
    })
    .join('');

  container.querySelectorAll('.card-actions button').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      const id = card.dataset.id;
      const action = e.target.dataset.action;
      if (action === 'edit') {
        openModal('call', 'edit', id);
      } else if (action === 'delete') {
        state.calls = state.calls.filter((n) => n.id !== id);
        saveState();
        renderAll();
      }
    }),
  );
}

function renderProjects() {
  const container = document.getElementById('projects-list');
  const items = state.projects.filter((n) => matchesFilters(n, 'project'));
  if (!items.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No projects yet. Try a different filter or add a project.</p>';
    return;
  }
  container.classList.remove('empty-state');
  container.innerHTML = items
    .map((project) => {
      const due =
        project.dueDate && project.dueDate.length >= 8
          ? new Date(project.dueDate).toLocaleDateString()
          : null;
      const tasks = project.tasks || [];
      const completed = tasks.filter((t) => t.done).length;
      const total = tasks.length;
      const status = project.status || (completed === total && total ? 'done' : 'in-progress');
      const statusLabel =
        status === 'done' ? 'Done' : status === 'in-progress' ? 'In progress' : 'Not started';
      const statusClass =
        status === 'done'
          ? 'status-pill done'
          : status === 'in-progress'
            ? 'status-pill in-progress'
            : 'status-pill not-started';

      return `
      <article class="card" data-id="${project.id}">
        <header class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(project.name || 'Project')}</h3>
            <div class="card-meta">
              ${due ? `<span>Due ${due}</span>` : ''}
              ${
                total
                  ? `<span>${completed}/${total} tasks</span>`
                  : '<span>No tasks yet</span>'
              }
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.25rem;">
            ${priorityBadge(project.priority || 'high')}
            <span class="${statusClass}">${statusLabel}</span>
          </div>
        </header>
        <div class="card-body">
          ${
            project.description
              ? `<div>${escapeHtml(limitText(project.description, 200))}</div>`
              : ''
          }
          ${
            total
              ? `<ul class="project-task-list">
                ${tasks
                  .map(
                    (t) =>
                      `<li class="${t.done ? 'done' : ''}">${escapeHtml(
                        limitText(t.text, 80),
                      )}</li>`,
                  )
                  .join('')}
              </ul>`
              : ''
          }
        </div>
        <footer class="card-footer">
          <div class="tag-row">
            <span class="tag">Project</span>
          </div>
          <div class="card-actions">
            <button data-action="edit">Edit</button>
            <button data-action="toggle-status">${
              status === 'done' ? 'Mark in progress' : 'Mark done'
            }</button>
            <button class="danger" data-action="delete">Delete</button>
          </div>
        </footer>
      </article>
    `;
    })
    .join('');

  container.querySelectorAll('.card-actions button').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      const id = card.dataset.id;
      const action = e.target.dataset.action;
      const idx = state.projects.findIndex((p) => p.id === id);
      if (idx === -1) return;
      if (action === 'edit') {
        openModal('project', 'edit', id);
      } else if (action === 'delete') {
        state.projects.splice(idx, 1);
        saveState();
        renderAll();
      } else if (action === 'toggle-status') {
        const project = state.projects[idx];
        project.status = project.status === 'done' ? 'in-progress' : 'done';
        saveState();
        renderAll();
      }
    }),
  );
}

function renderTasks() {
  const container = document.getElementById('tasks-list');
  if (!container) return;
  const items = state.tasks.filter((t) => matchesFilters(t, 'task'));
  if (!items.length) {
    container.classList.add('empty-state');
    container.innerHTML = '<p>No tasks yet. Try a different filter or add a task.</p>';
    return;
  }
  container.classList.remove('empty-state');
  container.innerHTML = items
    .map((task) => {
      const due =
        task.dueDate && task.dueDate.length >= 8
          ? new Date(task.dueDate).toLocaleDateString()
          : null;
      const status = task.status || 'not-started';
      const statusLabel =
        status === 'done' ? 'Done' : status === 'in-progress' ? 'In progress' : 'Not started';
      const statusClass =
        status === 'done'
          ? 'status-pill done'
          : status === 'in-progress'
            ? 'status-pill in-progress'
            : 'status-pill not-started';

      return `
      <article class="card" data-id="${task.id}">
        <header class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(task.title || 'Task')}</h3>
            <div class="card-meta">
              ${due ? `<span>Due ${due}</span>` : ''}
              ${task.project ? `<span>Project: ${escapeHtml(task.project)}</span>` : ''}
              ${
                task.createdAt
                  ? `<span>${new Date(task.createdAt).toLocaleDateString()}</span>`
                  : ''
              }
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.25rem;">
            ${priorityBadge(task.priority || 'medium')}
            <span class="${statusClass}">${statusLabel}</span>
          </div>
        </header>
        ${
          task.description
            ? `<div class="card-body">${escapeHtml(limitText(task.description, 200))}</div>`
            : ''
        }
        <footer class="card-footer">
          <div class="tag-row">
            <span class="tag">Task</span>
          </div>
          <div class="card-actions">
            <button data-action="edit">Edit</button>
            <button data-action="toggle-status">${
              status === 'done' ? 'Mark in progress' : 'Mark done'
            }</button>
            <button class="danger" data-action="delete">Delete</button>
          </div>
        </footer>
      </article>
    `;
    })
    .join('');

  container.querySelectorAll('.card-actions button').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      const id = card.dataset.id;
      const action = e.target.dataset.action;
      const idx = state.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return;
      if (action === 'edit') {
        openModal('task', 'edit', id);
      } else if (action === 'delete') {
        state.tasks.splice(idx, 1);
        saveState();
        renderAll();
      } else if (action === 'toggle-status') {
        const task = state.tasks[idx];
        task.status = task.status === 'done' ? 'in-progress' : 'done';
        saveState();
        renderAll();
      }
    }),
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function limitText(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function exportData() {
  const data = {
    notes: state.notes,
    calls: state.calls,
    projects: state.projects,
    tasks: state.tasks,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'office-desk-data.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      state.notes = Array.isArray(data.notes) ? data.notes : [];
      state.calls = Array.isArray(data.calls) ? data.calls : [];
      state.projects = Array.isArray(data.projects) ? data.projects : [];
       state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      saveState();
      renderAll();
    } catch (err) {
      console.error('Failed to import data', err);
      alert('Could not import file. Make sure it is a valid export JSON.');
    }
  };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', init);

