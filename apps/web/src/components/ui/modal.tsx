"use client";

import { useEffect, useRef, useId, useCallback, type ReactNode } from "react";
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stableOnClose();
        return;
      }
      // Focus trap: Tab used to walk straight out of the dialog into the page
      // behind it, which for a screen-reader or keyboard user means the modal
      // was never really modal.
      if (e.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const prevActive = document.activeElement as HTMLElement | null;
    // Land on the first control rather than the panel itself, so typing works
    // immediately in a form dialog.
    const firstField = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (firstField ?? panel)?.focus();

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, stableOnClose]);

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
              className="w-9 h-9 -mr-1 inline-flex items-center justify-center rounded-[6px] text-[#a1a1aa] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
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
