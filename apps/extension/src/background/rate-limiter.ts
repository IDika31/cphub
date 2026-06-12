// Token bucket rate limiter — max 1 sync per detik, burst 3

const MAX_TOKENS = 3;
const REFILL_RATE = 1000; // 1 token per 1000ms

let tokens = MAX_TOKENS;
let lastRefill = Date.now();

function refill(): void {
	const now = Date.now();
	const elapsed = now - lastRefill;
	const newTokens = Math.floor(elapsed / REFILL_RATE);
	if (newTokens > 0) {
		tokens = Math.min(tokens + newTokens, MAX_TOKENS);
		lastRefill = now;
	}
}

export function tryAcquire(): boolean {
	refill();
	if (tokens > 0) {
		tokens--;
		return true;
	}
	return false;
}

export function tokensRemaining(): number {
	refill();
	return tokens;
}

export function timeUntilNextToken(): number {
	if (tokens > 0) return 0;
	const elapsed = Date.now() - lastRefill;
	return Math.max(0, REFILL_RATE - elapsed);
}
