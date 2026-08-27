// Content script: receives INSERT_PROMPT messages and types the text into
// the AI site's chatbox. Each supported site has a small adapter describing
// where its input and send button live.

(() => {
  const ADAPTERS = [
    {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      inputSelectors: [
        '#prompt-textarea',
        'div.ProseMirror[contenteditable="true"]',
        'textarea[data-testid="prompt-textarea"]',
      ],
      sendSelectors: [
        '[data-testid="send-button"]',
        'button[aria-label*="Send" i]',
      ],
    },
    {
      name: 'Claude',
      hosts: ['claude.ai'],
      inputSelectors: [
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][aria-label]',
        'div[contenteditable="true"]',
      ],
      sendSelectors: [
        'button[aria-label="Send message"]',
        'button[aria-label*="Send" i]',
      ],
    },
    {
      name: 'Gemini',
      hosts: ['gemini.google.com'],
      inputSelectors: [
        '.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"]',
      ],
      sendSelectors: [
        'button[aria-label*="Send" i]',
        'button.send-button',
      ],
    },
  ];

  function currentAdapter() {
    const host = location.hostname;
    return ADAPTERS.find((a) => a.hosts.some((h) => host === h || host.endsWith('.' + h))) || null;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findFirst(selectors) {
    for (const sel of selectors) {
      const matches = Array.from(document.querySelectorAll(sel)).filter(isVisible);
      if (matches.length) return matches[matches.length - 1]; // last = usually the composer, not an edit box above
    }
    return null;
  }

  function insertIntoTextarea(el, text) {
    // React tracks the value internally; go through the native setter so the
    // framework sees the change, then fire an input event.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    const existing = el.value;
    const joined = existing && !existing.endsWith('\n') ? existing + '\n' + text : existing + text;
    setter.call(el, joined);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  }

  function insertIntoContentEditable(el, text) {
    el.focus();
    // Move the caret to the end of any existing content.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    // execCommand fires the beforeinput/input events ProseMirror and Quill
    // listen for, so the editor's internal state stays consistent.
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      // Fallback: synthesize the same event sequence manually.
      el.dispatchEvent(
        new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true })
      );
      el.appendChild(document.createTextNode(text));
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
    }
  }

  function insertPrompt(text) {
    const adapter = currentAdapter();
    if (!adapter) return { ok: false, error: 'This site is not supported.' };

    const input = findFirst(adapter.inputSelectors);
    if (!input) return { ok: false, error: `Could not find the ${adapter.name} chatbox on this page.` };

    if (input.tagName === 'TEXTAREA') {
      insertIntoTextarea(input, text);
    } else {
      insertIntoContentEditable(input, text);
    }
    return { ok: true, adapter: adapter.name };
  }

  function clickSend() {
    const adapter = currentAdapter();
    if (!adapter) return false;
    const button = findFirst(adapter.sendSelectors);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'INSERT_PROMPT') {
      const result = insertPrompt(message.text);
      if (result.ok && message.send) {
        // Give the site's framework a beat to enable the send button.
        setTimeout(() => {
          const sent = clickSend();
          sendResponse({ ...result, sent });
        }, 250);
        return true; // async sendResponse
      }
      sendResponse(result);
    } else if (message.type === 'PING') {
      sendResponse({ ok: true });
    }
    return false;
  });
})();
