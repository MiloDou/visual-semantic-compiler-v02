//=============================================================================
// FlowNode.jsx — Nodo personalizado del canvas React Flow
//
// Cada nodo soporta una forma visual diferente según su tipo de diagrama:
//   inicio/fin   → oval       (borde redondeado)
//   proceso      → rectángulo
//   condicion    → rombo      (clip-path diamond)
//   io/print     → paralelogramo
//   ciclo        → hexágono
//   asignacion   → rectángulo (variante de proceso con declaración de tipo)
//
// Interacción:
//   • Doble clic en el nodo  → abre NodeEditor (modal)
//   • NodeEditor guarda datos via data.onUpdate() callback
//   • El callback es inyectado por MainCanvas a través de nodesWithCallbacks
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

// Etiquetas de tipo por forma de nodo
const NODE_META = {
  inicio:     { color: '#4ade80', label: 'INICIO',    hint: null },
  fin:        { color: '#4ade80', label: 'FIN',       hint: null },
  proceso:    { color: '#a5f3fc', label: 'PROCESO',   hint: 'Ej: x = x + 1' },
  condicion:  { color: '#fbbf24', label: 'CONDICION', hint: 'Ej: n >= 5' },
  io:         { color: '#c084fc', label: 'I/O',       hint: 'Ej: leer n  |  imprimir n' },
  ciclo:      { color: '#fb923c', label: 'CICLO',     hint: 'Ej: mientras n < 10' },
  asignacion: { color: '#a5f3fc', label: 'ASIGNACION',hint: 'Ej: int x = 0' },
  print:      { color: '#c084fc', label: 'PRINT',     hint: 'Ej: imprimir resultado' },
}

const TIPOS = ['Entero', 'Flotante']

// ── Editor Modal ───────────────────────────────────────────────────────────
function NodeEditor({ nodeId, shape, data, onSave, onClose }) {
  const [label, setLabel]       = useState(data.label || '')
  const [varName, setVarName]   = useState(data.varName || '')
  const [varType, setVarType]   = useState(data.varType || 'Entero')
  const [varValue, setVarValue] = useState(data.varValue || '')
  const [expr, setExpr]         = useState(data.expr || '')
  const inputRef = useRef(null)
  const meta = NODE_META[shape] || { color: '#86efac', hint: null }

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = useCallback(() => {
    // eslint-disable-next-line no-unused-vars
    const { onUpdate, ...cleanData } = data  // strip the callback before building newData
    const newData = { ...cleanData, shape }
    if (shape === 'inicio' || shape === 'fin') {
      newData.label = meta.label
    } else if (shape === 'asignacion' || shape === 'proceso') {
      newData.label    = label || (varName ? `${varType === 'Entero' ? 'int' : 'float'} ${varName}${varValue ? ` = ${varValue}` : ''}` : 'proceso')
      newData.varName  = varName
      newData.varType  = varType
      newData.varValue = varValue
      newData.expr     = expr
    } else if (shape === 'condicion') {
      newData.label = expr || 'condición'
      newData.expr  = expr
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
  }, [label, varName, varType, varValue, expr, shape, data, meta, onSave, onClose])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onClose()
  }

  const isFixed   = shape === 'inicio' || shape === 'fin'
  const isDecl    = shape === 'asignacion'
  const isProcess = shape === 'proceso'
  const isExprOnly = shape === 'condicion' || shape === 'ciclo'
  const isIO      = shape === 'io' || shape === 'print'

  return (
    <div className="node-editor-overlay" onClick={onClose}>
      <div className="node-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="node-editor-header" style={{ borderLeftColor: meta.color }}>
          <span className="ned-type" style={{ color: meta.color }}>{meta.label}</span>
          <span className="ned-id">#{nodeId.slice(-4)}</span>
          <button className="ned-close" onClick={onClose}>✕</button>
        </div>

        {isFixed && (
          <div className="ned-body">
            <p className="ned-hint">Nodo fijo — no requiere configuración.</p>
          </div>
        )}

        {isDecl && (
          <div className="ned-body">
            <div className="ned-row">
              <label>Tipo</label>
              <select value={varType} onChange={e => setVarType(e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ned-row">
              <label>Variable</label>
              <input
                ref={inputRef}
                placeholder="nombre"
                value={varName}
                onChange={e => setVarName(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-row">
              <label>Valor inicial</label>
              <input
                placeholder="0"
                value={varValue}
                onChange={e => setVarValue(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-hint-txt">Ej: Entero x = 5</div>
          </div>
        )}

        {isProcess && (
          <div className="ned-body">
            <div className="ned-row">
              <label>Expresión</label>
              <input
                ref={inputRef}
                placeholder={meta.hint || 'x = x + 1'}
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            <div className="ned-hint-txt">Usa variables ya declaradas</div>
          </div>
        )}

        {isExprOnly && (
          <div className="ned-body">
            <div className="ned-row">
              <label>Condición</label>
              <input
                ref={inputRef}
                placeholder={meta.hint || 'expr'}
                value={expr}
                onChange={e => setExpr(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
            {shape === 'condicion' && <div className="ned-hint-txt">↓ NO &nbsp; → SI</div>}
            {shape === 'ciclo'     && <div className="ned-hint-txt">Condición de continuación del ciclo</div>}
          </div>
        )}

        {isIO && (
          <div className="ned-body">
            <div className="ned-row">
              <label>{shape === 'print' ? 'Variable a imprimir' : 'Acción I/O'}</label>
              <input
                ref={inputRef}
                placeholder={meta.hint}
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
          </div>
        )}

        <div className="ned-footer">
          <button className="ned-btn cancel" onClick={onClose}>CANCELAR</button>
          <button className="ned-btn save" onClick={handleSave}>GUARDAR</button>
        </div>
      </div>
    </div>
  )
}

// ── FlowNode ───────────────────────────────────────────────────────────────
export default function FlowNode({ id, data, selected }) {
  const shape   = data.shape ? (SHAPE_MAP[data.shape] || 'rect') : 'rect'
  const rawShape = data.shape || 'proceso'
  const meta    = NODE_META[rawShape] || { color: '#86efac', label: '?' }
  const isDiamond = shape === 'diamond'

  const [editing, setEditing] = useState(false)

  // Actualiza data via callback pasado desde MainCanvas
  const handleSave = useCallback((newData) => {
    if (data.onUpdate) data.onUpdate(id, newData)
  }, [id, data])

  return (
    <>
      <div
        className={`flow-node-wrap shape-${shape} ${selected ? 'selected' : ''}`}
        onDoubleClick={() => setEditing(true)}
        title="Doble clic para editar"
      >
        <Handle type="target" position={Position.Top}    className="rf-handle" />
        <Handle type="target" position={Position.Left}   className="rf-handle" />

        <div className="flow-node-inner">
          <span className="flow-node-type" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="flow-node-label">{data.label || meta.label}</span>
        </div>

        <Handle type="source" position={Position.Bottom} className="rf-handle" />
        <Handle type="source" position={Position.Right}  className="rf-handle" />

        {isDiamond && (
          <>
            <span className="edge-label si-label">SI</span>
            <span className="edge-label no-label">NO</span>
          </>
        )}

        <div className="node-edit-hint">✎</div>
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
