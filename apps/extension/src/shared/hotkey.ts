import { MESSAGE_TYPES } from "./messages";

// Alt+C is declared in manifest `commands`, but Chrome silently drops a
// suggested key that another extension already claimed — the shortcut then does
// nothing and cannot be told apart from a broken handler. This page-level
// listener is the fallback, so Alt+C works even when the command is unbound.
export function registerOpenEditorHotkey(): void {
  window.addEventListener("keydown", (event) => {
    // Match on code, not key: with Alt held, layouts report "ç", "©", …
    if (event.code !== "KeyC") return;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const active = document.activeElement as HTMLElement | null;
    if (active && (active.isContentEditable || /^(input|textarea|select)$/i.test(active.tagName))) {
      return;
    }

    event.preventDefault();
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OPEN_EDITOR,
      payload: { url: window.location.href },
    });
  });
}
