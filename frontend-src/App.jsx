//App.jsx
import React, { useState, useCallback, useEffect, useRef } from 'react'
import TopNavBar       from './components/TopNavBar.jsx'
import SidebarToolbox  from './components/SidebarToolbox.jsx'
import MainCanvas      from './components/MainCanvas.jsx'
import RightSplitPanel from './components/RightSplitPanel.jsx'
import { compilarCodigo, ping } from './services/api.js'
import './App.css'

const DEFAULT_CODE = `int suma(int a, int b){
    int c = a + b;
    return c;
}

int main(){
    int x = 5;
    int y = 3;
    int z = suma(x, y);
    println z;
}`

export default function App() {
  const [filename,   setFilename]   = useState('noname.cpp')
  const [sourceCode, setSourceCode] = useState(DEFAULT_CODE)

  const [cppCode,    setCppCode]    = useState(DEFAULT_CODE)
  const [asmCode,    setAsmCode]    = useState('; Presiona COMPILE_RUN para generar assembler')
  const [consoleLogs, setConsoleLogs] = useState([
    { type: 'warn', text: '[ CYBER_DRIVE v1.0 — ALGORITHMIC_VPROG ]' },
    { type: 'info', text: 'Backend: conectando a localhost:5000...' },
    { type: 'info', text: 'Edita el codigo y presiona COMPILE_RUN.' },
  ])
  const [tokens,        setTokens]        = useState([])
  const [ast,           setAst]           = useState(null)
  const [tablaSimbolos, setTablaSimbolos] = useState({})
  const [traducciones,  setTraducciones]  = useState({ python: '', javascript: '', ruby: '', rust: '' })
  const [mermaidCode,   setMermaidCode]   = useState('')
  const [echoOutput,    setEchoOutput]    = useState([])
  const [isCompiling,   setIsCompiling]   = useState(false)
  const [buildStatus,   setBuildStatus]   = useState('VISUAL')
  const [ramUsage,      setRamUsage]      = useState('64K')
  const [serverOnline,  setServerOnline]  = useState(null)
  const [sidebarW,      setSidebarW]      = useState(170)
  const [rightW,        setRightW]        = useState(380)
  const [fontSize,      setFontSize]      = useState(11)

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

  const startResize = useCallback((side) => (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = side === 'left' ? sidebarW : rightW

    const onMove = mv => {
      const delta = mv.clientX - startX
      if (side === 'left') {
        setSidebarW(Math.max(120, Math.min(360, startW + delta)))
      } else {
        setRightW(Math.max(280, Math.min(520, startW - delta)))
      }
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarW, rightW])

  const changeFontSize = useCallback((delta) => {
    setFontSize(current => Math.max(10, Math.min(16, current + delta)))
  }, [])

  const handleCompile = useCallback(async () => {
    if (isCompiling) return
    setIsCompiling(true)
    setBuildStatus('BUILD')
    setConsoleLogs([
      { type: 'warn', text: `> BUILD START · ${filename}` },
      { type: 'info', text: 'Enviando codigo al compilador...' },
    ])

    try {
      const r = await compilarCodigo(sourceCode)
      const logs = []

      if (r.tokens?.length) {
        setTokens(r.tokens)
        logs.push({ type: 'ok', text: `Lexico: ${r.tokens.length} tokens encontrados` })
      }
      if (r.ast) {
        setAst(r.ast)
        logs.push({ type: 'ok', text: 'Sintactico: AST generado correctamente' })
      }
      if (r.errores?.length) {
        r.errores.forEach(e => logs.push({ type: 'err', text: e }))
        setBuildStatus('ERROR')
      } else {
        logs.push({ type: 'ok', text: 'Semantico: sin errores detectados' })
      }
      if (r.tabla_simbolos) {
        setTablaSimbolos(r.tabla_simbolos)
        const n = Object.keys(r.tabla_simbolos.global || {}).length
        logs.push({ type: 'info', text: `Tabla de simbolos: ${n} entrada(s)` })
      }
      if (r.assembler) {
        setAsmCode(r.assembler)
        logs.push({ type: 'ok', text: 'Assembler: codigo generado' })
      }
      if (r.traducciones) {
        setTraducciones(r.traducciones)
      }
      if (r.mermaid) {
        setMermaidCode(r.mermaid)
      }
      if (r.echo) {
        setEchoOutput(r.echo)
      }
      if (r.cpp) setCppCode(r.cpp)

      if (r.ok) {
        logs.push({ type: 'ok',  text: '[OK] build finished' })
        setBuildStatus('RUN_OK')
        setRamUsage(Math.round(64 + Math.random() * 32) + 'K')
      } else {
        if (buildStatus !== 'ERROR') setBuildStatus('WARN')
      }
      logs.push({ type: 'info', text: '> _' })
      setConsoleLogs(logs)

    } catch (err) {
      setConsoleLogs([
        { type: 'err',  text: `No se pudo conectar al servidor: ${err.message}` },
        { type: 'err',  text: 'Asegurate que app.py este corriendo en puerto 5000.' },
        { type: 'info', text: '> _' },
      ])
      setBuildStatus('ERROR')
    } finally {
      setIsCompiling(false)
    }
  }, [isCompiling, sourceCode, filename, buildStatus])

const mermaidSvgRef = useRef(null)

const handleCargarArchivo = useCallback((e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    setSourceCode(ev.target.result)
    setFilename(file.name)
  }
  reader.readAsText(file)
  e.target.value = ''
}, [])

  return (
    <div className="app-layout">
      <TopNavBar
        filename={filename}
        setFilename={setFilename}
        onCompile={handleCompile}
        isCompiling={isCompiling}
        buildStatus={buildStatus}
        ramUsage={ramUsage}
        serverOnline={serverOnline}
        fontSize={fontSize}
        onFontSize={changeFontSize}
      />
      <div className="app-body" style={{ '--fs-base': `${fontSize}px` }}>
        <SidebarToolbox
        width={sidebarW}
        onCargar={handleCargarArchivo}
        cppCode={cppCode}
        asmCode={asmCode}
        traducciones={traducciones}
        mermaidSvgRef={mermaidSvgRef}
        />

        <div className="resize-handle left" onMouseDown={startResize('left')} />
        <MainCanvas
          sourceCode={sourceCode}
          onCodeChange={setSourceCode}
          mermaidCode={mermaidCode}
          mermaidSvgRef={mermaidSvgRef}
        />
        <div className="resize-handle right" onMouseDown={startResize('right')} />
        <RightSplitPanel
          width={rightW}
          fontSize={fontSize}
          cppCode={cppCode}
          asmCode={asmCode}
          consoleLogs={consoleLogs}
          tokens={tokens}
          ast={ast}
          tablaSimbolos={tablaSimbolos}
          traducciones={traducciones}
          echoOutput={echoOutput}
        />
      </div>
    </div>
  )
}
