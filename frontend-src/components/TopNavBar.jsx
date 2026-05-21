// TopNavBar.jsx
import React, { useState, useEffect } from 'react'
import './TopNavBar.css'

export default function TopNavBar({
  filename, setFilename,
  onCompile, onCompileFlow,
  isCompiling,
  buildStatus, ramUsage,
  serverOnline,
  fontSize, onFontSize,
  onLoadFile, onSaveProject, onExportMermaid, onExportCpp
}) {
  const [time, setTime] = useState('')
  const [showFileMenu, setShowFileMenu] = useState(false)

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setTime([d.getHours(), d.getMinutes(), d.getSeconds()]
        .map(n => String(n).padStart(2, '0')).join(':'))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const btnLabel = isCompiling           ? '⏳ COMPILING...'
    : buildStatus === 'RUN_OK'           ? '✓ COMPILED'
    : buildStatus === 'ERROR'            ? '✘ ERROR'
    : '▶ COMPILE'

  const btnClass = [
    'compile-btn',
    isCompiling              ? 'compiling' : '',
    buildStatus === 'RUN_OK' ? 'success'   : '',
    buildStatus === 'ERROR'  ? 'errored'   : '',
  ].filter(Boolean).join(' ')

  const flowBtnClass = [
    'compile-btn flow-compile-btn',
    isCompiling              ? 'compiling' : '',
    buildStatus === 'RUN_OK' ? 'success'   : '',
    buildStatus === 'ERROR'  ? 'errored'   : '',
  ].filter(Boolean).join(' ')

  const serverDot = serverOnline === null ? 'dot-checking'
    : serverOnline ? 'dot-online' : 'dot-offline'

  return (
    <nav className="topnav">
      <div className="topnav-left">
        <div className="app-logo">
          <div className="logo-sq" style={{background:'#a855f7', color:'#4ade80', borderColor:'#4ade80', fontWeight: 'bold', fontSize: '12px'}}>01</div>
          <span className="app-name">Compiler</span>
        </div>
      </div>

      <div className="topnav-center">
        <div className="filename-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '2px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 'bold', letterSpacing: '0.5px' }}>PROJECT:</span>
          <input
            className="filename-input"
            style={{ border: 'none', background: 'transparent', padding: '6px 0', width: '140px', fontSize: '13px' }}
            value={filename}
            onChange={e => setFilename(e.target.value)}
            spellCheck={false}
            placeholder="noname"
          />
        </div>
        <button
          className="compile-btn"
          onClick={onSaveProject}
          title="Guardar todo el proyecto (.cyber)"
        >
          💾 SAVE ALL
        </button>
        {/* Botón compilar texto */}
        <button
          className={btnClass}
          onClick={onCompile}
          disabled={isCompiling}
          title="Compilar código del editor de texto"
        >
          {btnLabel}
        </button>
        {/* Botón compilar diagrama */}
        <button
          className={flowBtnClass}
          onClick={onCompileFlow}
          disabled={isCompiling}
          title="Compilar diagrama de flujo visual → JSON"
        >
          {isCompiling ? '⏳' : '⬡'} FLOW
        </button>
      </div>

      <div className="topnav-right">
      </div>
    </nav>
  )
}
