//SidebarToolbox.jsx
import React, { useState, useRef } from 'react'
import './SidebarToolbox.css'

const SIDEBAR_ITEMS = [
  { id: 'terminal', icon: '▷', label: 'TERMINAL' },
  { id: 'logs',     icon: '▐', label: 'LOGS'     },
  { id: 'files',    icon: '📁', label: 'FILES'    },
  { id: 'nodes',    icon: '⬡', label: 'NODES'    },
  { id: 'build',    icon: '⚒', label: 'BUILD'    },
]
const BOTTOM_ITEMS = [
  { id: 'status', icon: '◉', label: 'STATUS' },
  { id: 'info',   icon: 'ℹ', label: 'INFO'   },
]
const TOOL_NODES = [
  { type: 'inicio',    label: 'Inicio/Fin', shape: 'oval'            },
  { type: 'proceso',   label: 'Proceso',    shape: 'rect'            },
  { type: 'condicion', label: 'Condición',  shape: 'diamond'         },
  { type: 'io',        label: 'I/O',        shape: 'parallelogram'   },
  { type: 'ciclo',     label: 'Ciclo',      shape: 'hexagon'         },
]

const EXPORTS = [
  { key: 'cpp',        label: 'C++',    ext: 'cpp'  },
  { key: 'asm',        label: 'ASM',    ext: 'asm'  },
  { key: 'python',     label: 'Python', ext: 'py'   },
  { key: 'javascript', label: 'JS',     ext: 'js'   },
  { key: 'ruby',       label: 'Ruby',   ext: 'rb'   },
  { key: 'rust',       label: 'Rust',   ext: 'rs'   },
]

function ShapeIcon({ shape }) {
  const s = { width: 32, height: 24 }
  const st = { fill: 'none', stroke: 'var(--txt2)', strokeWidth: 1.3 }
  switch (shape) {
    case 'oval':          return <svg {...s}><ellipse cx="16" cy="12" rx="13" ry="9" {...st}/></svg>
    case 'rect':          return <svg {...s}><rect x="2" y="4" width="28" height="16" {...st}/></svg>
    case 'diamond':       return <svg {...s}><polygon points="16,2 30,12 16,22 2,12" {...st}/></svg>
    case 'parallelogram': return <svg {...s}><polygon points="6,4 30,4 26,20 2,20" {...st}/></svg>
    case 'hexagon':       return <svg {...s}><polygon points="16,2 28,7 28,17 16,22 4,17 4,7" {...st}/></svg>
    default: return null
  }
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

export default function SidebarToolbox({ width, onCargar, cppCode, asmCode, traducciones, mermaidSvgRef }) {
  const [active, setActive] = useState('logs')
  const fileInputRef = useRef(null)

  const onDragStart = (e, type) => {
    e.dataTransfer.setData('nodeType', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleExport = (key, ext) => {
    let contenido = ''
    if (key === 'cpp') contenido = cppCode || ''
    else if (key === 'asm') contenido = asmCode || ''
    else contenido = traducciones?.[key] || ''
    descargar(contenido, `programa.${ext}`)
  }

  const handleExportSvg = () => {
  const el = mermaidSvgRef?.current
  if (!el) {
    alert('Abre la pestaña FLOWCHART primero y luego descarga.')
    return
  }
  const svg = el.querySelector('svg')
  if (!svg) {
    alert('Abre la pestaña FLOWCHART primero y luego descarga.')
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
      <div className="sb-header">
        <div className="sb-title">TOOLBOX_V1.0</div>
        <div className="sb-subtitle">ALGORITHMIC_VPROG</div>
      </div>
      <button className="new-node-btn">+ NEW_NODE</button>
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

      {active === 'files' ? (
        <div className="sb-files-panel">
          <div className="sb-section-lbl">ARCHIVOS</div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".cpp,.c,.txt"
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
      ) : (
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

      <div className="sb-divider" />
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