export interface Message<T = unknown> {
  type: string;
  payload?: T;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export function sendMessageToBackground<T, R = unknown>(
  message: Message<T>,
): Promise<MessageResponse<R>> {
  return chrome.runtime.sendMessage(message);
}

export function sendMessageToContent<T, R = unknown>(
  tabId: number,
  message: Message<T>,
): Promise<MessageResponse<R>> {
  return chrome.tabs.sendMessage(tabId, message);
}

// Message type constants
export const MESSAGE_TYPES = {
  SYNC_PROBLEM: "SYNC_PROBLEM",
  SYNC_SUBMISSION: "SYNC_SUBMISSION",
  SYNC_PROFILE: "SYNC_PROFILE",
  GET_STATUS: "GET_STATUS",
  PING_API: "PING_API",
  UPDATE_BADGE: "UPDATE_BADGE",
  SHOW_NOTIFICATION: "SHOW_NOTIFICATION",
  OPEN_TLX_IMPORT: "OPEN_TLX_IMPORT",
  OPEN_EDITOR: "OPEN_EDITOR",
  // Codeforces, driven from this browser rather than from the server. See
  // shared/cf-session.ts for why: the server cannot borrow this browser's
  // Cloudflare clearance, and earning its own costs a headless Chrome.
  CF_LOGIN: "CF_LOGIN",
  CF_SESSION_STATUS: "CF_SESSION_STATUS",
  CF_SUBMIT: "CF_SUBMIT",
  CF_LANGUAGES: "CF_LANGUAGES",
  CF_REGISTER: "CF_REGISTER",
  CF_CONTEST_STATES: "CF_CONTEST_STATES",
  // Statements: the server would need a Cloudflare solve to read the same page.
  CF_STATEMENT: "CF_STATEMENT",
} as const;
