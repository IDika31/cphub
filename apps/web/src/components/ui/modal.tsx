"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[12px] shadow-2xl min-w-[320px] max-w-[480px] max-h-[80vh] overflow-hidden">
        {title && (
          <div className="flex items-center justify-between px-[16px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
            <h2 className="text-[14px] font-semibold text-[#e4e4e7]">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-[6px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-[16px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
