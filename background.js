importScripts('queue.js');

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('sidePanel.setPanelBehavior failed:', err));

// Alt+V (configurable at chrome://extensions/shortcuts): insert the next
// queued prompt into the chatbox of the active tab.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'insert-next-prompt') return;

  const item = await shiftQueue();
  if (!item) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
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
    // No content script in this tab (not a supported AI site) — put it back.
    await unshiftQueue(item);
  }
});
