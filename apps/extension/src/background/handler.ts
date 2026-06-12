import { MESSAGE_TYPES, type Message, type MessageResponse } from "../shared/messages";
import { syncToAPI, type SyncPayload } from "../shared/api";
import { pushToOfflineQueue, incrementSyncedCount } from "../shared/storage";
import { updateBadge } from "./badge";
import { logger } from "../shared/logger";

export async function handleMessage(
	message: Message<SyncPayload>,
): Promise<MessageResponse> {
	switch (message.type) {
		case MESSAGE_TYPES.SYNC_PROBLEM:
		case MESSAGE_TYPES.SYNC_SUBMISSION:
		case MESSAGE_TYPES.SYNC_PROFILE: {
			if (!message.payload) {
				return { success: false, error: "Missing payload" };
			}
			try {
				const result = await syncToAPI(message.payload);
				await incrementSyncedCount();
				await updateBadge("success");
				return { success: true, data: result };
			} catch (err) {
				logger.error("Sync failed, queuing offline", err);
				try {
					await pushToOfflineQueue(message.payload);
				} catch {
					logger.warn("Offline queue full, dropping sync item");
				}
				await updateBadge("error");
				return {
					success: false,
					error: (err as Error).message,
				};
			}
		}
		case MESSAGE_TYPES.GET_STATUS: {
			const { getSyncedCount } = await import("../shared/storage");
			const count = await getSyncedCount();
			return {
				success: true,
				data: {
					syncedCount: count,
					extensionVersion: chrome.runtime.getManifest().version,
				},
			};
		}
		default:
			return { success: false, error: `Unknown message type: ${message.type}` };
	}
}
