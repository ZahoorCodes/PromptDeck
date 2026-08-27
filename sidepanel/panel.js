// Side panel logic: manage the queue and send prompts to the active tab's
// content script. Uses the helpers from ../queue.js.

const draftEl = document.getElementById('draft');
const addBtn = document.getElementById('add');
const insertNowBtn = document.getElementById('insert-now');
const queueEl = document.getElementById('queue');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');

let editingId = null; // id of the item currently being edited, if any
let statusTimer = null;

function showStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + (kind || '');
  statusEl.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.hidden = true), 4000);
}

async function sendToActiveTab(text, send) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return { ok: false, error: 'No active tab found.' };
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'INSERT_PROMPT', text, send });
    return result || { ok: false, error: 'No response from the page.' };
  } catch (err) {
    return {
      ok: false,
      error: 'The active tab is not a supported AI site. Open ChatGPT, Claude or Gemini and try again.',
    };
  }
}

async function insertItem(item, send) {
  const result = await sendToActiveTab(item.text, send);
  if (result.ok) {
    await removeFromQueue(item.id);
    showStatus(
      send && result.sent
        ? `Sent to ${result.adapter}.`
        : `Inserted into the ${result.adapter} chatbox — press Enter there to send.`,
      'ok'
    );
  } else {
    showStatus(result.error, 'error');
  }
}

function makeButton(label, title, className, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.title = title;
  btn.className = className;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderItem(item, index, queue) {
  const li = document.createElement('li');
  if (index === 0) li.classList.add('next');

  if (index === 0) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'NEXT';
    li.appendChild(badge);
  }

  if (editingId === item.id) {
    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.value = item.text;
    li.appendChild(textarea);

    const row = document.createElement('div');
    row.className = 'row';
    row.appendChild(
      makeButton('Save', 'Save changes', 'primary', async () => {
        const text = textarea.value.trim();
        editingId = null;
        if (text) {
          const fresh = await getQueue();
          const target = fresh.find((q) => q.id === item.id);
          if (target) {
            target.text = text;
            await setQueue(fresh);
            return; // storage listener re-renders
          }
        }
        render();
      })
    );
    row.appendChild(
      makeButton('Cancel', 'Discard changes', '', () => {
        editingId = null;
        render();
      })
    );
    li.appendChild(row);
    queueEl.appendChild(li);
    textarea.focus();
    return;
  }

  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = item.text;
  li.appendChild(text);

  const row = document.createElement('div');
  row.className = 'row';

  row.appendChild(
    makeButton('Insert', 'Put this prompt into the chatbox (does not send)', 'primary', () =>
      insertItem(item, false)
    )
  );
  row.appendChild(
    makeButton('Insert + Send', 'Put this prompt into the chatbox and submit it', '', () =>
      insertItem(item, true)
    )
  );

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  row.appendChild(spacer);

  row.appendChild(
    makeButton('↑', 'Move up', 'icon', async () => {
      if (index === 0) return;
      const fresh = await getQueue();
      const i = fresh.findIndex((q) => q.id === item.id);
      if (i > 0) {
        [fresh[i - 1], fresh[i]] = [fresh[i], fresh[i - 1]];
        await setQueue(fresh);
      }
    })
  );
  row.appendChild(
    makeButton('↓', 'Move down', 'icon', async () => {
      const fresh = await getQueue();
      const i = fresh.findIndex((q) => q.id === item.id);
      if (i !== -1 && i < fresh.length - 1) {
        [fresh[i], fresh[i + 1]] = [fresh[i + 1], fresh[i]];
        await setQueue(fresh);
      }
    })
  );
  row.appendChild(
    makeButton('✎', 'Edit', 'icon', () => {
      editingId = item.id;
      render();
    })
  );
  row.appendChild(
    makeButton('✕', 'Delete', 'icon danger', () => removeFromQueue(item.id))
  );

  li.appendChild(row);
  queueEl.appendChild(li);
}

async function render() {
  const queue = await getQueue();
  queueEl.textContent = '';
  queue.forEach((item, index) => renderItem(item, index, queue));
  emptyEl.hidden = queue.length > 0;
  countEl.textContent = queue.length
    ? `${queue.length} queued`
    : '';
}

async function addDraftToQueue() {
  const text = draftEl.value.trim();
  if (!text) return;
  await addToQueue(text);
  draftEl.value = '';
  draftEl.focus();
}

addBtn.addEventListener('click', addDraftToQueue);

insertNowBtn.addEventListener('click', async () => {
  const text = draftEl.value.trim();
  if (!text) return;
  const result = await sendToActiveTab(text, false);
  if (result.ok) {
    draftEl.value = '';
    showStatus(`Inserted into the ${result.adapter} chatbox.`, 'ok');
  } else {
    showStatus(result.error, 'error');
  }
});

draftEl.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    addDraftToQueue();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[QUEUE_KEY]) render();
});

render();
