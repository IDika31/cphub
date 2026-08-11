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

function renderDollarMath(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if ((node.parentElement as Element | null)?.closest(".katex, code, pre, script")) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.includes("$") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);

  for (const textNode of nodes) {
    const text = textNode.textContent || "";
    const rendered = text
      .replace(/\$\$\$([^$]+?)\$\$\$/g, (_, tex) => {
        try { return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false }); }
        catch { return `$$$${tex}$$$`; }
      })
      .replace(/\$\$([^$]+?)\$\$/g, (_, tex) => {
        try { return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true }); }
        catch { return `$$${tex}$$`; }
      })
      .replace(/\$([^$\n]+?)\$/g, (_, tex) => {
        try { return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false }); }
        catch { return `$${tex}$`; }
      });
    if (rendered !== text) {
      const span = document.createElement("span");
      span.innerHTML = rendered;
      textNode.parentNode?.replaceChild(span, textNode);
    }
  }
}

export default function ProblemStatement({ html, title }: ProblemStatementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfUrl = extractPdfUrl(html);

  useEffect(() => {
    if (pdfUrl || !containerRef.current || !html) return;

    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Codeforces ships pre-rendered MathJax: a visual `.MathJax` span (garbled
    // <nobr> glyphs), a `.MathJax_Preview`/assistive-MathML pair, and the source
    // `<script type="math/tex">` as a SIBLING (not a child) of those nodes.
    // Strategy: re-render each script with KaTeX in place, then drop every
    // MathJax visual node so nothing duplicates.
    const mathScripts = temp.querySelectorAll(
      "script[type='math/tex'], script[type='math/tex; mode=display']"
    );
    mathScripts.forEach((script) => {
      const tex = script.textContent || "";
      const type = script.getAttribute("type") || "";
      const isDisplay = type.includes("mode=display");
      const span = document.createElement("span");
      try {
        span.innerHTML = katex.renderToString(tex, {
          throwOnError: false,
          displayMode: isDisplay,
        });
      } catch {
        span.textContent = tex;
      }
      script.parentNode?.replaceChild(span, script);
    });

    // Remove leftover MathJax DOM (visual spans, previews, assistive MathML,
    // display wrappers). KaTeX output already inserted above.
    temp
      .querySelectorAll(
        ".MathJax, .MathJax_Preview, .MathJax_Display, .MJX_Assistive_MathML, .MathJax_SVG, .MathJax_CHTML"
      )
      .forEach((el) => el.remove());

    // Render any remaining raw $...$ / $$...$$ LaTeX in text nodes (e.g. TLX)
    // Skip for Codeforces — it uses script[type='math/tex'], already handled above.
    if (mathScripts.length === 0) renderDollarMath(temp);

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
