//=============================================================================
// FlowNode.jsx — Nodo personalizado del canvas React Flow
//
// Formas por tipo:
//   inicio/fin   → oval
//   proceso      → rectángulo
//   condicion    → rombo (diamond) con etiquetas SI / NO visibles
//   io/print     → paralelogramo
//   ciclo        → hexágono
//   asignacion   → rectángulo con acento de color
//
// Interacción:
//   • Doble clic → abre NodeEditor (modal)
//   • NodeEditor guarda datos via data.onUpdate() callback
//=============================================================================
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position } from 'reactflow'
import './FlowNode.css'

const SHAPE_MAP = {
  inicio:     'oval',
  fin:        'oval',
  proceso:    'rect',
  condicion:  'diamond',
  io:         'parallelogram',
  ciclo:      'hexagon',
  asignacion: 'rect',
  print:      'parallelogram',
}

const NODE_META = {
  inicio:     { color: '#4ade80', label: 'INICIO',     hint: null },
  fin:        { color: '#4ade80', label: 'FIN',         hint: null },
  proceso:    { color: '#a5f3fc', label: 'PROCESO',     hint: 'Ej: x = x + 1' },
  condicion:  { color: '#fbbf24', label: 'CONDICIÓN',   hint: 'Ej: n >= 5' },
  io:         { color: '#c084fc', label: 'I/O',         hint: 'Ej: leer n' },
  ciclo:      { color: '#fb923c', label: 'CICLO',       hint: 'Ej: n < 10' },
  asignacion: { color: '#38bdf8', label: 'DECLARAR',    hint: 'Ej: int x = 0' },
  print:      { color: '#c084fc', label: 'IMPRIMIR',    hint: 'Ej: n' },
}

const TIPOS = ['Entero', 'Flotante']

// ══════════════════════════════════════════════════════════════
// NodeEditor Modal
// ══════════════════════════════════════════════════════════════
function NodeEditor({ nodeId, shape, data, onSave, onClose }) {
  const [label,    setLabel]    = useState(data.label    || '')
  const [varName,  setVarName]  = useState(data.varName  || '')
  const [varType,  setVarType]  = useState(data.varType  || 'Entero')
  const [varValue, setVarValue] = useState(data.varValue || '')
  const [expr,     setExpr]     = useState(data.expr     || '')
  const [loopType, setLoopType] = useState(data.loopType || 'while') // 'while' | 'if'
  const inputRef = useRef(null)
  const meta = NODE_META[shape] || { color: '#86efac', hint: null }

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = useCallback(() => {
    const { onUpdate, ...cleanData } = data
    const newData = { ...cleanData, shape }

    if (shape === 'inicio' || shape === 'fin') {
      newData.label = meta.label

    } else if (shape === 'asignacion') {
      // Si el usuario escribió una expresión directa: "int x = 5"
      const trimmed = label.trim()
      const isDirectExpr = trimmed && /^(int|float)\s+\w+/.test(trimmed)
      if (isDirectExpr) {
        newData.label    = trimmed
        newData.varName  = null
        newData.varType  = null
        newData.varValue = null
      } else {
        const typeStr = varType === 'Entero' ? 'int' : 'float'
        newData.label    = varName ? `${typeStr} ${varName} = ${varValue || '0'}` : (trimmed || 'int x = 0')
        newData.varName  = varName
        newData.varType  = varType
        newData.varValue = varValue
      }
      newData.expr = expr

    } else if (shape === 'proceso') {
      newData.label = label || meta.hint || 'proceso'
      newData.expr  = label

    } else if (shape === 'condicion') {
      newData.label    = expr || 'condición'
      newData.expr     = expr
      newData.loopType = loopType

    } else if (shape === 'ciclo') {
      newData.label = expr || 'ciclo'
      newData.expr  = expr

    } else {
      // io / print
      newData.label = label || meta.hint || shape
      newData.expr  = label
    }

    onSave(newData)
    onClose()
  }, [label, varName, varType, varValue, expr, loopType, shape, data, meta, onSave, onClose])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onClose()
  }

  const isFixed    = shape === 'inicio' || shape === 'fin'
  const isDecl     = shape === 'asignacion'
  const isProcess  = shape === 'proceso'
  const isCond     = shape === 'condicion'
  const isCiclo    = shape === 'ciclo'
  const isIO       = shape === 'io' || shape === 'print'

  return (
    <div className="node-editor-overlay" onClick={onClose}>
      <div className="node-editor-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="node-editor-header" style={{ borderLeftColor: meta.color }}>
          <div className="ned-header-left">
            <span className="ned-type" style={{ color: meta.color }}>{meta.label}</span>
            <span className="ned-id">#{nodeId.slice(-6)}</span>
          </div>
          <button className="ned-close" onClick={onClose} title="Cerrar (Esc)">✕</button>
        </div>

        {/* ── FIXED (inicio / fin) ── */}
        {isFixed && (
          <div className="ned-body">
            <div className="ned-fixed-msg">
              <span style={{ fontSize: '28px' }}>{shape === 'inicio' ? '▶' : '⏹'}</span>
              <p>Nodo fijo — no requiere configuración.</p>
            </div>
          </div>
        )}

        {/* ── ASIGNACIÓN ── */}
        {isDecl && (
          <div className="ned-body">
            <div className="ned-section-title">Expresión directa</div>
            <div className="ned-row">
              <label>Código</label>
              <input
                ref={inputRef}
                placeholder="int x = 0"
                value={label === 'Declarar' || label === 'declarar' || label === 'DECLARAR' ? '' : label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-divider-txt">— o configura por campos —</div>
            <div className="ned-row">
              <label>Tipo</label>
              <div className="ned-toggle-group">
                {TIPOS.map(t => (
                  <button
                    key={t}
                    className={`ned-toggle ${varType === t ? 'active' : ''}`}
                    onClick={() => setVarType(t)}
                    style={{ '--acc-color': t === 'Entero' ? '#38bdf8' : '#f0abfc' }}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div className="ned-row">
              <label>Variable</label>
              <input
                placeholder="nombre"
                value={varName}
                onChange={e => setVarName(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-row">
              <label>Valor</label>
              <input
                placeholder="0"
                value={varValue}
                onChange={e => setVarValue(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-preview">
              {varName
                ? `${varType === 'Entero' ? 'int' : 'float'} ${varName} = ${varValue || '0'};`
                : (label && label !== 'Declarar' ? `${label};` : 'int x = 0;')
              }
            </div>
          </div>
        )}

        {/* ── PROCESO ── */}
        {isProcess && (
          <div className="ned-body">
            <div className="ned-section-title">Expresión de proceso</div>
            <div className="ned-row">
              <label>Código</label>
              <input
                ref={inputRef}
                placeholder={meta.hint || 'x = x + 1'}
                value={label === 'proceso' ? '' : label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-hint-txt">Variables ya declaradas: asignación, incremento, etc.</div>
            <div className="ned-preview">{label && label !== 'proceso' ? `${label.replace(/;+$/, '')};` : 'x = x + 1;'}</div>
          </div>
        )}

        {/* ── CONDICIÓN ── */}
        {isCond && (
          <div className="ned-body">
            <div className="ned-section-title">Condición (Rombo)</div>

            {/* Tipo de estructura */}
            <div className="ned-row">
              <label>Tipo</label>
              <div className="ned-toggle-group">
                <button
                  className={`ned-toggle ${loopType === 'if' ? 'active' : ''}`}
                  onClick={() => setLoopType('if')}
                  style={{ '--acc-color': '#fbbf24' }}
                >IF / ELSE</button>
                <button
                  className={`ned-toggle ${loopType === 'while' ? 'active' : ''}`}
                  onClick={() => setLoopType('while')}
                  style={{ '--acc-color': '#fb923c' }}
                >WHILE</button>
              </div>
            </div>

            <div className="ned-row">
              <label>Condición</label>
              <input
                ref={inputRef}
                placeholder={meta.hint || 'n >= 5'}
                value={expr === 'condición' || expr === 'condicion' ? '' : expr}
                onChange={e => setExpr(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>

            {/* Diagrama visual de SI/NO */}
            <div className="ned-branch-diagram">
              {loopType === 'if' ? (
                <>
                  <div className="ned-branch-row">
                    <div className="ned-branch-arrow si">
                      <span className="ned-branch-label si">✓ SI</span>
                      <span className="ned-branch-desc">→ Rama verdadera</span>
                    </div>
                    <div className="ned-branch-arrow no">
                      <span className="ned-branch-label no">✗ NO</span>
                      <span className="ned-branch-desc">→ Rama else / falsa</span>
                    </div>
                  </div>
                  <div className="ned-branch-hint">
                    Conecta la salida <strong style={{color:'#4ade80'}}>SI</strong> al bloque verdadero y <strong style={{color:'#f43f5e'}}>NO</strong> al bloque else.
                  </div>
                </>
              ) : (
                <>
                  <div className="ned-branch-row">
                    <div className="ned-branch-arrow si">
                      <span className="ned-branch-label si">↺ SI</span>
                      <span className="ned-branch-desc">→ Cuerpo del bucle</span>
                    </div>
                    <div className="ned-branch-arrow no">
                      <span className="ned-branch-label no">⇢ NO</span>
                      <span className="ned-branch-desc">→ Salida del bucle</span>
                    </div>
                  </div>
                  <div className="ned-branch-hint">
                    La rama <strong style={{color:'#4ade80'}}>SI</strong> regresa al rombo (forma el bucle), <strong style={{color:'#f43f5e'}}>NO</strong> sale.
                  </div>
                </>
              )}
            </div>

            <div className="ned-preview">
              {loopType === 'if'
                ? `if (${expr || 'condición'}) { ... } else { ... }`
                : `while (${expr || 'condición'}) { ... }`
              }
            </div>
          </div>
        )}

        {/* ── CICLO (hexágono) ── */}
        {isCiclo && (
          <div className="ned-body">
            <div className="ned-section-title">Ciclo While (Hexágono)</div>
            <div className="ned-row">
              <label>Condición</label>
              <input
                ref={inputRef}
                placeholder={meta.hint || 'n < 10'}
                value={expr === 'ciclo' ? '' : expr}
                onChange={e => setExpr(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-hint-txt">Conecta la salida hacia el cuerpo del bucle y luego de vuelta al hexágono.</div>
            <div className="ned-preview">{`while (${expr || 'condición'}) { ... }`}</div>
          </div>
        )}

        {/* ── I/O y PRINT ── */}
        {isIO && (
          <div className="ned-body">
            <div className="ned-section-title">
              {shape === 'print' ? 'Imprimir variable' : 'Entrada / Salida'}
            </div>
            <div className="ned-row">
              <label>{shape === 'print' ? 'Variable' : 'Acción'}</label>
              <input
                ref={inputRef}
                placeholder={meta.hint}
                value={label === 'I/O' || label === 'imprimir' || label === 'IMPRIMIR' ? '' : label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-hint-txt">
              {shape === 'print'
                ? 'Escribe el nombre de la variable a imprimir.'
                : 'Escribe: leer n  (para entrada) o el nombre de variable a mostrar.'
              }
            </div>
            <div className="ned-preview">{`println ${label || meta.hint || 'n'};`}</div>
          </div>
        )}

        {/* Footer */}
        <div className="ned-footer">
          <button className="ned-btn cancel" onClick={onClose}>CANCELAR</button>
          {!isFixed && (
            <button className="ned-btn save" onClick={handleSave}>
              <span>GUARDAR</span>
              <span className="ned-btn-hint">↵</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FlowNode
// ══════════════════════════════════════════════════════════════
export default function FlowNode({ id, data, selected }) {
  const shape    = data.shape ? (SHAPE_MAP[data.shape] || 'rect') : 'rect'
  const rawShape = data.shape || 'proceso'
  const meta     = NODE_META[rawShape] || { color: '#86efac', label: '?' }
  const isDiamond = shape === 'diamond'

  const [editing, setEditing] = useState(false)

  const handleSave = useCallback((newData) => {
    if (data.onUpdate) data.onUpdate(id, newData)
  }, [id, data])

  // Handles especiales para el diamante
  const sourceHandles = isDiamond
    ? [
        { pos: Position.Right,  id: 'si',  className: 'rf-handle rf-handle-si' },
        { pos: Position.Bottom, id: 'no',  className: 'rf-handle rf-handle-no' },
      ]
    : [
        { pos: Position.Bottom, id: 'out', className: 'rf-handle' },
        { pos: Position.Right,  id: 'outr',className: 'rf-handle' },
      ]

  return (
    <>
      <div
        className={`flow-node-wrap shape-${shape} ${selected ? 'selected' : ''}`}
        onDoubleClick={() => setEditing(true)}
        title="Doble clic para editar"
        style={{ '--node-color': meta.color }}
      >
        {/* Handles de entrada */}
        <Handle type="target" position={Position.Top}  id="in-top"  className="rf-handle" />
        <Handle type="target" position={Position.Left} id="in-left" className="rf-handle" />

        {/* Contenido */}
        <div className="flow-node-inner">
          <span className="flow-node-type" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="flow-node-label">
            {data.label || meta.label}
          </span>
        </div>

        {/* Etiquetas SI / NO en el diamante */}
        {isDiamond && (
          <>
            <span className="diamond-si-label">SI ✓</span>
            <span className="diamond-no-label">NO ✗</span>
          </>
        )}

        {/* Handles de salida */}
        {sourceHandles.map(h => (
          <Handle
            key={h.id}
            type="source"
            position={h.pos}
            id={h.id}
            className={h.className}
          />
        ))}

        {/* Icono de edición */}
        <div className="node-edit-hint" title="Doble clic para editar">✎</div>

        {/* Borde de color en la parte superior */}
        <div className="node-color-bar" style={{ background: meta.color }} />
      </div>

      {editing && (
        <NodeEditor
          nodeId={id}
          shape={rawShape}
          data={data}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
