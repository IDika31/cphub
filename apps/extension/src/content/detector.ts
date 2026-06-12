import { MESSAGE_TYPES } from "../shared/messages";

// Auto-detect problem page based on URL
export function detectPageType(): {
  isProblem: boolean;
  isSubmission: boolean;
  isProfile: boolean;
  provider: "codeforces" | "tlx" | null;
} {
  const url = window.location.href;

  // Codeforces
  if (url.includes("codeforces.com")) {
    const isProblem =
      url.includes("/problem/") || url.includes("/problemset/problem/");
    const isSubmission = url.includes("/status/");
    const isProfile = url.includes("/profile/");
    return {
      isProblem,
      isSubmission,
      isProfile,
      provider: "codeforces",
    };
  }

  // TLX
  if (url.includes("tlx.toki.id")) {
    const isProblem = url.includes("/problems/");
    const isSubmission = url.includes("/submissions/");
    const isProfile = url.includes("/profiles/");
    return {
      isProblem,
      isSubmission,
      isProfile,
      provider: "tlx",
    };
  }

  return {
    isProblem: false,
    isSubmission: false,
    isProfile: false,
    provider: null,
  };
}

// Trigger sync when user navigated to a problem page (SPA)
export function observeNavigation(callback: () => void): MutationObserver {
  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const detected = detectPageType();
      if (detected.isProblem) {
        callback();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}
