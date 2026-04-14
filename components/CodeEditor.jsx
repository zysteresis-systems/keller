'use client';

/**
 * CodeEditor.jsx
 * ──────────────
 * Monaco Editor wrapper with two tabs (design.v, testbench.v).
 * - Verilog syntax highlighting via custom Monarch tokenizer
 * - Persistent state via localStorage
 * - vs-dark theme matching Keller's #0d1117 background
 * - Reset to defaults functionality
 */

import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode2 } from 'lucide-react';

const TABS = [
  { id: 'design', label: 'design.v', icon: FileCode2 },
  { id: 'testbench', label: 'tb.v', icon: FileCode2 },
];

const STORAGE_KEY_PREFIX = 'keller_code_';

const CodeEditor = forwardRef(function CodeEditor({ defaultDesign, defaultTestbench, onCodeChange }, ref) {
  const [activeTab, setActiveTab] = useState('design');
  const [files, setFiles] = useState({
    design: defaultDesign,
    testbench: defaultTestbench,
  });
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  // Expose reset to parent
  useImperativeHandle(ref, () => ({
    resetToDefaults() {
      const defaults = { design: defaultDesign, testbench: defaultTestbench };
      setFiles(defaults);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}design`, defaultDesign);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}testbench`, defaultTestbench);
      onCodeChange?.(defaults);
    }
  }), [defaultDesign, defaultTestbench, onCodeChange]);

  // Load from localStorage on mount
  useEffect(() => {
    const savedDesign = localStorage.getItem(`${STORAGE_KEY_PREFIX}design`);
    const savedTestbench = localStorage.getItem(`${STORAGE_KEY_PREFIX}testbench`);

    const loaded = {
      design: savedDesign || defaultDesign,
      testbench: savedTestbench || defaultTestbench,
    };

    setFiles(loaded);
    onCodeChange?.(loaded);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save to localStorage on change
  const handleEditorChange = useCallback((value) => {
    const updated = { ...files, [activeTab]: value || '' };
    setFiles(updated);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${activeTab}`, value || '');
    onCodeChange?.(updated);
  }, [activeTab, files, onCodeChange]);

  // Configure Monaco on mount
  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Customize the vs-dark theme to match Keller's exact colors
    monaco.editor.defineTheme('keller-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff7b72' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'number', foreground: '79c0ff' },
        { token: 'type', foreground: 'ffa657' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'editorLineNumber.foreground': '#484f58',
        'editorLineNumber.activeForeground': '#8b949e',
        'editor.selectionBackground': '#264f78',
        'editor.lineHighlightBackground': '#161b2233',
        'editorCursor.foreground': '#58a6ff',
        'editorWidget.background': '#161b22',
        'editorWidget.border': '#30363d',
        'input.background': '#0d1117',
        'input.border': '#30363d',
        'focusBorder': '#58a6ff',
        'list.activeSelectionBackground': '#1c2128',
        'scrollbarSlider.background': '#30363d80',
        'scrollbarSlider.hoverBackground': '#484f5880',
      },
    });

    monaco.editor.setTheme('keller-dark');

    // Register Verilog language if not already registered
    if (!monaco.languages.getLanguages().some(l => l.id === 'verilog')) {
      monaco.languages.register({ id: 'verilog' });
      monaco.languages.setMonarchTokensProvider('verilog', verilogTokenizer());
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center bg-keller-surface border-b border-keller-border px-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors
                border-b-2 -mb-[1px]
                ${isActive
                  ? 'text-keller-text border-keller-accent bg-keller-bg'
                  : 'text-keller-muted border-transparent hover:text-keller-text hover:bg-keller-hover'
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}

        {/* File indicator */}
        <div className="ml-auto pr-3 text-2xs text-keller-dim">
          {activeTab === 'design' ? 'RTL Design' : 'Testbench'}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="verilog"
          value={files[activeTab]}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          theme="keller-dark"
          options={{
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            guides: {
              indentation: true,
              bracketPairs: 'active',
            },
            suggest: {
              showKeywords: true,
            },
            wordWrap: 'off',
            tabSize: 4,
            insertSpaces: true,
          }}
          loading={
            <div className="h-full flex items-center justify-center bg-keller-bg">
              <div className="text-keller-muted text-sm animate-pulse">
                Loading editor...
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
});

export default CodeEditor;

/**
 * Monarch tokenizer for Verilog/SystemVerilog syntax highlighting.
 */
function verilogTokenizer() {
  return {
    keywords: [
      'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg',
      'assign', 'always', 'initial', 'begin', 'end', 'if', 'else',
      'case', 'casex', 'casez', 'endcase', 'for', 'while', 'repeat',
      'forever', 'fork', 'join', 'parameter', 'localparam', 'defparam',
      'generate', 'endgenerate', 'genvar', 'function', 'endfunction',
      'task', 'endtask', 'posedge', 'negedge', 'or', 'and', 'not',
      'buf', 'nand', 'nor', 'xor', 'xnor', 'integer', 'real',
      'time', 'realtime', 'event', 'supply0', 'supply1', 'tri',
      'triand', 'trior', 'tri0', 'tri1', 'wand', 'wor',
      'signed', 'unsigned',
    ],
    typeKeywords: [
      'logic', 'bit', 'byte', 'shortint', 'int', 'longint',
      'shortreal', 'string', 'void', 'chandle',
    ],
    operators: [
      '=', '<=', '>=', '==', '!=', '===', '!==',
      '+', '-', '*', '/', '%', '**',
      '&', '|', '^', '~', '<<', '>>', '<<<', '>>>',
      '&&', '||', '!', '?', ':',
    ],
    tokenizer: {
      root: [
        [/\$[a-zA-Z_]\w*/, 'keyword'],
        [/`[a-zA-Z_]\w*/, 'keyword'],
        [/\d+'[bBoOdDhH][0-9a-fA-FxXzZ_]+/, 'number'],
        [/\d+/, 'number'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@default': 'identifier',
          }
        }],
        [/"/, 'string', '@string'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/\s+/, 'white'],
        [/[{}()\[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  };
}
