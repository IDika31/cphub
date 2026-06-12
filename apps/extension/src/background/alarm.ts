import { pingAPI } from "../shared/api";
import { updateBadge } from "./badge";
import { flushOfflineQueue } from "./sync";
import { logger } from "../shared/logger";

export function registerAlarms(): void {
	// Health ping every 5 minutes
	chrome.alarms.create("health-ping", { periodInMinutes: 5 });

	// Flush offline queue every 2 minutes
	chrome.alarms.create("flush-queue", { periodInMinutes: 2 });
}

export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
	switch (alarm.name) {
		case "health-ping":
			try {
				const result = await pingAPI();
				if (result.status === "ok") {
					await updateBadge("ok");
				} else {
					await updateBadge("error");
				}
			} catch {
				await updateBadge("error");
			}
			break;

		case "flush-queue":
			try {
				const flushed = await flushOfflineQueue();
				if (flushed > 0) {
					logger.info(`Flushed ${flushed} offline items`);
				}
			} catch (err) {
				logger.warn("Failed to flush offline queue", err);
			}
			break;
	}
}
