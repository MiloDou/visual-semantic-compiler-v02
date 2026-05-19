//=============================================================================
// MainCanvas.jsx — Área de trabajo central del IDE
//
// Contiene tres pestañas:
//   FLOWCHART → Canvas interactivo React Flow (arrastrar/soltar/conectar nodos)
//   MERMAID   → Render del diagrama Mermaid generado por el backend
//   EDITOR    → Editor de código Monaco (lenguaje C-like)
//
// Responsabilidades clave:
//   • Gestión del estado de nodos y aristas (useNodesState / useEdgesState)
//   • Inyección del callback onUpdate en cada nodo (para edición inline)
//   • Serialización del canvas a JSON via serializeFlowToJSON()
//   • Registro del serializador en App.jsx via onSerialize prop
//=============================================================================
import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  MarkerType, Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import Editor from '@monaco-editor/react'
import mermaid from 'mermaid'
import './MainCanvas.css'
import { INITIAL_NODES, INITIAL_EDGES } from '../data/flowData.js'
import FlowNode from './FlowNode.jsx'

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#0c1210',
    primaryTextColor: '#86efac',
    primaryBorderColor: '#a855f7',
    lineColor: '#4ade80',
    secondaryColor: '#101a15',
    tertiaryColor: '#080d0a',
    edgeLabelBackground: '#080d0a',
    nodeTextColor: '#86efac',
    clusterBkg: '#080d0a',
    titleColor: '#86efac',
    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  }
})

const MONACO_OPTS = {
  fontSize: 13,
  fontFamily: "'Courier New', monospace",
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  glyphMargin: false,
  folding: false,
  padding: { top: 8, bottom: 8 },
  scrollbar: { verticalScrollbarSize: 4 },
  theme: 'cyber',
}

function beforeMount(monaco) {
  monaco.editor.defineTheme('cyber', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',   foreground: 'c084fc', fontStyle: 'bold' },
      { token: 'type',      foreground: '4ade80' },
      { token: 'string',    foreground: 'f0abfc' },
      { token: 'number',    foreground: 'a5f3fc' },
      { token: 'comment',   foreground: '166534', fontStyle: 'italic' },
      { token: 'delimiter', foreground: '86efac' },
    ],
    colors: {
      'editor.background':              '#080d0a',
      'editor.foreground':              '#86efac',
      'editorLineNumber.foreground':    '#166534',
      'editorCursor.foreground':        '#7c3aed',
      'editor.selectionBackground':     '#4c1d9588',
      'editorIndentGuide.background':   '#3a6a4838',
      'editor.lineHighlightBackground': '#3a6a4830',
    },
  })
}

// Tabs del canvas principal
const MAIN_TABS = ['FLOWCHART', 'MERMAID', 'EDITOR']

/**
 * Serializa el estado actual del canvas React Flow en un objeto JSON
 * estructurado listo para enviarse al endpoint /api/compilar_diagrama.
 *
 * Formato resultante:
 * {
 *   version: '1.0',
 *   nodes:   [{ id, type, label, varName, varType, varValue, expr, position }],
 *   edges:   [{ id, source, target, label }]
 * }
 *
 * @param {import('reactflow').Node[]} nodes - Nodos actuales del canvas
 * @param {import('reactflow').Edge[]} edges - Aristas actuales del canvas
 * @returns {{ version: string, nodes: object[], edges: object[] }}
 */
export function serializeFlowToJSON(nodes, edges) {
  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = n })

  const adjOut = {}  // nodo → [{ target, label }]
  edges.forEach(e => {
    if (!adjOut[e.source]) adjOut[e.source] = []
    adjOut[e.source].push({ target: e.target, label: e.label || '' })
  })

  const serializedNodes = nodes.map(n => ({
    id:       n.id,
    type:     n.data.shape || 'proceso',
    label:    n.data.label || '',
    varName:  n.data.varName  || null,
    varType:  n.data.varType  || null,
    varValue: n.data.varValue || null,
    expr:     n.data.expr     || null,
    position: n.position,
  }))

  const serializedEdges = edges.map(e => ({
    id:     e.id,
    source: e.source,
    target: e.target,
    label:  e.label || '',
  }))

  return {
    version: '1.0',
    nodes:   serializedNodes,
    edges:   serializedEdges,
  }
}

/**
 * MainCanvas — Componente del área de trabajo central.
 *
 * @param {object}   props
 * @param {string}   props.sourceCode   - Código fuente del editor de texto
 * @param {Function} props.onCodeChange - Callback al editar el código fuente
 * @param {string}   props.mermaidCode  - Sintaxis Mermaid recibida del backend
 * @param {object}   props.mermaidSvgRef- Ref para acceder al SVG de Mermaid (export)
 * @param {Function} props.onSerialize  - Recibe la fn serializadora del canvas
 */
export default function MainCanvas({
  sourceCode, onCodeChange,
  mermaidCode, mermaidSvgRef,
  onSerialize,
  onFlowChange,
  externalFlow,
  onFlowInteraction
}) {
  const [activeTab,  setActiveTab]  = useState('EDITOR')
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [nodeCount, setNodeCount] = useState(INITIAL_NODES.length)
  const mermaidRef = useRef(null)

  // Registra la función serializar en App.jsx para usarla al compilar
  useEffect(() => {
    if (onSerialize) {
      onSerialize(() => serializeFlowToJSON(nodes, edges))
    }
  }, [nodes, edges, onSerialize])

  // Sincronización en tiempo real con App.jsx para generar código
  useEffect(() => {
    if (onFlowChange) {
      onFlowChange(nodes, edges)
    }
  }, [nodes, edges, onFlowChange])

  // Inyectar flujo externo (cuando el Editor es la fuente de verdad)
  useEffect(() => {
    if (externalFlow) {
      setNodes(externalFlow.nodes || [])
      setEdges(externalFlow.edges || [])
      setNodeCount((externalFlow.nodes || []).length)
    }
  }, [externalFlow, setNodes, setEdges])

  // Render mermaid al cambiar de tab
  useEffect(() => {
    if (activeTab !== 'MERMAID' || !mermaidCode || !mermaidRef.current) return
    const el = mermaidRef.current
    el.removeAttribute('data-processed')
    el.innerHTML = mermaidCode
    mermaid.run({ nodes: [el] })
  }, [activeTab, mermaidCode])

  // Actualización de datos de un nodo desde el editor interno
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...newData, onUpdate: n.data.onUpdate } }
        : n
    ))
  }, [setNodes])

  // Inyecta onUpdate en cada nodo para que el editor pueda hacer callback
  const nodesWithCallbacks = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: { ...n.data, onUpdate: updateNodeData }
    })),
  [nodes, updateNodeData])

  const nodeTypes = useMemo(() => ({ flowNode: FlowNode }), [])

  const onConnect = useCallback(params =>
    setEdges(eds => addEdge({
      ...params,
      style:     { stroke: '#7c3aed', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
    }, eds)),
  [setEdges])

  const onDragOver = useCallback(e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault()
    const type = e.dataTransfer.getData('nodeType')
    if (!type) return
    const bounds   = e.currentTarget.getBoundingClientRect()
    const position = { x: e.clientX - bounds.left - 60, y: e.clientY - bounds.top - 24 }
    const newId    = `node-${Date.now()}`

    const DEFAULT_LABELS = {
      inicio:     'INICIO',
      fin:        'FIN',
      proceso:    'proceso',
      condicion:  'condición',
      io:         'I/O',
      ciclo:      'ciclo',
      asignacion: 'declarar',
      print:      'imprimir',
    }

    setNodes(nds => [...nds, {
      id:       newId,
      type:     'flowNode',
      position,
      data: {
        label:  DEFAULT_LABELS[type] || type.toUpperCase(),
        shape:  type,
      },
    }])
    setNodeCount(c => c + 1)
  }, [setNodes])

  // Limpiar lienzo
  const handleClear = useCallback(() => {
    if (!window.confirm('¿Borrar todos los nodos y conexiones?')) return
    setNodes([])
    setEdges([])
    setNodeCount(0)
  }, [setNodes, setEdges])

  // Eliminar elemento(s) seleccionado(s)
  const handleDeleteSelected = useCallback(() => {
    setNodes(nds => nds.filter(n => !n.selected))
    setEdges(eds => eds.filter(e => !e.selected))
  }, [setNodes, setEdges])

  return (
    <div className="canvas-wrapper">
      {/* ── Tab bar ── */}
      <div className="canvas-tabs">
        {MAIN_TABS.map(t => (
          <button
            key={t}
            className={`ctab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
        <span className="canvas-label-right">
          {activeTab === 'FLOWCHART'
            ? `${nodeCount} NODO${nodeCount !== 1 ? 'S' : ''}`
            : 'NONAME.CPP'}
        </span>
      </div>

      {/* ════ FLOWCHART ════ */}
      {activeTab === 'FLOWCHART' && (
        <div className="canvas-flow" onMouseDown={onFlowInteraction}>
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            style={{ background: 'transparent' }}
          >
            <Background color="#ffffff08" gap={22} size={1} />
            <Controls style={{
              background: 'var(--bg2)',
              border: '1px solid var(--bdr)',
              borderRadius: 0,
            }} />
            <MiniMap
              style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)' }}
              nodeColor="#a855f744"
              maskColor="#080d0acc"
            />

            {/* Panel de ayuda contextual */}
            <Panel position="top-right">
              <div className="flow-help-panel">
                <span>✎ doble clic = editar</span>
                <span>⌦ Del = eliminar</span>
                <button className="flow-clear-btn" onClick={handleDeleteSelected} style={{ color: '#f43f5e', borderColor: '#f43f5e', marginRight: '8px' }}>
                  🗑️ ELIMINAR
                </button>
                <button className="flow-clear-btn" onClick={handleClear}>
                  ✕ LIMPIAR
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      )}

      {/* ════ MERMAID VIEWER ════ */}
      {activeTab === 'MERMAID' && (
        <div className="canvas-flow">
          {mermaidCode ? (
            <div style={{
              width: '100%', height: '100%',
              overflow: 'auto', padding: '1.5rem',
              background: '#080d0a',
            }}>
              <div className="mermaid" ref={el => {
                mermaidRef.current = el
                if (mermaidSvgRef) mermaidSvgRef.current = el
              }} />
            </div>
          ) : (
            <div className="mermaid-empty">
              <span>No hay diagrama Mermaid.</span>
              <small>Compila un diagrama desde la pestaña FLOWCHART para ver el grafo aquí.</small>
            </div>
          )}
        </div>
      )}

      {/* ════ EDITOR ════ */}
      {activeTab === 'EDITOR' && (
        <div className="canvas-editor">
          <Editor
            height="100%"
            language="cpp"
            value={sourceCode}
            onChange={v => onCodeChange(v || '')}
            theme="cyber"
            beforeMount={beforeMount}
            options={MONACO_OPTS}
          />
        </div>
      )}
    </div>
  )
}