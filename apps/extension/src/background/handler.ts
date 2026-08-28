import { MESSAGE_TYPES, type Message, type MessageResponse } from "../shared/messages";
import { syncToAPI, pushCFSession, pushContestStates, type SyncPayload } from "../shared/api";
import { ensureCFLogin, peekCFSession } from "../shared/cf-session";
import { submitCF, fetchCFLanguages, type CFSubmitRequest } from "../shared/cf-submit";
import { readContestStates, registerContestInBrowser } from "../shared/cf-contests";
import { fetchProblemStatement } from "../shared/cf-problem";
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
		case MESSAGE_TYPES.CF_LOGIN: {
			// Codeforces' own page does the authenticating; this only waits for it and
			// takes the session. The password never reaches CPHub.
			try {
				const snapshot = await ensureCFLogin();
				const saved = await pushCFSession(snapshot);
				return { success: true, data: { handle: saved.handle || snapshot.handle, rating: saved.rating } };
			} catch (err) {
				const e = err as Error;
				// A cancelled login is the user's choice, not a fault: it is reported
				// without the error badge that a real failure raises.
				if (e.name === "CFLoginCancelled") return { success: false, error: e.message };
				logger.error("Codeforces login failed", e);
				return { success: false, error: e.message };
			}
		}
		case MESSAGE_TYPES.CF_SESSION_STATUS: {
			const status = await peekCFSession();
			return { success: true, data: status };
		}
		case MESSAGE_TYPES.CF_LANGUAGES: {
			const contestId = Number((message.payload as unknown as { contestId?: number })?.contestId ?? 1);
			try {
				return { success: true, data: { languages: await fetchCFLanguages(contestId) } };
			} catch (err) {
				return { success: false, error: (err as Error).message };
			}
		}
		case MESSAGE_TYPES.CF_SUBMIT: {
			const p = message.payload as unknown as CFSubmitRequest | undefined;
			if (!p?.contestId || !p.problemIndex || !p.source) {
				return { success: false, error: "Payload submit tidak lengkap" };
			}
			try {
				return { success: true, data: await submitCF(p) };
			} catch (err) {
				logger.error("Codeforces submit failed", err);
				return { success: false, error: (err as Error).message };
			}
		}
		case MESSAGE_TYPES.CF_REGISTER: {
			const contestId = Number((message.payload as unknown as { contestId?: number })?.contestId);
			if (!contestId) return { success: false, error: "contestId wajib diisi" };
			try {
				return { success: true, data: await registerContestInBrowser(contestId) };
			} catch (err) {
				logger.error("Codeforces registration failed", err);
				return { success: false, error: (err as Error).message };
			}
		}
		case MESSAGE_TYPES.CF_STATEMENT: {
			const problemId = String((message.payload as unknown as { problemId?: string })?.problemId ?? "");
			if (!problemId) return { success: false, error: "problemId wajib diisi" };
			try {
				return { success: true, data: await fetchProblemStatement(problemId) };
			} catch (err) {
				logger.error("Codeforces statement fetch failed", err);
				return { success: false, error: (err as Error).message };
			}
		}
		case MESSAGE_TYPES.CF_CONTEST_STATES: {
			// Read from Codeforces, then hand to CPHub in one step: the caller wants the
			// server's view updated, and splitting it would leave the two able to disagree.
			try {
				const states = await readContestStates();
				const saved = await pushContestStates(states);
				return { success: true, data: { states, saved } };
			} catch (err) {
				logger.error("Codeforces contest state sync failed", err);
				return { success: false, error: (err as Error).message };
			}
		}
		default:
			return { success: false, error: `Unknown message type: ${message.type}` };
	}
}
