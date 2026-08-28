"use client";

import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";

interface MonacoEditorProps {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  onRun?: () => void;
  onMount?: (editor: editor.IStandaloneCodeEditor) => void;
}

export default function MonacoEditor({
  value,
  language,
  onChange,
  onRun,
  onMount,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  // Same ref treatment as onRun, and for a sharper reason: the init effect runs
  // once, so a captured onChange keeps the language it closed over at mount and
  // every later autosave lands under that old storage key — picking Python then
  // wrote the Python template over the C++ draft.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;

    async function init() {
      const monaco = await import("monaco-editor");
      if (disposed || !containerRef.current) return;

      const ed = monaco.editor.create(containerRef.current, {
        value,
        language: mapLanguage(language),
        theme: "vs-dark",
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        padding: { top: 8 },
      });

      editorRef.current = ed;

      ed.onDidChangeModelContent((e) => {
        // isFlush means setValue replaced the whole buffer, i.e. the [value] effect
        // below loading a template or a saved draft — not something the user typed.
        // Reporting it would autosave that text over what is already stored, and
        // cancel the pending save of the edits it just replaced.
        if (e.isFlush) return;
        onChangeRef.current?.(ed.getValue());
      });

      // Ctrl+Enter shortcut
      ed.addAction({
        id: "run-code",
        label: "Run Code",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          onRunRef.current?.();
        },
      });

      onMount?.(ed);
    }

    init();

    return () => {
      disposed = true;
      editorRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      const current = editorRef.current.getValue();
      if (current !== value) {
        editorRef.current.setValue(value);
      }
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current) {
      const monacoModel = editorRef.current.getModel();
      if (monacoModel) {
        import("monaco-editor").then((monaco) => {
          monaco.editor.setModelLanguage(monacoModel, mapLanguage(language));
        });
      }
    }
  }, [language]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[200px]"
    />
  );
}

function mapLanguage(lang: string): string {
  const map: Record<string, string> = {
    cpp17: "cpp",
    cpp20: "cpp",
    python3: "python",
    java21: "java",
    nodejs: "javascript",
  };
  return map[lang] || "cpp";
}
