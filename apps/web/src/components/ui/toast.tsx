"use client";

import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  addToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons: Record<ToastType, string> = {
  success: "✓",
  error: "✗",
  info: "ℹ",
};

const styles: Record<ToastType, string> = {
  success: "border-[#10b981] bg-[rgba(16,185,129,0.12)] text-[#34d399]",
  error: "border-[#ef4444] bg-[rgba(239,68,68,0.12)] text-[#f87171]",
  info: "border-[#8b5cf6] bg-[rgba(139,92,246,0.12)] text-[#a78bfa]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-[14px] py-[10px] rounded-[8px] text-[13px] border font-medium shadow-lg bg-[#18181b] animate-in ${styles[t.type]}`}
          >
            <span className="mr-2" aria-hidden="true">{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
