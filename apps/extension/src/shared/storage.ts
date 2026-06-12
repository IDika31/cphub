const STORAGE_PREFIX = "cphub_";

export async function getSetting<T = string>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(`${STORAGE_PREFIX}${key}`);
  return result[`${STORAGE_PREFIX}${key}`] ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [`${STORAGE_PREFIX}${key}`]: value });
}

export async function getOfflineQueue<T = unknown>(): Promise<T[]> {
  const result = await chrome.storage.local.get(`${STORAGE_PREFIX}offline_queue`);
  return result[`${STORAGE_PREFIX}offline_queue`] ?? [];
}

export async function pushToOfflineQueue(item: unknown): Promise<void> {
  const queue = await getOfflineQueue();
  if (queue.length >= 50) {
    throw new Error("Offline queue full (max 50)");
  }
  queue.push(item);
  await chrome.storage.local.set({ [`${STORAGE_PREFIX}offline_queue`]: queue });
}

export async function clearOfflineQueue(): Promise<void> {
  await chrome.storage.local.remove(`${STORAGE_PREFIX}offline_queue`);
}

export async function getSyncedCount(): Promise<number> {
  const result = await chrome.storage.local.get(`${STORAGE_PREFIX}synced_count`);
  return result[`${STORAGE_PREFIX}synced_count`] ?? 0;
}

export async function incrementSyncedCount(): Promise<void> {
  const count = await getSyncedCount();
  await chrome.storage.local.set({ [`${STORAGE_PREFIX}synced_count`]: count + 1 });
}
