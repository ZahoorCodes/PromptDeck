// PromptDeck side panel: queue management + sending prompts to the active
// tab's content script. Storage helpers come from ../queue.js.

const draftEl = document.getElementById('draft');
const addBtn = document.getElementById('add');
const insertNowBtn = document.getElementById('insert-now');
const queueEl = document.getElementById('queue');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const charcountEl = document.getElementById('charcount');
const clearAllBtn = document.getElementById('clear-all');
const toastEl = document.getElementById('toast');
const versionEl = document.getElementById('version');

const ICONS = {
  insert:
    '<svg viewBox="0 0 16 16" class="ic"><path d="M1.8 8h9.4M7.6 4.2 11.4 8l-3.8 3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14 3.2v9.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  send:
    '<svg viewBox="0 0 16 16" class="ic"><path d="M14.5 1.5 7 9M14.5 1.5 10 14.5 7 9 1.5 6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/></svg>',
  edit:
    '<svg viewBox="0 0 16 16"><path d="M11.3 2.1a1.6 1.6 0 0 1 2.3 2.3l-8 8-3.1.8.8-3.1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/></svg>',
  trash:
    '<svg viewBox="0 0 16 16"><path d="M2.5 4h11M6.5 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4m2.8 0-.6 9a1 1 0 0 1-1 .9H5.3a1 1 0 0 1-1-.9l-.6-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  grip:
    '<svg viewBox="0 0 16 16" width="12" height="12"><g fill="currentColor"><circle cx="6" cy="3.5" r="1.2"/><circle cx="10" cy="3.5" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12.5" r="1.2"/><circle cx="10" cy="12.5" r="1.2"/></g></svg>',
};

let editingId = null;
let expandedIds = new Set();
let toastTimer = null;
let draggedId = null;

versionEl.textContent = 'v' + chrome.runtime.getManifest().version;

/* ---------- toast ---------- */

function toast(message, kind) {
  toastEl.textContent = message;
  toastEl.className = 'toast ' + (kind || '');
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
}

/* ---------- messaging ---------- */

async function sendToActiveTab(text, send) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { ok: false, error: 'No active tab found.' };
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'INSERT_PROMPT', text, send });
    return result || { ok: false, error: 'No response from the page.' };
  } catch (err) {
    return {
      ok: false,
      error: 'Active tab is not a supported AI site. Open ChatGPT, Claude or Gemini first.',
    };
  }
}

async function insertItem(item, send) {
  const result = await sendToActiveTab(item.text, send);
  if (result.ok) {
    await removeFromQueue(item.id);
    toast(
      send && result.sent
        ? `Sent to ${result.adapter} 🚀`
        : `Dealt to ${result.adapter} — press Enter there to send.`,
      'ok'
    );
  } else {
    toast(result.error, 'error');
  }
}

/* ---------- rendering ---------- */

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function makeBtn(className, html, title, onClick) {
  const btn = el('button', className, html);
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderEdit(li, item) {
  const textarea = el('textarea', 'edit-area');
  textarea.value = item.text;
  li.appendChild(textarea);

  const row = el('div', 'item-actions');
  row.appendChild(
    makeBtn('btn btn-primary btn-small', 'Save', 'Save changes', async () => {
      const text = textarea.value.trim();
      editingId = null;
      if (text) {
        const fresh = await getQueue();
        const target = fresh.find((q) => q.id === item.id);
        if (target && target.text !== text) {
          target.text = text;
          await setQueue(fresh); // storage listener re-renders
          return;
        }
      }
      render();
    })
  );
  row.appendChild(
    makeBtn('btn btn-ghost btn-small', 'Cancel', 'Discard changes', () => {
      editingId = null;
      render();
    })
  );
  li.appendChild(row);
  requestAnimationFrame(() => textarea.focus());
}

function renderItem(item, index, total) {
  const li = el('li', 'queue-item' + (index === 0 ? ' next' : ''));
  li.dataset.id = item.id;

  if (editingId === item.id) {
    renderEdit(li, item);
    queueEl.appendChild(li);
    return;
  }

  // top row: drag handle, order chip, NEXT badge, edit/delete
  const top = el('div', 'item-top');

  const handle = el('span', 'drag-handle', ICONS.grip);
  handle.title = 'Drag to reorder';
  top.appendChild(handle);

  top.appendChild(el('span', 'order-chip', String(index + 1)));
  if (index === 0) top.appendChild(el('span', 'next-badge', 'NEXT'));
  top.appendChild(el('span', 'spacer'));

  top.appendChild(
    makeBtn('icon-btn', ICONS.edit, 'Edit', () => {
      editingId = item.id;
      render();
    })
  );
  top.appendChild(makeBtn('icon-btn danger', ICONS.trash, 'Delete', () => removeFromQueue(item.id)));
  li.appendChild(top);

  // prompt text (clamped when long)
  const text = el('div', 'item-text');
  text.textContent = item.text;
  li.appendChild(text);

  const expanded = expandedIds.has(item.id);
  requestAnimationFrame(() => {
    if (expanded) {
      text.style.maxHeight = 'none';
    } else if (text.scrollHeight > text.clientHeight + 4) {
      text.classList.add('clamped');
      const more = el('button', 'expand-btn', 'Show more');
      more.addEventListener('click', () => {
        expandedIds.add(item.id);
        render();
      });
      text.after(more);
    }
    if (expanded) {
      const less = el('button', 'expand-btn', 'Show less');
      less.addEventListener('click', () => {
        expandedIds.delete(item.id);
        render();
      });
      text.after(less);
    }
  });

  // actions
  const actions = el('div', 'item-actions');
  actions.appendChild(
    makeBtn('btn btn-primary btn-small', ICONS.insert + ' Insert', 'Put this prompt into the chatbox (does not send)', () =>
      insertItem(item, false)
    )
  );
  actions.appendChild(
    makeBtn('btn btn-ghost btn-small', ICONS.send + ' Send', 'Insert into the chatbox and submit', () =>
      insertItem(item, true)
    )
  );
  li.appendChild(actions);

  // drag & drop reorder
  li.draggable = true;
  li.addEventListener('dragstart', (e) => {
    draggedId = item.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  });
  li.addEventListener('dragend', async () => {
    li.classList.remove('dragging');
    if (!draggedId) return;
    draggedId = null;
    // persist the order currently shown in the DOM
    const order = Array.from(queueEl.children).map((n) => n.dataset.id);
    const fresh = await getQueue();
    fresh.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    await setQueue(fresh);
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = queueEl.querySelector('.dragging');
    if (!dragging || dragging === li) return;
    const rect = li.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    queueEl.insertBefore(dragging, before ? li : li.nextSibling);
  });

  queueEl.appendChild(li);
}

async function render() {
  const queue = await getQueue();
  queueEl.textContent = '';
  queue.forEach((item, index) => renderItem(item, index, queue.length));
  emptyEl.hidden = queue.length > 0;
  clearAllBtn.hidden = queue.length < 2;
  countEl.hidden = queue.length === 0;
  countEl.textContent = queue.length + ' on deck';
}

/* ---------- composer ---------- */

function autoGrow() {
  draftEl.style.height = 'auto';
  draftEl.style.height = Math.min(draftEl.scrollHeight, 220) + 'px';
  charcountEl.textContent = draftEl.value.length ? draftEl.value.length + ' chars' : '';
}

async function addDraftToQueue() {
  const text = draftEl.value.trim();
  if (!text) {
    toast('Write a prompt first.', 'error');
    return;
  }
  await addToQueue(text);
  draftEl.value = '';
  autoGrow();
  draftEl.focus();
}

addBtn.addEventListener('click', addDraftToQueue);

insertNowBtn.addEventListener('click', async () => {
  const text = draftEl.value.trim();
  if (!text) {
    toast('Write a prompt first.', 'error');
    return;
  }
  const result = await sendToActiveTab(text, false);
  if (result.ok) {
    draftEl.value = '';
    autoGrow();
    toast(`Dealt to ${result.adapter} chatbox.`, 'ok');
  } else {
    toast(result.error, 'error');
  }
});

clearAllBtn.addEventListener('click', async () => {
  if (confirm('Remove all queued prompts?')) {
    await setQueue([]);
    toast('Deck cleared.', 'ok');
  }
});

draftEl.addEventListener('input', autoGrow);
draftEl.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    addDraftToQueue();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[QUEUE_KEY]) render();
});

autoGrow();
render();
