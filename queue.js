// Shared queue storage helpers. Loaded by both the background service worker
// (via importScripts) and the side panel (via <script>).

const QUEUE_KEY = 'promptQueue';

async function getQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
}

async function setQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

async function addToQueue(text) {
  const queue = await getQueue();
  queue.push({ id: crypto.randomUUID(), text });
  await setQueue(queue);
}

async function removeFromQueue(id) {
  const queue = await getQueue();
  await setQueue(queue.filter((item) => item.id !== id));
}

// Take the first prompt off the queue and return it (null if empty).
async function shiftQueue() {
  const queue = await getQueue();
  const first = queue.shift() || null;
  if (first) await setQueue(queue);
  return first;
}

// Put a prompt back at the front (used when an insert fails).
async function unshiftQueue(item) {
  const queue = await getQueue();
  queue.unshift(item);
  await setQueue(queue);
}
