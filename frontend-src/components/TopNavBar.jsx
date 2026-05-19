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
          <div className="logo-sq">C</div>
          <span className="app-name">CYBER_DRIVE</span>
        </div>
        <div className="nav-menus">
          <div className="dropdown-container">
            <button className="menu-btn" onClick={() => setShowFileMenu(!showFileMenu)}>
              FILE ▾
            </button>
            {showFileMenu && (
              <div className="dropdown-menu" onMouseLeave={() => setShowFileMenu(false)}>
                <label className="dropdown-item">
                  Cargar Archivo (.cyber)
                  <input type="file" accept=".cyber" hidden onChange={(e) => {
                    setShowFileMenu(false);
                    if (onLoadFile) onLoadFile(e);
                  }} />
                </label>
                <div className="dropdown-item" onClick={() => { setShowFileMenu(false); if (onSaveProject) onSaveProject() }}>
                  Guardar Proyecto (.cyber)
                </div>
                <div className="dropdown-divider"></div>
                <div className="dropdown-item" onClick={() => { setShowFileMenu(false); if (onExportCpp) onExportCpp() }}>
                  Exportar C++
                </div>
                <div className="dropdown-item" onClick={() => { setShowFileMenu(false); if (onExportMermaid) onExportMermaid() }}>
                  Exportar Mermaid
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="topnav-center">
        <input
          className="filename-input"
          value={filename}
          onChange={e => setFilename(e.target.value)}
          spellCheck={false}
        />
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
        {/* Font size controls */}
        {onFontSize && (
          <div className="font-ctrl">
            <button className="font-btn" onClick={() => onFontSize(-1)} title="Reducir fuente">A-</button>
            <span className="font-size-lbl">{fontSize}px</span>
            <button className="font-btn" onClick={() => onFontSize(+1)} title="Aumentar fuente">A+</button>
          </div>
        )}
        <div className={`server-status ${serverDot}`} title={
          serverOnline === null ? 'Conectando...'
          : serverOnline ? 'Backend online' : 'Backend offline'
        }>
          <span className="srv-dot" />
          <span className="srv-lbl">
            {serverOnline === null ? 'CHECK' : serverOnline ? 'API' : 'OFFLINE'}
          </span>
        </div>
        <span className="stat-pill">RAM: <b>{ramUsage}</b></span>
        <span className="stat-pill">DISK: <b>720K</b></span>
        <span className="stat-pill">ST: <b>{buildStatus}</b></span>
        <span className="stat-pill time">{time}</span>
        <button className="icon-btn" title="Settings">⚙</button>
        <button className="icon-btn" title="Display">▣</button>
        <button className="icon-btn" title="Help">?</button>
      </div>
    </nav>
  )
}
