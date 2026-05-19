//RightSplitPanel.jsx
import React, { useState } from 'react'
import Editor from '@monaco-editor/react'
import './RightSplitPanel.css'

const RO_OPTS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 11,
  lineHeight: 18,
  fontFamily: "'Courier New', monospace",
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  glyphMargin: false,
  folding: false,
  padding: { top: 6 },
  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
}

function beforeMount(monaco) {
  if (monaco.editor.getModel) {
    try {
      monaco.editor.defineTheme('cyber-ro', {
        base: 'vs-dark', inherit: true, rules: [
          { token: 'keyword',  foreground: 'c084fc' },
          { token: 'type',     foreground: '4ade80' },
          { token: 'string',   foreground: 'f0abfc' },
          { token: 'number',   foreground: 'a5f3fc' },
          { token: 'comment',  foreground: '166534', fontStyle: 'italic' },
        ],
        colors: {
          'editor.background':           '#080d0a',
          'editor.foreground':           '#86efac',
          'editorLineNumber.foreground': '#166534',
          'editorCursor.foreground':     '#7c3aed',
          'editor.selectionBackground':  '#4c1d9588',
          'editorIndentGuide.background':'#3a6a4838',
          'editor.lineHighlightBackground': '#3a6a4830',
        }
      })
    } catch (_) {}
  }
}

// ── Tabs superiores (código generado) ───────────────────
const CODE_TABS = [
  { key: 'cpp',        label: 'C++',        lang: 'cpp' },
  { key: 'asm',        label: 'ASM',        lang: 'asm' },
  { key: 'python',     label: 'Python',     lang: 'python' },
  { key: 'javascript', label: 'JS',         lang: 'javascript' },
  { key: 'ruby',       label: 'Ruby',       lang: 'ruby' },
  { key: 'rust',       label: 'Rust',       lang: 'rust' },
]

// ── Tabs inferiores (análisis) ───────────────────────────
const CONSOLE_TABS = [
  { key: 'terminal',  label: 'TERMINAL' },
  { key: 'tokens',    label: 'TOKENS'   },
  { key: 'ast',       label: 'AST'      },
  { key: 'simbolos',  label: 'SIMBOLOS' },
  { key: 'echo',      label: 'ECHO'     },
]

export default function RightSplitPanel({
  width, fontSize,
  cppCode, asmCode, consoleLogs,
  tokens, ast, tablaSimbolos, traducciones, echoOutput
}) {
  const [codeTab,    setCodeTab]    = useState('cpp')
  const [consoleTab, setConsoleTab] = useState('terminal')

  const getCodeValue = () => {
    if (codeTab === 'cpp')    return cppCode  || ''
    if (codeTab === 'asm')    return asmCode  || ''
    return traducciones?.[codeTab] || `; Sin traducción disponible aún`
  }

  const getCodeLang = () => CODE_TABS.find(t => t.key === codeTab)?.lang || 'plaintext'

  return (
    <div className="right-panel" style={{ width, fontSize: `${fontSize}px` }}>
      {/* ── UPPER: código generado ── */}
      <div className="panel-section code-section">
        <div className="panel-hdr">
          <span className="panel-title">■ CODE_OUT.SRC</span>
          <div className="panel-dot" />
        </div>
        <div className="code-tabs">
          {CODE_TABS.map(t => (
            <button
              key={t.key}
              className={`rtab ${codeTab === t.key ? 'active' : ''}`}
              onClick={() => setCodeTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="code-body">
          <Editor
            key={codeTab}
            height="100%"
            language={getCodeLang()}
            value={getCodeValue()}
            theme="cyber-ro"
            beforeMount={beforeMount}
            options={RO_OPTS}
          />
        </div>
      </div>

      {/* ── LOWER: terminal / análisis ── */}
      <div className="panel-section console-section">
        <div className="panel-hdr">
          <div className="console-tabs">
            {CONSOLE_TABS.map(t => (
              <button
                key={t.key}
                className={`rtab ${consoleTab === t.key ? 'active' : ''}`}
                onClick={() => setConsoleTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="panel-sub">TTY1</span>
        </div>

        {consoleTab === 'terminal' && (
          <div className="console-body">
            {consoleLogs.map((l, i) => (
              <div key={i} className={`con-line con-${l.type}`}>
                <span className="con-prompt">&gt;</span>
                <span>{l.text}</span>
              </div>
            ))}
            <span className="con-cursor" />
          </div>
        )}

        {consoleTab === 'tokens' && (
          <div className="console-body token-list">
            {tokens.length === 0
              ? <span className="con-info">Sin tokens. Ejecuta COMPILE_RUN.</span>
              : tokens.map((t, i) => (
                <div key={i} className="token-row">
                  <span className={`token-type tt-${t.tipo.toLowerCase()}`}>{t.tipo}</span>
                  <span className="token-val">{t.valor}</span>
                </div>
              ))
            }
          </div>
        )}

        {consoleTab === 'ast' && (
          <div className="console-body">
            {ast
              ? <pre className="ast-json">{JSON.stringify(ast, null, 2)}</pre>
              : <span className="con-info">Sin AST. Ejecuta COMPILE_RUN.</span>
            }
          </div>
        )}

        {consoleTab === 'simbolos' && (
          <div className="console-body">
            {Object.keys(tablaSimbolos).length === 0
              ? <span className="con-info">Sin tabla. Ejecuta COMPILE_RUN.</span>
              : Object.entries(tablaSimbolos).map(([scope, entries]) => (
                <div key={scope} className="scope-block">
                  <div className="scope-hdr">{scope.toUpperCase()}</div>
                  {Object.entries(entries).map(([nombre, info]) => (
                    <div key={nombre} className="sym-row">
                      <span className="sym-name">{nombre}</span>
                      <span className="sym-type">{info.tipo}</span>
                      <span className="sym-class">{info.clase}</span>
                      {info.parametros && (
                        <span className="sym-params">
                          ({info.parametros.map(p => `${p.tipo} ${p.nombre}`).join(', ')})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        )}
        {consoleTab === 'echo' && (
          <div className="console-body">
            {!echoOutput || echoOutput.length === 0 ? (
              <span className="con-info">Sin salida. Ejecuta COMPILE_RUN.</span>
            ) : (
            <div className="echo-output">
              <div className="echo-header">▶ PROGRAM OUTPUT</div>
              {echoOutput.map((line, i) => (
                <div key={i} className="echo-line">
                  <span className="echo-prompt">out[{i}]</span>
                  <span className="echo-val">{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}


