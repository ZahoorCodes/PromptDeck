# AI Prompt Queue

A Chrome extension that solves an everyday annoyance when using AI chatbots:
you want to draft your **next** prompt while the AI is still responding — but
if the AI's answer asks you a question, you have to clear your half-written
prompt, stash it in a notepad, reply first, then paste it back.

With this extension you write prompts in a **side panel queue** instead of the
site's chatbox. They wait there, in order, until *you* decide to transfer one
into the chatbox.

Works on:

- **ChatGPT** (chatgpt.com / chat.openai.com)
- **Claude** (claude.ai)
- **Gemini** (gemini.google.com)

## Features

- ✍️ **Draft while the AI responds** — your drafts live in the side panel, so
  the site's chatbox always stays free for quick replies.
- 📚 **Queue** — add as many prompts as you like; reorder (↑/↓), edit (✎), or
  delete (✕) them at any time. The queue is saved in extension storage, so it
  survives page reloads and browser restarts.
- 📥 **Insert** — puts a queued prompt into the chatbox *without* sending, so
  you can still tweak it before pressing Enter.
- 🚀 **Insert + Send** — transfers the prompt and submits it in one click.
- ⌨️ **Alt+V** — inserts the next queued prompt into the chatbox without even
  opening the panel (customizable at `chrome://extensions/shortcuts`).
- ⚡ **Insert now** — sends the current draft straight to the chatbox,
  skipping the queue.

## Install (Load unpacked)

1. Clone or download this repository.
2. Open Chrome (or Edge/Brave) and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle, top-right).
4. Click **Load unpacked** and select this repository's folder.
5. Pin the extension, open ChatGPT / Claude / Gemini, and click the extension
   icon to open the side panel.

## Usage

1. Open a supported AI site in the active tab.
2. Click the extension icon → the **Prompt Queue** side panel opens.
3. Type a prompt and press **Ctrl+Enter** (or click *Add to queue*).
4. When you're ready, click **Insert** on any queued prompt — it appears in
   the site's chatbox, ready to send. Or press **Alt+V** to insert the next
   one in line.

If the AI unexpectedly asks you a question mid-conversation, just answer it in
the chatbox as usual — your queued prompts are untouched in the panel.

## How it works

- `sidepanel/` — the queue UI (Chrome Side Panel API). State lives in
  `chrome.storage.local`.
- `content.js` — injected into the supported sites. Each site has a small
  **adapter** (selectors for its input box and send button). Insertion goes
  through `document.execCommand('insertText')` / native value setters +
  `InputEvent`s so ProseMirror (ChatGPT, Claude), Quill (Gemini), and React
  textareas all register the text correctly.
- `background.js` — service worker that wires the toolbar icon to the side
  panel and handles the Alt+V keyboard command.

No build step, no dependencies, no data leaves your browser.

## When a site redesigns

These sites change their DOM from time to time. If insertion stops working on
one of them, update its adapter (the `inputSelectors` / `sendSelectors` arrays
at the top of `content.js`) — that's usually the whole fix.

## Ideas / roadmap

- Auto-run mode: automatically insert + send the next queued prompt when the
  AI finishes responding.
- Per-site queues.
- Prompt templates / snippets with placeholders.
- Firefox support (MV3 sidebar API differences).
