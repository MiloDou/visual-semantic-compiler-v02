//=============================================================================
// RightSplitPanel.jsx — Panel derecho de resultados del compilador
//
// Estructura visual (dos secciones verticales):
//
//   ┌──────────────────────────────────────┐
//   │  CODE_OUT  │ C_CODE · ASM · PY · JS  │  ← código generado (Monaco, solo lectura)
//   ├──────────────────────────────────────┤
//   │  ANALYSIS  │ OUTPUT · ERRORS · LOG … │  ← consola, tokens, AST, símbolos
//   └──────────────────────────────────────┘
//
// Criterios de rúbrica cubiertos:
//   ✓ Traducción a C       → pestaña C_CODE
//   ✓ Ensamblador          → pestaña ASM
//   ✓ Salida de ejecución  → pestaña OUTPUT
//   ✓ Errores claros       → pestaña ERRORS (con badge de conteo)
//   ✓ Diseño organizado    → layout dividido, colores semánticos
//=============================================================================
import React, { useState } from 'react'
import Editor from '@monaco-editor/react'
import './RightSplitPanel.css'

// ── Opciones base para editores Monaco de solo lectura ────────────────────
const RO_OPTS = {
  readOnly:             true,
  minimap:              { enabled: false },
  fontSize:             11,
  lineHeight:           18,
  fontFamily:           "'Courier New', monospace",
  scrollBeyondLastLine: false,
  renderLineHighlight:  'none',
  glyphMargin:          false,
  folding:              false,
  padding:              { top: 6 },
  scrollbar:            { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
}

/**
 * Define el tema oscuro "cyber-ro" para los editores de solo lectura.
 * Se llama una sola vez al montar cada instancia de Editor.
 * @param {import('@monaco-editor/react').Monaco} monaco
 */
function beforeMount(monaco) {
  try {
    monaco.editor.defineTheme('cyber-ro', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'keyword',  foreground: 'c084fc', fontStyle: 'bold' },
        { token: 'type',     foreground: '4ade80' },
        { token: 'string',   foreground: 'f0abfc' },
        { token: 'number',   foreground: 'a5f3fc' },
        { token: 'comment',  foreground: '166534', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background':              '#080d0a',
        'editor.foreground':              '#86efac',
        'editorLineNumber.foreground':    '#166534',
        'editorCursor.foreground':        '#7c3aed',
        'editor.selectionBackground':     '#4c1d9588',
        'editorIndentGuide.background':   '#3a6a4838',
        'editor.lineHighlightBackground': '#3a6a4830',
      }
    })
  } catch (_) { /* tema ya definido en otro editor — ignorar */ }
}

// ── Pestañas del panel superior (código generado) ─────────────────────────
/**
 * @typedef {{ key: string, label: string, lang: string }} CodeTab
 * @type {CodeTab[]}
 */
const CODE_TABS = [
  { key: 'c',          label: 'C_CODE', lang: 'c'          },
  { key: 'asm',        label: 'ASM',    lang: 'asm'        },
  { key: 'python',     label: 'PYTHON', lang: 'python'     },
  { key: 'javascript', label: 'JS',     lang: 'javascript' },
  { key: 'ruby',       label: 'RUBY',   lang: 'ruby'       },
  { key: 'rust',       label: 'RUST',   lang: 'rust'       },
]

// ── Pestañas del panel inferior (análisis y consola) ─────────────────────
/**
 * @typedef {{ key: string, label: string }} ConsoleTab
 * @type {ConsoleTab[]}
 */
const CONSOLE_TABS = [
  { key: 'output',   label: 'OUTPUT'   },
  { key: 'errors',   label: 'ERRORS'   },
  { key: 'terminal', label: 'LOG'      },
  { key: 'tokens',   label: 'TOKENS'   },
  { key: 'ast',      label: 'AST'      },
  { key: 'simbolos', label: 'SYMBOLS'  },
]

// ── Sub-componentes auxiliares ────────────────────────────────────────────

/**
 * Muestra la salida de ejecución del programa (execution_output / echo).
 * @param {{ lines: string[] }} props
 */
function OutputPanel({ lines }) {
  if (!lines || lines.length === 0) {
    return (
      <div className="panel-empty">
        <span className="empty-icon">▶</span>
        <span>Sin salida. Compila un programa con sentencias <code>println</code>.</span>
      </div>
    )
  }
  return (
    <div className="output-panel">
      <div className="output-header">
        <span className="output-title">▶ PROGRAM OUTPUT</span>
        <span className="output-count">{lines.length} línea(s)</span>
      </div>
      <div className="output-lines">
        {lines.map((line, i) => (
          <div key={i} className="output-line">
            <span className="output-prompt">stdout[{i}]</span>
            <span className="output-value">{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Muestra errores de compilación o ejecución con estilo prominente.
 * @param {{ errors: string[], buildStatus: string }} props
 */
function ErrorsPanel({ errors, buildStatus }) {
  if (!errors || errors.length === 0) {
    const isOk = buildStatus === 'RUN_OK'
    return (
      <div className="panel-empty success">
        <span className="empty-icon">{isOk ? '✓' : '◌'}</span>
        <span>{isOk ? 'Sin errores — compilación exitosa.' : 'Sin errores detectados aún.'}</span>
      </div>
    )
  }
  return (
    <div className="errors-panel">
      <div className="errors-header">
        <span className="errors-icon">✘</span>
        <span className="errors-title">{errors.length} ERROR{errors.length > 1 ? 'ES' : ''} DETECTADO{errors.length > 1 ? 'S' : ''}</span>
      </div>
      {errors.map((err, i) => (
        <div key={i} className="error-row">
          <span className="error-num">E{String(i + 1).padStart(2, '0')}</span>
          <span className="error-msg">{err}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Terminal de build — muestra los logs con colores por tipo.
 * @param {{ logs: Array<{type: string, text: string}> }} props
 */
function TerminalPanel({ logs }) {
  return (
    <div className="console-body">
      {logs.map((l, i) => (
        <div key={i} className={`con-line con-${l.type}`}>
          <span className="con-prompt">&gt;</span>
          <span>{l.text}</span>
        </div>
      ))}
      <span className="con-cursor" />
    </div>
  )
}

/**
 * Lista de tokens léxicos con color según su tipo.
 * @param {{ tokens: Array<{tipo: string, valor: string}> }} props
 */
function TokensPanel({ tokens }) {
  if (!tokens.length) {
    return <div className="panel-empty"><span>Sin tokens. Ejecuta Compilar.</span></div>
  }
  return (
    <div className="console-body token-list">
      {tokens.map((t, i) => (
        <div key={i} className="token-row">
          <span className={`token-type tt-${t.tipo.toLowerCase()}`}>{t.tipo}</span>
          <span className="token-val">{t.valor}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Árbol AST en formato JSON pretty-printed.
 * @param {{ ast: object|null }} props
 */
function AstPanel({ ast }) {
  if (!ast) {
    return <div className="panel-empty"><span>Sin AST. Ejecuta Compilar.</span></div>
  }
  return (
    <div className="console-body">
      <pre className="ast-json">{JSON.stringify(ast, null, 2)}</pre>
    </div>
  )
}

/**
 * Tabla de símbolos agrupada por scope.
 * @param {{ tablaSimbolos: object }} props
 */
function SimbolosPanel({ tablaSimbolos }) {
  if (Object.keys(tablaSimbolos).length === 0) {
    return <div className="panel-empty"><span>Sin tabla de símbolos. Ejecuta Compilar.</span></div>
  }
  return (
    <div className="console-body">
      {Object.entries(tablaSimbolos).map(([scope, entries]) => (
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
      ))}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────

/**
 * RightSplitPanel — Panel lateral derecho del IDE.
 *
 * @param {object}   props
 * @param {number}   props.width          - Ancho en px (controlado por resize)
 * @param {number}   props.fontSize        - Tamaño de fuente base del IDE
 * @param {string}   props.cCode          - Código C generado por el compilador/diagrama
 * @param {string}   props.asmCode        - Código ensamblador (.s) generado
 * @param {object}   props.traducciones   - Traducciones { python, javascript, ruby, rust }
 * @param {Array}    props.consoleLogs    - Logs del terminal de build
 * @param {Array}    props.tokens         - Tokens léxicos
 * @param {object}   props.ast            - AST del programa
 * @param {object}   props.tablaSimbolos  - Tabla de símbolos por scope
 * @param {string[]} props.echoOutput     - Líneas de salida del programa
 * @param {string[]} props.errors         - Errores de compilación/ejecución
 * @param {string}   props.buildStatus    - Estado de compilación ('RUN_OK'|'ERROR'|…)
 */
export default function RightSplitPanel({
  width, fontSize,
  cCode, asmCode, traducciones,
  consoleLogs, tokens, ast, tablaSimbolos,
  echoOutput, errors, buildStatus,
}) {
  const [codeTab,    setCodeTab]    = useState('c')
  const [consoleTab, setConsoleTab] = useState('output')

  // ── Selección del valor a mostrar en el editor de código ──
  const getCodeValue = () => {
    if (codeTab === 'c')   return cCode   || '; Compila el diagrama o el editor para ver el código C'
    if (codeTab === 'asm') return asmCode || '; Presiona Compilar para generar el ensamblador'
    return traducciones?.[codeTab] || `; Sin traducción disponible para "${codeTab}" aún`
  }
  const getCodeLang = () => CODE_TABS.find(t => t.key === codeTab)?.lang || 'plaintext'

  // ── Badge de errores en la pestaña ERRORS ──
  const errorCount = errors?.length || 0

  return (
    <div className="right-panel" style={{ width, fontSize: `${fontSize}px` }}>

      {/* ════ SECCIÓN SUPERIOR: Código generado ════ */}
      <div className="panel-section code-section">
        {/* Header */}
        <div className="panel-hdr">
          <span className="panel-title">■ CODE_OUTPUT</span>
          <div className={`panel-status-dot ${buildStatus === 'RUN_OK' ? 'dot-ok' : buildStatus === 'ERROR' ? 'dot-err' : 'dot-idle'}`} />
        </div>

        {/* Pestañas de código */}
        <div className="code-tabs">
          {CODE_TABS.map(t => (
            <button
              key={t.key}
              className={`rtab ${codeTab === t.key ? 'active' : ''} ${t.key === 'c' ? 'rtab-primary' : ''}`}
              onClick={() => setCodeTab(t.key)}
              title={t.key === 'c' ? 'Código C generado del diagrama' : t.label}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Editor Monaco solo lectura */}
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

      {/* ════ SECCIÓN INFERIOR: Análisis y consola ════ */}
      <div className="panel-section console-section">
        {/* Header con pestañas */}
        <div className="panel-hdr">
          <div className="console-tabs">
            {CONSOLE_TABS.map(t => (
              <button
                key={t.key}
                className={`rtab ${consoleTab === t.key ? 'active' : ''} ${t.key === 'errors' && errorCount > 0 ? 'rtab-error' : ''}`}
                onClick={() => setConsoleTab(t.key)}
              >
                {t.label}
                {/* Badge numérico en la pestaña ERRORS cuando hay errores */}
                {t.key === 'errors' && errorCount > 0 && (
                  <span className="error-badge">{errorCount}</span>
                )}
              </button>
            ))}
          </div>
          <span className="panel-sub">TTY1</span>
        </div>

        {/* Contenido de la pestaña activa */}
        {consoleTab === 'output'   && <OutputPanel   lines={echoOutput} />}
        {consoleTab === 'errors'   && <ErrorsPanel   errors={errors} buildStatus={buildStatus} />}
        {consoleTab === 'terminal' && <TerminalPanel  logs={consoleLogs} />}
        {consoleTab === 'tokens'   && <TokensPanel   tokens={tokens} />}
        {consoleTab === 'ast'      && <AstPanel      ast={ast} />}
        {consoleTab === 'simbolos' && <SimbolosPanel  tablaSimbolos={tablaSimbolos} />}
      </div>
    </div>
  )
}
