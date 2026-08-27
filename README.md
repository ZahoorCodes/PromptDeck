<p align="center">
  <img src="icons/icon128.png" width="96" alt="PromptDeck logo" />
</p>

<h1 align="center">PromptDeck</h1>

<p align="center"><b>Your prompts, on deck.</b><br/>
Draft and queue your next AI prompts while ChatGPT, Claude or Gemini is still
responding — then deal them to the chatbox when <i>you</i> are ready.</p>

<p align="center">Developed by <b>Zahoor Shah</b></p>

---

## The problem it solves

While an AI is typing its answer, you want to draft your **next** prompt. But
if you draft it in the site's chatbox and the AI's answer ends with a question,
you have to clear your half-written prompt, stash it in a notepad, reply
first, then paste it back. Every. Single. Time.

PromptDeck gives you a **side panel deck** where drafts live outside the
chatbox. They wait there, in order, until you transfer one in.

Works on:

- **ChatGPT** — chatgpt.com / chat.openai.com
- **Claude** — claude.ai
- **Gemini** — gemini.google.com

## Features

- ✍️ **Draft while the AI responds** — the site's chatbox always stays free
  for quick replies; your drafts are safe in the panel.
- 🃏 **The Deck** — queue unlimited prompts; drag to reorder, edit in place,
  delete, or clear all. Persists across reloads and browser restarts.
- 📥 **Insert** — puts a prompt into the chatbox *without* sending, so you can
  still tweak it before pressing Enter.
- 🚀 **Send** — transfers the prompt and submits it in one click.
- ⌨️ **Alt+V** — inserts the next queued prompt without opening the panel
  (customizable at `chrome://extensions/shortcuts`).
- ⚡ **Insert Now** — sends your current draft straight to the chatbox,
  skipping the queue.
- 🌗 **Light & dark** — follows your system theme.
- 🔒 **Private by design** — no build step, no dependencies, no analytics; no
  data ever leaves your browser.

## Install (Load unpacked)

1. Clone or download this repository.
2. Open Chrome (or Edge/Brave) and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle, top-right).
4. Click **Load unpacked** and select the folder that contains
   `manifest.json`.
5. Pin PromptDeck, open ChatGPT / Claude / Gemini, and click the icon to open
   the deck.

## Usage

1. Open a supported AI site in the active tab.
2. Click the PromptDeck icon → the side panel opens.
3. Type a prompt and press **Ctrl+Enter** (or *Add to Deck*).
4. When ready, click **Insert** on any queued prompt — or press **Alt+V** for
   the next one in line.

If the AI unexpectedly asks you a question mid-conversation, answer it in the
chatbox as usual — your deck is untouched.

## How it works

- `sidepanel/` — the deck UI (Chrome Side Panel API); state lives in
  `chrome.storage.local`.
- `content.js` — injected into the supported sites. Each site has a small
  **adapter** (selectors for its input box and send button). Insertion goes
  through `document.execCommand('insertText')` / native value setters +
  `InputEvent`s so ProseMirror (ChatGPT, Claude), Quill (Gemini) and React
  textareas all register the text correctly.
- `background.js` — service worker wiring the toolbar icon to the side panel
  and handling the Alt+V command.

## When a site redesigns

AI sites change their DOM from time to time. If insertion stops working on one
of them, update its adapter (the `inputSelectors` / `sendSelectors` arrays at
the top of `content.js`) — that's usually the whole fix.

## Roadmap

- Auto-run mode: insert + send the next prompt automatically when the AI
  finishes responding.
- Per-site / per-conversation decks.
- Prompt templates with placeholders.
- Firefox support.

---

<p align="center">Made with ⚡ by <b>Zahoor Shah</b></p>
