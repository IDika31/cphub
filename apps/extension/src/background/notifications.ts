import { logger } from "../shared/logger";

type NotificationType = "sync-success" | "sync-error" | "update-available";

const NOTIFICATION_CONFIG: Record<NotificationType, { title: string; iconUrl: string }> = {
	"sync-success": { title: "CPHub", iconUrl: "/public/icons/icon-48.png" },
	"sync-error": { title: "CPHub — Sync Error", iconUrl: "/public/icons/icon-48.png" },
	"update-available": { title: "CPHub — Update Available", iconUrl: "/public/icons/icon-48.png" },
};

export async function showNotification(type: NotificationType, message: string): Promise<void> {
	const config = NOTIFICATION_CONFIG[type];
	try {
		await chrome.notifications.create(`cphub-${type}-${Date.now()}`, {
			type: "basic",
			iconUrl: config.iconUrl,
			title: config.title,
			message,
			priority: type === "sync-error" ? 2 : 1,
		});
	} catch (err) {
		logger.warn("Failed to show notification", err);
	}
}

export function notifySyncSuccess(problemTitle: string): void {
	showNotification("sync-success", `Synced: ${problemTitle}`);
}

export function notifySyncError(reason: string): void {
	showNotification("sync-error", `Sync failed: ${reason}`);
}

export function notifyUpdateAvailable(newVersion: string): void {
	showNotification("update-available", `Version ${newVersion} is available`);
}
