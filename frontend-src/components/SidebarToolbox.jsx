//=============================================================================
// SidebarToolbox.jsx — Barra lateral izquierda de herramientas
//
// Funcionalidades:
//   • Paleta de nodos arrastrables (DRAG NODES) para el canvas React Flow
//   • Gestión de archivos: abrir, exportar código (C, ASM, Python, JS, Ruby, Rust)
//   • Exportar diagrama Mermaid como SVG
//=============================================================================
import React, { useState, useRef } from 'react'
import './SidebarToolbox.css'

const SIDEBAR_ITEMS = [
  { id: 'files',    icon: '📁', label: 'FILES'    },
  { id: 'nodes',    icon: '⬡', label: 'NODES'    },
]
const BOTTOM_ITEMS = [
  { id: 'status', icon: '◉', label: 'STATUS' },
  { id: 'info',   icon: 'ℹ', label: 'INFO'   },
]
const TOOL_NODES = [
  { type: 'inicio',    label: 'Inicio',     shape: 'oval'            },
  { type: 'fin',       label: 'Fin',        shape: 'oval'            },
  { type: 'asignacion',label: 'Declarar',   shape: 'rect'            },
  { type: 'proceso',   label: 'Proceso',    shape: 'rect'            },
  { type: 'condicion', label: 'Condición',  shape: 'diamond'         },
  { type: 'print',     label: 'Imprimir',   shape: 'parallelogram'   },
  { type: 'io',        label: 'I/O',        shape: 'parallelogram'   },
  { type: 'ciclo',     label: 'Ciclo',      shape: 'hexagon'         },
]

const EXPORTS = [
  { key: 'cpp',        label: 'C++',    ext: 'cpp'  },
  { key: 'asm',        label: 'ASM',    ext: 'asm'  },
  { key: 'mermaid',    label: 'Mermaid',ext: 'md'   },
  { key: 'python',     label: 'Python', ext: 'py'   },
  { key: 'javascript', label: 'JS',     ext: 'js'   },
  { key: 'ruby',       label: 'Ruby',   ext: 'rb'   },
  { key: 'rust',       label: 'Rust',   ext: 'rs'   },
]

function ShapeIcon({ shape }) {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40">
      {shape === 'oval' && <rect x="2" y="8" width="36" height="24" rx="12" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {shape === 'rect' && <rect x="4" y="8" width="32" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {shape === 'diamond' && <polygon points="20,4 36,20 20,36 4,20" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {shape === 'parallelogram' && <polygon points="8,8 36,8 32,32 4,32" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {shape === 'hexagon' && <polygon points="12,8 28,8 36,20 28,32 12,32 4,20" fill="none" stroke="currentColor" strokeWidth="2"/>}
    </svg>
  )
}

function descargar(contenido, nombre) {
  const blob = new Blob([contenido], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * SidebarToolbox — Panel lateral izquierdo de herramientas.
 *
 * @param {object}   props
 * @param {number}   props.width        - Ancho en píxeles
 * @param {Function} props.onCargar     - Callback para cargar archivo de texto
 * @param {string}   props.cCode        - Código C generado (para exportar)
 * @param {string}   props.cppCode      - Alias legacy de cCode
 * @param {string}   props.asmCode      - Código ensamblador generado
 * @param {object}   props.traducciones - Traducciones { python, javascript, ruby, rust }
 * @param {object}   props.mermaidSvgRef- Ref al elemento SVG de Mermaid
 */
export default function SidebarToolbox({ width, onCargar, cCode, cppCode, asmCode, mermaidCode, traducciones, mermaidSvgRef }) {
  const codeC  = cCode || cppCode || ''
  const [active, setActive] = useState('nodes')
  const fileInputRef = useRef(null)

  const [toastMsg, setToastMsg] = useState(null)
  const showToast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  const onDragStart = (e, type) => {
    e.dataTransfer.setData('nodeType', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleExport = (key, ext) => {
    let contenido = ''
    if (key === 'cpp' || key === 'c') contenido = codeC
    else if (key === 'asm')           contenido = asmCode || ''
    else if (key === 'mermaid')       contenido = mermaidCode || ''
    else                              contenido = traducciones?.[key] || ''
    descargar(contenido, `programa.${ext}`)
  }

  const handleExportSvg = () => {
    const el = mermaidSvgRef?.current
    if (!el) {
      showToast('Abre la pestaña FLOWCHART primero y luego descarga.')
      return
    }
    const svg = el.querySelector('svg')
    if (!svg) {
      showToast('Abre la pestaña FLOWCHART primero y luego descarga.')
      return
    }
    const svgData = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'diagrama.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <aside className="sidebar" style={{ width }}>

      <button className="new-node-btn" onClick={() => setActive('nodes')}>+ NEW_NODE</button>
      <div className="sb-divider" />
      <div className="sb-nav">
        {SIDEBAR_ITEMS.map(item => (
          <div
            key={item.id}
            className={`sb-item ${active === item.id ? 'active' : ''}`}
            onClick={() => setActive(item.id)}
          >
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="sb-divider" style={{ marginTop: 'auto' }} />

      {active === 'files' && (
        <div className="sb-files-panel">
          <div className="sb-section-lbl">ARCHIVOS</div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".cyber,.cpp,.c,.txt,.md,.asm,.py,.js,.rb,.rs"
            style={{ display: 'none' }}
            onChange={onCargar}
          />
          <button
            className="file-action-btn open-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            ↑ OPEN FILE
          </button>

          <div className="sb-section-lbl" style={{ marginTop: '12px' }}>EXPORTAR</div>
          {EXPORTS.map(({ key, label, ext }) => (
            <button
              key={key}
              className="file-action-btn"
              onClick={() => handleExport(key, ext)}
            >
              ↓ {label} .{ext}
            </button>
          ))}
          <button
            className="file-action-btn svg-btn"
            onClick={handleExportSvg}
          >
            ↓ DIAGRAMA .svg
          </button>
        </div>
      )}

      {active === 'nodes' && (
        <div className="sb-toolnodes">
          <div className="sb-section-lbl">DRAG NODES</div>
          {TOOL_NODES.map(node => (
            <div
              key={node.type}
              className="tool-node"
              draggable
              onDragStart={e => onDragStart(e, node.type)}
              title={node.label}
            >
              <ShapeIcon shape={node.shape} />
              <span className="tool-lbl">{node.label}</span>
            </div>
          ))}
        </div>
      )}

      {active === 'status' && (
        <div className="sb-info-panel">
          <div className="sb-section-lbl">IDE STATUS</div>
          <p className="sb-info-txt">RAM: ~85K<br/>DISK: 720K<br/>SERVER: <span style={{color:'#4ade80'}}>ONLINE</span><br/>COMPILER: <span style={{color:'#4ade80'}}>READY</span><br/>AUTOSAVE: ON</p>
        </div>
      )}

      {active === 'info' && (
        <div className="sb-info-panel">
          <div className="sb-section-lbl">ABOUT</div>
          <p className="sb-info-txt">Este IDE fue diseñado para aprender programación mediante diagramas de flujo sin escribir código fuente manualmente.<br/><br/>Para empezar, ve a la pestaña NODES y arrastra elementos al lienzo.</p>
        </div>
      )}

      <div className="sb-divider" />
      {toastMsg && (
        <div style={{
          background: 'rgba(244,63,94,0.9)', color: '#fff', padding: '10px', 
          borderRadius: '4px', fontSize: '11px', margin: '0 10px 10px 10px', 
          textAlign: 'center', border: '1px solid #f43f5e'
        }}>
          {toastMsg}
        </div>
      )}
      <div className="sb-nav">
        {BOTTOM_ITEMS.map(item => (
          <div
            key={item.id}
            className={`sb-item ${active === item.id ? 'active' : ''}`}
            onClick={() => setActive(item.id)}
          >
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}