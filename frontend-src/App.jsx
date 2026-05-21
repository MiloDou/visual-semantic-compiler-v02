//=============================================================================
// App.jsx — Raíz de la aplicación CYBER_DRIVE IDE
//
// Responsabilidades:
//   • Gestión de estado global (código fuente, resultados, configuración UI)
//   • Comunicación con el backend via api.js
//   • Routing de props hacia los subcomponentes
//   • Lógica de redimensionado de paneles
//
// Dos modos de compilación:
//   1. TEXT  → onCompile()      → POST /api/compilar          (editor Monaco)
//   2. FLOW  → onCompileFlow()  → POST /api/compilar_diagrama (canvas React Flow)
//=============================================================================
import React, { useState, useCallback, useEffect, useRef } from 'react'
import TopNavBar       from './components/TopNavBar.jsx'
import SidebarToolbox  from './components/SidebarToolbox.jsx'
import MainCanvas      from './components/MainCanvas.jsx'
import RightSplitPanel from './components/RightSplitPanel.jsx'
import { compilarCodigo, compilarDiagrama, ping } from './services/api.js'
import { generateCode } from './utils/codeGenerator.js'
import './App.css'

// ── Código de ejemplo mostrado en el editor al iniciar ─────────────────────
const DEFAULT_CODE = ``

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Estado: archivos ────────────────────────────────────────────────────
  const [filename,   setFilename]   = useState('noname.cpp')
  const [sourceCode, setSourceCode] = useState(DEFAULT_CODE)

  // ── Estado: salidas del compilador ──────────────────────────────────────
  /** Código C generado (del diagrama) o el código fuente compilado */
  const [cCode,     setCCode]     = useState(DEFAULT_CODE)
  /** Código ensamblador (.s) generado */
  const [asmCode,   setAsmCode]   = useState('')
  /** Traducciones a otros lenguajes */
  const [traducciones, setTraducciones] = useState({ python: '', javascript: '', ruby: '', rust: '' })
  /** Sintaxis Mermaid del diagrama (generada por backend) */
  const [mermaidCode,  setMermaidCode]  = useState('')
  /** Líneas de salida de la ejecución del programa */
  const [echoOutput,   setEchoOutput]   = useState([])
  /** Lista de errores (léxicos, sintácticos, semánticos) */
  const [errors, setErrors] = useState([])

  // ── Estado: análisis ────────────────────────────────────────────────────
  const [tokens,        setTokens]        = useState([])
  const [ast,           setAst]           = useState(null)
  const [tablaSimbolos, setTablaSimbolos] = useState({})

  // ── Estado: UI / terminal ───────────────────────────────────────────────
  const [consoleLogs, setConsoleLogs] = useState([
    { type: 'warn', text: '[ CYBER_DRIVE v1.0 — ALGORITHMIC_VPROG ]' },
    { type: 'info', text: 'Backend: conectando a localhost:5000...' },
    { type: 'info', text: 'Usa el EDITOR de texto o el FLOWCHART visual y presiona Compilar.' },
  ])
  const [isCompiling,  setIsCompiling]  = useState(false)
  const [buildStatus,  setBuildStatus]  = useState('VISUAL')
  const [ramUsage,     setRamUsage]     = useState('64K')
  const [serverOnline, setServerOnline] = useState(null)
  const [sidebarW,     setSidebarW]     = useState(140)
  const [rightW,       setRightW]       = useState(320)
  const [fontSize,     setFontSize]     = useState(11)

  // ── Ref: serializador del canvas React Flow ─────────────────────────────
  /**
   * MainCanvas registra aquí su función serializeFlowToJSON()
   * para que App pueda invocarla al presionar "⬡ FLOW".
   * @type {React.MutableRefObject<Function|null>}
   */
  const serializeFlowRef = useRef(null)

  /** Callback que MainCanvas usa para registrar su serializador. */
  const handleSerializeRegister = useCallback((fn) => {
    serializeFlowRef.current = fn
  }, [])

  const mermaidSvgRef = useRef(null)

  // ── Efecto: ping inicial al backend ─────────────────────────────────────
  useEffect(() => {
    ping().then(r => {
      const online = r.status !== 'offline'
      setServerOnline(online)
      setConsoleLogs(prev => [
        ...prev,
        online
          ? { type: 'ok',  text: `Backend online: ${r.status}` }
          : { type: 'err', text: 'Backend offline. Ejecuta: python app.py' }
      ])
    })
  }, [])

  // ── Estado: Sync Bidireccional ──────────────────────────────────────────
  const [sourceOfTruth, setSourceOfTruth] = useState('flow') // 'flow' | 'editor'
  const [externalFlow, setExternalFlow]   = useState(null)

  // Editor -> Flowchart (solo si el editor es la fuente de verdad)
  useEffect(() => {
    if (sourceOfTruth !== 'editor') return;
    const timer = setTimeout(() => {
      fetch('http://localhost:5000/api/ast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: sourceCode })
      })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.ast) {
          import('./utils/astToFlow.js').then(({ astToFlow }) => {
            const { nodes, edges } = astToFlow(data.ast)
            setExternalFlow({ nodes, edges })
          })
        }
      })
      .catch(() => {}) // Ignorar errores silenciosamente mientras escribe
    }, 600)
    return () => clearTimeout(timer)
  }, [sourceCode, sourceOfTruth])

  const handleCodeChange = useCallback((newCode) => {
    setSourceOfTruth('editor')
    setSourceCode(newCode)
  }, [])

  const handleFlowInteraction = useCallback(() => {
    setSourceOfTruth('flow')
  }, [])

  // ── Sincronización en tiempo real del Diagrama ──────────────────────────
  const handleFlowChange = useCallback((nodes, edges) => {
    const { c_code, assembler, mermaid } = generateCode(nodes, edges)
    setCCode(c_code)
    setAsmCode(assembler)
    setMermaidCode(mermaid)

    if (sourceOfTruth === 'flow') {
      setSourceCode(c_code)
    }
  }, [sourceOfTruth])

  // ── Lógica: redimensionado de paneles laterales ─────────────────────────
  /**
   * Inicia el drag-resize de los paneles laterales.
   * @param {'left'|'right'} side - Qué panel se está redimensionando
   * @returns {(e: MouseEvent) => void}
   */
  const startResize = useCallback((side) => (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = side === 'left' ? sidebarW : rightW

    const onMove = mv => {
      const delta = mv.clientX - startX
      if (side === 'left') {
        setSidebarW(Math.max(120, Math.min(360, startW + delta)))
      } else {
        setRightW(Math.max(280, Math.min(600, startW - delta)))
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',  onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [sidebarW, rightW])

  /** Ajusta el tamaño de fuente del editor (mín 10px, máx 16px). */
  const changeFontSize = useCallback((delta) => {
    setFontSize(c => Math.max(10, Math.min(16, c + delta)))
  }, [])

  // ── Procesador genérico de respuesta del backend ─────────────────────────
  /**
   * Normaliza la respuesta JSON del compilador (compatible con schema v1 y v2)
   * y actualiza todos los estados de salida.
   *
   * Schema v1 (endpoint /compilar):   errores, cpp, echo, mermaid
   * Schema v2 (endpoint /compilar_diagrama): errors, c_code, execution_output, mermaid_syntax
   *
   * @param {object} r - Respuesta JSON del backend
   * @returns {Array<{type: string, text: string}>} Líneas para el terminal
   */
  const processCompileResponse = useCallback((r) => {
    const logs = []

    // Normalización retrocompatible de nombres de campos
    const codeOut   = r.c_code           || r.cpp       || ''
    const errList   = r.errors           || r.errores   || []
    const execLines = r.execution_output || r.echo      || []
    const mermaid   = r.mermaid_syntax   || r.mermaid   || ''

    // ── Tokens léxicos ──
    if (r.tokens?.length) {
      setTokens(r.tokens)
      logs.push({ type: 'ok', text: `Léxico: ${r.tokens.length} tokens identificados` })
    }

    // ── AST sintáctico ──
    if (r.ast) {
      setAst(r.ast)
      logs.push({ type: 'ok', text: 'Sintáctico: AST construido correctamente' })
    }

    // ── Código C generado ──
    setCCode(codeOut)

    // ── Errores ──
    if (errList.length) {
      errList.forEach(e => logs.push({ type: 'err', text: e }))
      setErrors(errList)
      setBuildStatus('ERROR')
    } else {
      setErrors([])
      logs.push({ type: 'ok', text: 'Semántico: sin errores detectados' })
    }

    // ── Tabla de símbolos ──
    if (r.tabla_simbolos) {
      setTablaSimbolos(r.tabla_simbolos)
      const n = Object.keys(r.tabla_simbolos.global || {}).length
      logs.push({ type: 'info', text: `Tabla de símbolos: ${n} entrada(s)` })
    }

    // ── Ensamblador ──
    if (r.assembler) {
      setAsmCode(r.assembler)
      logs.push({ type: 'ok', text: 'Ensamblador: código .s generado' })
    }

    // ── Traducciones, Mermaid, Salida de ejecución ──
    if (r.traducciones)  setTraducciones(r.traducciones)
    if (mermaid)         setMermaidCode(mermaid)
    if (execLines.length) setEchoOutput(execLines)

    // ── Estado final ──
    if (r.ok) {
      logs.push({ type: 'ok', text: '[OK] Compilación y ejecución exitosas' })
      setBuildStatus('RUN_OK')
      setRamUsage(Math.round(64 + Math.random() * 32) + 'K')
    } else {
      if (buildStatus !== 'ERROR') setBuildStatus('WARN')
    }
    logs.push({ type: 'info', text: '> _' })
    return logs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Compilación desde el EDITOR de texto ────────────────────────────────
  /**
   * Envía el código fuente del editor Monaco al endpoint /api/compilar.
   * Compatible con el compilador custom C-like del backend.
   */
  const handleCompile = useCallback(async () => {
    if (isCompiling) return
    setIsCompiling(true)
    setBuildStatus('BUILD')
    setConsoleLogs([
      { type: 'warn', text: `> BUILD START · ${filename}` },
      { type: 'info', text: 'Enviando código al compilador...' },
    ])
    try {
      const r    = await compilarCodigo(sourceCode)
      const logs = processCompileResponse(r)
      setConsoleLogs(logs)
    } catch (err) {
      setConsoleLogs([
        { type: 'err',  text: `No se pudo conectar al servidor: ${err.message}` },
        { type: 'err',  text: 'Asegúrate que app.py esté corriendo en puerto 5000.' },
        { type: 'info', text: '> _' },
      ])
      setBuildStatus('ERROR')
    } finally {
      setIsCompiling(false)
    }
  }, [isCompiling, sourceCode, filename, processCompileResponse])

  // ── Compilación desde el FLOWCHART visual ───────────────────────────────
  /**
   * Serializa el estado actual del canvas React Flow a JSON estructurado
   * y lo envía al endpoint /api/compilar_diagrama.
   *
   * El JSON enviado tiene la forma:
   * { version, nodes: [...], edges: [...] }
   *
   * La respuesta incluye: c_code, assembler, execution_output, errors, mermaid_syntax
   */
  const handleCompileFlow = useCallback(async () => {
    if (isCompiling) return
    if (!serializeFlowRef.current) {
      setConsoleLogs([{ type: 'err', text: 'Canvas no listo. Intenta de nuevo.' }])
      return
    }

    const flowJson = serializeFlowRef.current()

    if (!flowJson.nodes.length) {
      setConsoleLogs([{ type: 'warn', text: '> Canvas vacío. Agrega nodos al diagrama primero.' }])
      return
    }

    setIsCompiling(true)
    setBuildStatus('BUILD')
    setConsoleLogs([
      { type: 'warn', text: `> FLOW BUILD · ${flowJson.nodes.length} nodos · ${flowJson.edges.length} conexiones` },
      { type: 'info', text: 'Serializando diagrama → JSON → backend...' },
    ])

    try {
      const r    = await compilarDiagrama(flowJson)
      const logs = processCompileResponse(r)
      logs.unshift({ type: 'info', text: `Diagrama: ${flowJson.nodes.length} nodos serializados` })
      setConsoleLogs(logs)
    } catch (err) {
      setConsoleLogs([
        { type: 'err',  text: `Error compilando diagrama: ${err.message}` },
        { type: 'err',  text: 'Asegúrate que app.py esté corriendo en puerto 5000.' },
        { type: 'info', text: '> _' },
      ])
      setBuildStatus('ERROR')
    } finally {
      setIsCompiling(false)
    }
  }, [isCompiling, processCompileResponse])

  // ── Cargar archivo desde disco ───────────────────────────────────────────
  const handleLoadFile = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const content = ev.target.result;
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'cyber') {
          const data = JSON.parse(content);
          if (data.sourceCode) {
            setSourceCode(data.sourceCode);
            setSourceOfTruth('editor');
          }
          if (data.mermaidCode) setMermaidCode(data.mermaidCode);
          if (data.flow) {
            // Reconstruir estructura de nodos para ReactFlow
            const rfNodes = (data.flow.nodes || []).map(n => ({
              id: n.id,
              type: 'flowNode', // siempre flowNode para el custom render
              position: n.position,
              data: {
                shape: n.type || 'proceso',
                label: n.label || '',
                varName: n.varName || null,
                varType: n.varType || null,
                varValue: n.varValue || null,
                expr: n.expr || null,
                loopType: n.loopType || null,
              }
            }));
            const rfEdges = data.flow.edges || [];
            setExternalFlow({ nodes: rfNodes, edges: rfEdges });
            setSourceOfTruth('flow');
          }
        } else if (ext === 'md') {
          // Es un diagrama Mermaid
          setMermaidCode(content);
        } else {
          // Es código fuente en texto plano (cpp, c, py, js, asm, rb, rs, txt)
          setSourceCode(content);
          setSourceOfTruth('editor');
        }
        setFilename(file.name.replace(/\.[^/.]+$/, ""))
      } catch(err) {
        setConsoleLogs(prev => [...prev, { type: 'err', text: 'Error al cargar el archivo.' }])
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleSaveProject = useCallback(() => {
    const flowJson = serializeFlowRef.current ? serializeFlowRef.current() : { nodes: [], edges: [] };
    const exportData = {
      sourceCode,
      mermaidCode,
      flow: flowJson
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename || 'proyecto'}.cyber`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sourceCode, mermaidCode, filename]);

  const handleExportMermaid = useCallback(() => {
    const blob = new Blob([mermaidCode], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename || 'proyecto'}_diagrama.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [mermaidCode, filename]);

  const handleExportCpp = useCallback(() => {
    const blob = new Blob([sourceCode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename || 'proyecto'}.cpp`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sourceCode, filename]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      {/* ─ Barra de navegación superior ─ */}
      <TopNavBar
        filename={filename}
        setFilename={setFilename}
        onCompile={handleCompile}
        onCompileFlow={handleCompileFlow}
        isCompiling={isCompiling}
        buildStatus={buildStatus}
        ramUsage={ramUsage}
        serverOnline={serverOnline}
        fontSize={fontSize}
        onFontSize={changeFontSize}
        onLoadFile={handleLoadFile}
        onSaveProject={handleSaveProject}
        onExportMermaid={handleExportMermaid}
        onExportCpp={handleExportCpp}
      />

      {/* ─ Cuerpo principal (sidebar + canvas + panel) ─ */}
      <div className="app-body" style={{ '--fs-base': `${fontSize}px` }}>

        {/* Sidebar izquierdo de herramientas */}
        <SidebarToolbox
          width={sidebarW}
          onCargar={handleLoadFile}
          cppCode={cCode}
          asmCode={asmCode}
          traducciones={traducciones}
          mermaidSvgRef={mermaidSvgRef}
        />

        <div className="resize-handle left" onMouseDown={startResize('left')} />

        {/* Canvas central (Editor Monaco / Flowchart / Mermaid) */}
        <MainCanvas
          sourceCode={sourceCode}
          onCodeChange={handleCodeChange}
          mermaidCode={mermaidCode}
          mermaidSvgRef={mermaidSvgRef}
          onSerialize={handleSerializeRegister}
          onFlowChange={handleFlowChange}
          externalFlow={externalFlow}
          onFlowInteraction={handleFlowInteraction}
        />

        <div className="resize-handle right" onMouseDown={startResize('right')} />

        {/* Panel derecho de resultados */}
        <RightSplitPanel
          width={rightW}
          fontSize={fontSize}
          cCode={cCode}
          asmCode={asmCode}
          consoleLogs={consoleLogs}
          tokens={tokens}
          ast={ast}
          tablaSimbolos={tablaSimbolos}
          traducciones={traducciones}
          echoOutput={echoOutput}
          errors={errors}
          buildStatus={buildStatus}
        />
      </div>
    </div>
  )
}
