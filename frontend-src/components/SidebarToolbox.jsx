import React, { useState } from 'react'
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
  { type: 'inicio',   label: 'Inicio/Fin', shape: 'oval'   },
  { type: 'proceso',  label: 'Proceso',    shape: 'rect'   },
  { type: 'condicion',label: 'Condición',  shape: 'diamond'},
  { type: 'io',       label: 'I/O',        shape: 'parallelogram'},
  { type: 'ciclo',    label: 'Ciclo',      shape: 'hexagon'},
]

function ShapeIcon({ shape }) {
  const s = { width: 32, height: 24 }
  const st = { fill: 'none', stroke: 'var(--txt2)', strokeWidth: 1.3 }
  switch (shape) {
    case 'oval':           return <svg {...s}><ellipse cx="16" cy="12" rx="13" ry="9" {...st}/></svg>
    case 'rect':           return <svg {...s}><rect x="2" y="4" width="28" height="16" {...st}/></svg>
    case 'diamond':        return <svg {...s}><polygon points="16,2 30,12 16,22 2,12" {...st}/></svg>
    case 'parallelogram':  return <svg {...s}><polygon points="6,4 30,4 26,20 2,20" {...st}/></svg>
    case 'hexagon':        return <svg {...s}><polygon points="16,2 28,7 28,17 16,22 4,17 4,7" {...st}/></svg>
    default: return null
  }
}

export default function SidebarToolbox({ width }) {
  const [active, setActive] = useState('logs')

  const onDragStart = (e, type) => {
    e.dataTransfer.setData('nodeType', type)
    e.dataTransfer.effectAllowed = 'copy'
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
