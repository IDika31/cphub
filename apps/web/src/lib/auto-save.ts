const STORAGE_PREFIX = "cphub_code_";

export function saveToLocalStorage(
  problemId: string,
  language: string,
  code: string,
): void {
  if (typeof window === "undefined") return;
  const key = `${STORAGE_PREFIX}${problemId}_${language}`;
  localStorage.setItem(key, code);
}

export function loadFromLocalStorage(
  problemId: string,
  language: string,
): string | null {
  if (typeof window === "undefined") return null;
  const key = `${STORAGE_PREFIX}${problemId}_${language}`;
  return localStorage.getItem(key);
}

export function clearLocalStorage(problemId: string): void {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith(`${STORAGE_PREFIX}${problemId}`),
  );
  keys.forEach((k) => localStorage.removeItem(k));
}

// Debounce helper
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
