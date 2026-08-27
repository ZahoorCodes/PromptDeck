importScripts('queue.js');

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('sidePanel.setPanelBehavior failed:', err));

function isInjectable(url) {
  return typeof url === 'string' && /^https?:/.test(url);
}

// Content scripts only auto-inject into pages loaded AFTER the extension is
// installed/updated. Inject into every already-open tab too, so nobody has
// to reload their tabs after an update.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!isInjectable(tab.url)) continue;
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      .catch(() => {}); // tabs we can't touch (store pages, discarded tabs)
  }
});

// Make sure the tab has our content script, injecting on demand if needed
// (e.g. a tab that was open before install, or after a service-worker swap).
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true;
  } catch (err) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return true;
    } catch (err2) {
      return false;
    }
  }
}

// Alt+V (configurable at chrome://extensions/shortcuts): insert the next
// queued prompt into the chatbox of the active tab.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'insert-next-prompt') return;

  const item = await shiftQueue();
  if (!item) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !(await ensureContentScript(tab.id))) {
    await unshiftQueue(item);
    return;
  }

  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'INSERT_PROMPT',
      text: item.text,
      files: item.files || [],
      send: false,
    });
    if (!result || !result.ok) await unshiftQueue(item);
  } catch (err) {
    await unshiftQueue(item);
  }
});
