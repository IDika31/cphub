"use client";

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface ProblemStatementProps {
  html: string;
  title?: string;
}

function extractPdfUrl(html: string): string | null {
  const m = html.match(/<embed[^>]+src="([^"]+)"[^>]*type="application\/pdf"/i)
    ?? html.match(/<embed[^>]+type="application\/pdf"[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

export default function ProblemStatement({ html, title }: ProblemStatementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfUrl = extractPdfUrl(html);

  useEffect(() => {
    if (pdfUrl || !containerRef.current || !html) return;

    const temp = document.createElement("div");
    temp.innerHTML = html;

    temp.querySelectorAll(".MathJax_Preview").forEach((el) => {
      if (!el.textContent?.trim()) el.remove();
    });
    temp.querySelectorAll(".MJX_Assistive_MathML").forEach((el) => el.remove());

    const mathScripts = temp.querySelectorAll("script[type='math/tex'], script[type='math/tex; mode=display']");
    mathScripts.forEach((script) => {
      const tex = script.textContent || "";
      const isDisplay = script.getAttribute("type") === "math/tex; mode=display";
      const parent = script.closest(".MathJax") as HTMLElement | null;
      try {
        const rendered = katex.renderToString(tex, { throwOnError: false, displayMode: isDisplay });
        if (parent) {
          parent.innerHTML = rendered;
        } else {
          const span = document.createElement("span");
          span.innerHTML = rendered;
          script.parentNode?.replaceChild(span, script);
        }
      } catch {
        if (parent) parent.textContent = tex;
      }
    });

    temp.querySelectorAll(".MathJax").forEach((el) => {
      const span = el as HTMLElement;
      if (!span.textContent?.trim() || span.innerHTML === "") span.remove();
    });

    containerRef.current.innerHTML = temp.innerHTML;
  }, [html, pdfUrl]);

  if (pdfUrl) {
    return (
      <div className="problem-statement-content text-[15px] leading-relaxed text-[#e4e4e7]">
        {title && <h2 className="text-[16px] font-semibold mb-3">{title}</h2>}
        <iframe
          src={pdfUrl}
          className="w-full rounded border border-[rgba(255,255,255,0.08)]"
          style={{ height: "80vh" }}
          title={title || "Problem Statement"}
        />
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-[12px] text-[#8b5cf6] hover:underline"
        >
          Buka PDF di tab baru ↗
        </a>
      </div>
    );
  }

  return (
    <div className="problem-statement-content text-[15px] leading-relaxed text-[#e4e4e7]">
      {title && <h2 className="text-[16px] font-semibold mb-3">{title}</h2>}
      <div
        ref={containerRef}
        className="statement-body [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_pre]:bg-[#0f0f10] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:text-[12px] [&_pre]:font-mono [&_pre]:whitespace-pre-wrap [&_.section-title]:text-[14px] [&_.section-title]:font-semibold [&_.section-title]:mb-2 [&_.section-title]:text-[#e4e4e7] [&_.katex]:text-[#e4e4e7] [&_.katex-display]:my-2"
      />
    </div>
  );
}
