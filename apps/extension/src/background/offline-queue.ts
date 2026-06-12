import { getOfflineQueue, pushToOfflineQueue, clearOfflineQueue } from "../shared/storage";

const MAX_QUEUE_SIZE = 50;

interface QueueItem {
	payload: unknown;
	timestamp: number;
	retries: number;
}

export async function enqueue(payload: unknown): Promise<void> {
	const queue = await getOfflineQueue<QueueItem>();
	if (queue.length >= MAX_QUEUE_SIZE) {
		throw new Error(`Offline queue full (max ${MAX_QUEUE_SIZE})`);
	}
	queue.push({ payload, timestamp: Date.now(), retries: 0 });
	await chrome.storage.local.set({ cphub_offline_queue: queue });
}

export async function dequeue(): Promise<QueueItem | null> {
	const queue = await getOfflineQueue<QueueItem>();
	if (queue.length === 0) return null;
	const item = queue.shift()!;
	await chrome.storage.local.set({ cphub_offline_queue: queue });
	return item;
}

export async function peekQueue(): Promise<QueueItem[]> {
	return getOfflineQueue<QueueItem>();
}

export async function queueSize(): Promise<number> {
	const queue = await getOfflineQueue();
	return queue.length;
}
