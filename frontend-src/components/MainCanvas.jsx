//=============================================================================
// MainCanvas.jsx — Área de trabajo central del IDE
//
// Pestañas:
//   FLOWCHART → Canvas interactivo React Flow
//   MERMAID   → Render del diagrama Mermaid
//   EDITOR    → Editor de código Monaco
//
// Mejoras v2:
//   • Botones ELIMINAR / LIMPIAR con animaciones y confirmación visual
//   • SnapGrid configurable (botón en panel)
//   • Etiquetas SI/NO en aristas de condición más visibles
//   • Toolbar flotante con acciones rápidas
//=============================================================================
import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  MarkerType, Panel, BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import Editor from '@monaco-editor/react'
import mermaid from 'mermaid'
import './MainCanvas.css'
import { INITIAL_NODES, INITIAL_EDGES, FACTORIAL_NODES, FACTORIAL_EDGES } from '../data/flowData.js'
import FlowNode from './FlowNode.jsx'


mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor:       '#0c1210',
    primaryTextColor:   '#86efac',
    primaryBorderColor: '#a855f7',
    lineColor:          '#4ade80',
    secondaryColor:     '#101a15',
    tertiaryColor:      '#080d0a',
    edgeLabelBackground:'#080d0a',
    nodeTextColor:      '#86efac',
    clusterBkg:         '#080d0a',
    titleColor:         '#86efac',
    fontFamily:         "'Share Tech Mono', 'Courier New', monospace",
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

const MAIN_TABS = ['FLOWCHART', 'MERMAID', 'EDITOR']

/**
 * Serializa el estado actual del canvas React Flow en JSON estructurado.
 */
export function serializeFlowToJSON(nodes, edges) {
  const serializedNodes = nodes.map(n => ({
    id:       n.id,
    type:     n.data.shape || 'proceso',
    label:    n.data.label || '',
    varName:  n.data.varName  || null,
    varType:  n.data.varType  || null,
    varValue: n.data.varValue || null,
    expr:     n.data.expr     || null,
    loopType: n.data.loopType || null,
    position: n.position,
  }))

  const serializedEdges = edges.map(e => ({
    id:     e.id,
    source: e.source,
    target: e.target,
    label:  e.label || '',
    sourceHandle: e.sourceHandle || null,
  }))

  return { version: '1.0', nodes: serializedNodes, edges: serializedEdges }
}

// Estilos de arista según tipo
const makeEdgeStyle = (label) => {
  if (label === 'SI') return {
    style:        { stroke: '#4ade80', strokeWidth: 2.5 },
    markerEnd:    { type: MarkerType.ArrowClosed, color: '#4ade80' },
    label:        '✔ SI',
    labelStyle:   { fill: '#4ade80', fontSize: 13, fontWeight: 900, fontFamily: 'Courier New', transform: 'translate(0, -12px)' },
    labelBgStyle: { fill: '#0a1a11', strokeWidth: 1.5, stroke: '#4ade80', rx: 4, ry: 4, transform: 'translate(0, -12px)' },
    labelBgPadding: [6, 8],
  }
  if (label === 'NO') return {
    style:        { stroke: '#f43f5e', strokeWidth: 2.5 },
    markerEnd:    { type: MarkerType.ArrowClosed, color: '#f43f5e' },
    label:        '✖ NO',
    labelStyle:   { fill: '#f43f5e', fontSize: 13, fontWeight: 900, fontFamily: 'Courier New', transform: 'translate(0, -12px)' },
    labelBgStyle: { fill: '#1f0d11', strokeWidth: 1.5, stroke: '#f43f5e', rx: 4, ry: 4, transform: 'translate(0, -12px)' },
    labelBgPadding: [6, 8],
  }
  return {
    style:     { stroke: '#7c3aed', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
  }
}

/**
 * MainCanvas — Componente del área de trabajo central.
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
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [deleteAnim, setDeleteAnim] = useState(false)
  const [clearAnim,  setClearAnim]  = useState(false)
  const mermaidRef = useRef(null)

  // Registra la función serializar en App.jsx
  useEffect(() => {
    if (onSerialize) onSerialize(() => serializeFlowToJSON(nodes, edges))
  }, [nodes, edges, onSerialize])

  // Sincronización en tiempo real con App.jsx
  useEffect(() => {
    if (onFlowChange) onFlowChange(nodes, edges)
  }, [nodes, edges, onFlowChange])

  // Inyectar flujo externo
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

  // Inyecta onUpdate en cada nodo
  const nodesWithCallbacks = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: { ...n.data, onUpdate: updateNodeData }
    })),
  [nodes, updateNodeData])

  const nodeTypes = useMemo(() => ({ flowNode: FlowNode }), [])

  // ── Conexión de aristas ───────────────────────────────────────────────────
  const onConnect = useCallback(params => {
    setEdges(eds => {
      const sourceNode = nodes.find(n => n.id === params.source)
      const isCond = sourceNode && sourceNode.data.shape === 'condicion'
      const existingOuts = eds.filter(e => e.source === params.source)

      let label = ''
      if (isCond) {
        // Si viene del handle 'si' → etiqueta SI, si viene del 'no' → NO
        if (params.sourceHandle === 'si') {
          label = 'SI'
        } else if (params.sourceHandle === 'no') {
          label = 'NO'
        } else {
          // Auto-detectar: primera conexión = SI, segunda = NO
          const hasSi = existingOuts.some(e => e.label === 'SI')
          label = hasSi ? 'NO' : 'SI'
        }
      }

      const edgeStyle = makeEdgeStyle(label)
      const newEdge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        ...edgeStyle,
        type: 'smoothstep',
        animated: false,
      }

      return addEdge(newEdge, eds)
    })
  }, [setEdges, nodes])

  // ── Doble clic en arista → alternar SI/NO ─────────────────────────────────
  const onEdgeDoubleClick = useCallback((e, edge) => {
    setEdges(eds => eds.map(ed => {
      if (ed.id !== edge.id) return ed
      const newLabel = ed.label === 'SI' ? 'NO' : ed.label === 'NO' ? 'SI' : ed.label
      return { ...ed, ...makeEdgeStyle(newLabel) }
    }))
  }, [setEdges])

  // ── Drag & drop desde sidebar ──────────────────────────────────────────────
  const onDragOver = useCallback(e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault()
    const type = e.dataTransfer.getData('nodeType')
    if (!type) return
    const bounds   = e.currentTarget.getBoundingClientRect()
    const position = {
      x: e.clientX - bounds.left - 65,
      y: e.clientY - bounds.top  - 26,
    }
    const newId = `node-${Date.now()}`

    const DEFAULT_LABELS = {
      inicio:     'INICIO',
      fin:        'FIN',
      proceso:    'proceso',
      condicion:  'condición',
      io:         'I/O',
      ciclo:      'ciclo',
      asignacion: 'Declarar',
      print:      'imprimir',
    }

    setNodes(nds => [...nds, {
      id:   newId,
      type: 'flowNode',
      position,
      data: {
        label: DEFAULT_LABELS[type] || type.toUpperCase(),
        shape: type,
      },
    }])
    setNodeCount(c => c + 1)
  }, [setNodes])

  // ── Eliminar seleccionados ─────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected)
    const selectedEdges = edges.filter(e => e.selected)
    if (!selectedNodes.length && !selectedEdges.length) return

    setDeleteAnim(true)
    setTimeout(() => setDeleteAnim(false), 600)

    setNodes(nds => nds.filter(n => !n.selected))
    setEdges(eds => eds.filter(e => !e.selected))
    setNodeCount(c => Math.max(0, c - selectedNodes.length))
  }, [nodes, edges, setNodes, setEdges])

  // ── Limpiar todo ───────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    // Confirmación visual sin alert del navegador
    setClearAnim(true)
    setTimeout(() => {
      setClearAnim(false)
      setNodes([])
      setEdges([])
      setNodeCount(0)
    }, 300)
  }, [setNodes, setEdges])

  const [clearConfirm, setClearConfirm] = useState(false)

  const handleClearClick = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true)
      setTimeout(() => setClearConfirm(false), 3000)
    } else {
      setClearConfirm(false)
      handleClear()
    }
  }, [clearConfirm, handleClear])

  // ── Cargar diagrama factorial ──────────────────────────────────────────
  const handleLoadFactorial = useCallback(() => {
    const factNodes = FACTORIAL_NODES.map(n => ({
      ...n,
      data: { ...n.data, onUpdate: updateNodeData },
    }))
    setNodes(factNodes)
    setEdges(FACTORIAL_EDGES)
    setNodeCount(FACTORIAL_NODES.length)
  }, [setNodes, setEdges, updateNodeData])


  // Tecla Delete para eliminar seleccionados
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Solo si no hay un input/textarea enfocado
        if (document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA') return
        handleDeleteSelected()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleDeleteSelected])

  // Contar seleccionados
  const selectedCount = nodes.filter(n => n.selected).length + edges.filter(e => e.selected).length

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
            {t === 'FLOWCHART' && '⬡ '}
            {t === 'MERMAID'   && '◈ '}
            {t === 'EDITOR'    && '{ '}
            {t}
            {t === 'EDITOR' && ' }'}
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
            onEdgeDoubleClick={onEdgeDoubleClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            snapToGrid={snapEnabled}
            snapGrid={[16, 16]}
            fitView
            deleteKeyCode={null}  /* manejamos con keydown propio */
            connectionLineStyle={{ stroke: '#7c3aed', strokeWidth: 1.5 }}
            connectionLineType="smoothstep"
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Lines}
              color="#a855f733"
              gap={24}
              lineWidth={1}
            />
            <Controls style={{
              background: 'var(--bg2)',
              border: '1px solid var(--bdr)',
              borderRadius: 4,
            }} />
            <MiniMap
              style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 4 }}
              nodeColor="#a855f744"
              maskColor="#080d0acc"
            />

            {/* ── Toolbar flotante (top-right) ── */}
            <Panel position="top-right">
              <div className="flow-toolbar">



                {/* Eliminar seleccionados */}
                <button
                  className={`flow-tool-btn delete-btn ${deleteAnim ? 'anim' : ''} ${selectedCount > 0 ? 'has-selection' : ''}`}
                  onClick={handleDeleteSelected}
                  title={selectedCount > 0 ? `Eliminar ${selectedCount} elemento(s) seleccionado(s)` : 'Selecciona nodos o aristas primero'}
                >
                  <span className="ftb-icon">🗑</span>
                  <span className="ftb-label">
                    ELIMINAR{selectedCount > 0 ? ` (${selectedCount})` : ''}
                  </span>
                </button>

                {/* Limpiar todo */}
                <button
                  className={`flow-tool-btn clear-btn ${clearConfirm ? 'confirm' : ''} ${clearAnim ? 'anim' : ''}`}
                  onClick={handleClearClick}
                  title={clearConfirm ? '⚠ Click de nuevo para confirmar borrado total' : 'Limpiar todo el canvas'}
                >
                  <span className="ftb-icon">{clearConfirm ? '⚠' : '✕'}</span>
                  <span className="ftb-label">
                    {clearConfirm ? '¿CONFIRMAR?' : 'LIMPIAR'}
                  </span>
                </button>
              </div>
            </Panel>

            {/* ── Leyenda inferior ── */}
            <Panel position="bottom-left">
              <div className="flow-legend">
                <span className="legend-item">
                  <span className="legend-dot" style={{background:'#4ade80'}}/>SI
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{background:'#f43f5e'}}/>NO
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{background:'#7c3aed'}}/>Flujo
                </span>
                <span className="legend-sep">•</span>
                <span>✎ doble clic = editar</span>
                <span>⌦ Del = eliminar</span>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      )}

      {/* ════ MERMAID ════ */}
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
              <span>◈</span>
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