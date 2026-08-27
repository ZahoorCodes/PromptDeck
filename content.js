// Content script: receives INSERT_PROMPT messages and types the text into
// the page's chat composer. Popular AI sites get tuned adapters (selectors
// for their input box and send button); every other site falls back to a
// generic composer finder, so PromptDeck works on any AI chat.

(() => {
  // Guard: this script can be injected programmatically on top of the
  // declarative injection — never register the listener twice.
  if (window.__promptDeckLoaded) return;
  window.__promptDeckLoaded = true;

  const ADAPTERS = [
    {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      inputSelectors: [
        '#prompt-textarea',
        'div.ProseMirror[contenteditable="true"]',
        'textarea[data-testid="prompt-textarea"]',
      ],
      sendSelectors: ['[data-testid="send-button"]'],
    },
    {
      name: 'Claude',
      hosts: ['claude.ai'],
      inputSelectors: [
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][aria-label]',
      ],
      sendSelectors: ['button[aria-label="Send message"]'],
    },
    {
      name: 'Gemini',
      hosts: ['gemini.google.com'],
      inputSelectors: ['.ql-editor[contenteditable="true"]'],
      sendSelectors: ['button[aria-label*="Send" i]'],
    },
    {
      name: 'Grok',
      hosts: ['grok.com', 'x.com'],
      inputSelectors: ['textarea[aria-label*="Grok" i]', 'div[contenteditable="true"]', 'textarea'],
      sendSelectors: ['button[aria-label*="Submit" i]', 'button[aria-label*="Grok" i]'],
    },
    {
      name: 'DeepSeek',
      hosts: ['chat.deepseek.com'],
      inputSelectors: ['#chat-input', 'textarea'],
      sendSelectors: ['div[role="button"][aria-disabled="false"]'],
    },
    {
      name: 'Perplexity',
      hosts: ['perplexity.ai', 'www.perplexity.ai'],
      inputSelectors: ['textarea[placeholder*="Ask" i]', 'div[contenteditable="true"]', 'textarea'],
      sendSelectors: ['button[aria-label*="Submit" i]'],
    },
    {
      name: 'Copilot',
      hosts: ['copilot.microsoft.com'],
      inputSelectors: ['#userInput', 'textarea'],
      sendSelectors: ['button[aria-label*="Submit" i]', 'button[title*="Submit" i]'],
    },
    {
      name: 'Mistral',
      hosts: ['chat.mistral.ai'],
      inputSelectors: ['div[contenteditable="true"]', 'textarea'],
      sendSelectors: ['button[aria-label*="Send" i]', 'button[type="submit"]'],
    },
    {
      name: 'Poe',
      hosts: ['poe.com'],
      inputSelectors: ['textarea[class*="GrowingTextArea" i]', 'textarea'],
      sendSelectors: ['button[data-button-send="true"]', 'button[aria-label*="Send" i]'],
    },
    {
      name: 'Meta AI',
      hosts: ['meta.ai'],
      inputSelectors: ['div[contenteditable="true"]', 'textarea'],
      sendSelectors: ['div[aria-label*="Send" i]', 'button[aria-label*="Send" i]'],
    },
    {
      name: 'AI Studio',
      hosts: ['aistudio.google.com'],
      inputSelectors: ['textarea[aria-label*="prompt" i]', 'textarea'],
      sendSelectors: ['button[aria-label*="Run" i]'],
    },
    {
      name: 'Kimi',
      hosts: ['kimi.com', 'kimi.moonshot.cn'],
      inputSelectors: ['div[contenteditable="true"]', 'textarea'],
      sendSelectors: ['button[aria-label*="Send" i]'],
    },
    {
      name: 'Qwen',
      hosts: ['chat.qwen.ai'],
      inputSelectors: ['textarea', 'div[contenteditable="true"]'],
      sendSelectors: ['button[type="submit"]', 'button[aria-label*="Send" i]'],
    },
  ];

  // Last-resort send buttons for sites without a tuned adapter.
  const GENERIC_SEND = [
    'button[aria-label*="send" i]',
    'button[data-testid*="send" i]',
    'button[title*="send" i]',
    'button[type="submit"]',
  ];

  function currentAdapter() {
    const host = location.hostname;
    return (
      ADAPTERS.find((a) => a.hosts.some((h) => host === h || host.endsWith('.' + h))) || {
        name: host.replace(/^www\./, ''),
        inputSelectors: [],
        sendSelectors: [],
        generic: true,
      }
    );
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findFirst(selectors) {
    for (const sel of selectors) {
      let matches;
      try {
        matches = Array.from(document.querySelectorAll(sel)).filter(isVisible);
      } catch (err) {
        continue;
      }
      if (matches.length) return matches[matches.length - 1]; // last = usually the composer, not an edit box above
    }
    return null;
  }

  // Generic composer finder: the focused editable if there is one, otherwise
  // the visible textarea/contenteditable sitting lowest on the screen —
  // chat composers live at the bottom of the viewport.
  function genericInput() {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.isContentEditable)) return active;
    const candidates = Array.from(
      document.querySelectorAll('textarea, div[contenteditable="true"]')
    ).filter((el) => isVisible(el) && el.getBoundingClientRect().width > 150);
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom);
    return candidates[candidates.length - 1];
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

    // execCommand fires the beforeinput/input events ProseMirror, Quill and
    // Lexical listen for, so the editor's internal state stays consistent.
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

  function dataUrlToFile(f) {
    const base64 = f.dataUrl.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], f.name, { type: f.type || 'application/octet-stream' });
  }

  // Attach files to the site's composer. Preferred path: a hidden
  // <input type="file"> (most chat UIs keep one for their attach button) —
  // set its files and fire a change event. Fallback: a synthetic paste event
  // carrying the files, the same code path as pasting a screenshot.
  function attachFiles(input, files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(dataUrlToFile(f));

    const fileInput = Array.from(document.querySelectorAll('input[type="file"]')).find(
      (el) => !el.disabled
    );
    if (fileInput) {
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      return 'file-input';
    }

    input.focus();
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    input.dispatchEvent(pasteEvent);
    return 'paste';
  }

  function insertPrompt(text, files) {
    const adapter = currentAdapter();
    const input = findFirst(adapter.inputSelectors) || genericInput();
    if (!input) {
      return { ok: false, error: `Could not find a chatbox on ${adapter.name}.` };
    }

    let attached = 0;
    if (Array.isArray(files) && files.length) {
      try {
        attachFiles(input, files);
        attached = files.length;
      } catch (err) {
        console.warn('PromptDeck: file attach failed', err);
      }
    }

    if (text) {
      if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
        insertIntoTextarea(input, text);
      } else {
        insertIntoContentEditable(input, text);
      }
    }
    return { ok: true, adapter: adapter.name, attached };
  }

  function clickSend() {
    const adapter = currentAdapter();
    const button = findFirst(adapter.sendSelectors.concat(GENERIC_SEND));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'INSERT_PROMPT') {
      const result = insertPrompt(message.text, message.files);
      if (result.ok && message.send) {
        // Give the site's framework a beat to enable the send button. With
        // attachments the site needs longer — uploads must register first.
        const delay = result.attached ? 1500 : 250;
        setTimeout(() => {
          const sent = clickSend();
          sendResponse({ ...result, sent });
        }, delay);
        return true; // async sendResponse
      }
      sendResponse(result);
    } else if (message.type === 'PING') {
      sendResponse({ ok: true });
    }
    return false;
  });
})();
