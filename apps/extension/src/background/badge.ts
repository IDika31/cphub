import { getSyncedCount } from "../shared/storage";

type BadgeState = "ok" | "success" | "error" | "pending";

const BADGE_COLORS: Record<BadgeState, string> = {
  ok: "#10b981",
  success: "#10b981",
  error: "#ef4444",
  pending: "#f59e0b",
};

export async function updateBadge(state: BadgeState): Promise<void> {
  const color = BADGE_COLORS[state];
  const count = await getSyncedCount();

  await chrome.action.setBadgeBackgroundColor({ color });

  if (state === "error") {
    await chrome.action.setBadgeText({ text: "!" });
  } else if (count > 0) {
    await chrome.action.setBadgeText({ text: String(Math.min(count, 99)) });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}
