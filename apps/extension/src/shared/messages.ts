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
} as const;
