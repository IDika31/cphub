// DOM mutation observer untuk SPA navigation (CF + TLX render client-side)

type NavigationCallback = () => void;

let observer: MutationObserver | null = null;
let lastUrl = "";

export function startObserver(callback: NavigationCallback): void {
	lastUrl = window.location.href;

	observer = new MutationObserver(() => {
		const currentUrl = window.location.href;
		if (currentUrl !== lastUrl) {
			lastUrl = currentUrl;
			callback();
		}
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
		attributes: false,
		characterData: false,
	});
}

export function stopObserver(): void {
	if (observer) {
		observer.disconnect();
		observer = null;
	}
}
