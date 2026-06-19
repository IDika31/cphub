import { syncToAPI, HttpError, type SyncPayload } from "../shared/api";
import { pushToOfflineQueue, incrementSyncedCount, getOfflineQueue, clearOfflineQueue } from "../shared/storage";
import { updateBadge } from "./badge";
import { logger } from "../shared/logger";

export async function syncPayload(payload: SyncPayload): Promise<{ success: boolean; error?: string }> {
	try {
		const result = await syncToAPI(payload);
		await incrementSyncedCount();
		await updateBadge("success");
		logger.info(`Synced: ${payload.provider}/${payload.type}`);
		return { success: true };
	} catch (err) {
		logger.error("Sync failed", err);
		try {
			await pushToOfflineQueue(payload);
			await updateBadge("pending");
		} catch {
			logger.warn("Offline queue full");
		}
		return { success: false, error: (err as Error).message };
	}
}

export async function flushOfflineQueue(): Promise<number> {
	const queue = await getOfflineQueue<SyncPayload>();
	if (queue.length === 0) return 0;

	let flushed = 0;
	const remaining: SyncPayload[] = [];

	for (const item of queue) {
		try {
			await syncToAPI(item);
			flushed++;
			// Rate limit: small delay between flushes
			await new Promise((r) => setTimeout(r, 200));
		} catch (err) {
			// Discard 4xx items — bad data, will never succeed
			if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
				logger.warn(`Discarding bad queue item (HTTP ${err.status}): ${err.message}`);
				continue;
			}
			remaining.push(item);
		}
	}

	// Update queue with remaining items
	await chrome.storage.local.set({ cphub_offline_queue: remaining });

	if (remaining.length === 0) {
		await updateBadge("ok");
	}

	logger.info(`Flushed ${flushed}/${queue.length} items from offline queue`);
	return flushed;
}

// Try to flush queue every 5 minutes via alarm
export function scheduleFlush(): void {
	chrome.alarms.create("flush-queue", { periodInMinutes: 5 });
}
