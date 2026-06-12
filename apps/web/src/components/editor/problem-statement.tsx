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

    // Set the HTML
    containerRef.current.innerHTML = html;

    // Render LaTeX — convert MathJax spans and math/tex scripts
    try {
      // Render inline math: <span class="MathJax">...<script type="math/tex">...</script></span>
      const mathScripts = containerRef.current.querySelectorAll("script[type='math/tex']");
      mathScripts.forEach((script) => {
        const tex = script.textContent || "";
        const span = script.parentElement;
        if (span) {
          try {
            const rendered = katex.renderToString(tex, { throwOnError: false, displayMode: false });
            span.innerHTML = rendered;
          } catch {}
        }
      });

      // Render display math: <script type="math/tex; mode=display">
      const displayScripts = containerRef.current.querySelectorAll("script[type='math/tex; mode=display']");
      displayScripts.forEach((script) => {
        const tex = script.textContent || "";
        const span = script.parentElement;
        if (span) {
          try {
            const rendered = katex.renderToString(tex, { throwOnError: false, displayMode: true });
            span.innerHTML = rendered;
          } catch {}
        }
      });
    } catch {}
  }, [html]);

  return (
    <div className="problem-statement-content text-[13px] leading-relaxed text-[#e4e4e7]">
      {title && <h2 className="text-[16px] font-semibold mb-3">{title}</h2>}
      <div
        ref={containerRef}
        className="statement-body [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_pre]:bg-[#0f0f10] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:text-[12px] [&_pre]:font-mono [&_pre]:whitespace-pre-wrap [&_.section-title]:text-[14px] [&_.section-title]:font-semibold [&_.section-title]:mb-2 [&_.section-title]:text-[#e4e4e7] [&_.MathJax]:inline [&_.katex]:text-[#e4e4e7]"
      />
    </div>
  );
}
