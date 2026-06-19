"use client";

import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);

    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog, restore it on close
    const prevActive = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[12px] shadow-2xl w-full min-w-[320px] max-w-[480px] max-h-[85vh] overflow-hidden focus:outline-none"
      >
        {title && (
          <div className="flex items-center justify-between px-[16px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
            <h2 id={titleId} className="text-[14px] font-semibold text-[#e4e4e7]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="p-1 rounded-[6px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-[16px] overflow-y-auto max-h-[calc(85vh-44px)]">{children}</div>
      </div>
    </div>
  );
}
