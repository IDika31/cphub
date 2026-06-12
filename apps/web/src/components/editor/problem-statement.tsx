"use client";

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface ProblemStatementProps {
  html: string;
  title?: string;
}

export default function ProblemStatement({ html, title }: ProblemStatementProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !html) return;

    // Clone the HTML into a temporary element for processing
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Strip empty MathJax_Preview spans (they show nothing useful)
    temp.querySelectorAll(".MathJax_Preview").forEach((el) => {
      if (!el.textContent?.trim()) el.remove();
    });

    // Strip MJX_Assistive_MathML (accessibility only, not visible)
    temp.querySelectorAll(".MJX_Assistive_MathML").forEach((el) => el.remove());

    // Process math/tex scripts — replace parent MathJax span with KaTeX
    const mathScripts = temp.querySelectorAll("script[type='math/tex'], script[type='math/tex; mode=display']");
    mathScripts.forEach((script) => {
      const tex = script.textContent || "";
      const isDisplay = script.getAttribute("type") === "math/tex; mode=display";
      // Find the closest MathJax span container
      const parent = script.closest(".MathJax") as HTMLElement | null;
      try {
        const rendered = katex.renderToString(tex, {
          throwOnError: false,
          displayMode: isDisplay,
        });
        if (parent) {
          parent.innerHTML = rendered;
        } else {
          // Replace script itself
          const span = document.createElement("span");
          span.innerHTML = rendered;
          script.parentNode?.replaceChild(span, script);
        }
      } catch {
        // If KaTeX fails, strip the broken MathJax spans, keep script text
        if (parent) parent.textContent = tex;
      }
    });

    // Strip leftover empty MathJax spans
    temp.querySelectorAll(".MathJax").forEach((el) => {
      const span = el as HTMLElement;
      if (!span.textContent?.trim() || span.innerHTML === "") {
        span.remove();
      }
    });

    // Set cleaned HTML
    containerRef.current.innerHTML = temp.innerHTML;
  }, [html]);

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
