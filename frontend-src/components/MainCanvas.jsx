import React, { useCallback, useState, useEffect, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  MarkerType,
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
    primaryBorderColor: '#a855f7', //#4ade80
    lineColor: '#4ade80', //
    secondaryColor: '#101a15',
    tertiaryColor: '#080d0a',
    edgeLabelBackground: '#080d0a',
    nodeTextColor: '#86efac',
    clusterBkg: '#080d0a',
    titleColor: '#86efac',
    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  }
})

const nodeTypes = { flowNode: FlowNode }

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
      'editor.background':            '#080d0a',
      'editor.foreground':            '#86efac',
      'editorLineNumber.foreground':  '#166534',
      'editorCursor.foreground':      '#7c3aed',
      'editor.selectionBackground':   '#4c1d9588',
      'editorIndentGuide.background': '#3a6a4838',
      'editor.lineHighlightBackground': '#3a6a4830',
    },
  })
}

const TABS = ['FLOWCHART', 'EDITOR']

export default function MainCanvas({ sourceCode, onCodeChange, mermaidCode }) {
  const [activeTab, setActiveTab] = useState('EDITOR')
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const mermaidRef = useRef(null)

  useEffect(() => {
    if (activeTab !== 'FLOWCHART' || !mermaidCode || !mermaidRef.current) return
    const el = mermaidRef.current
    el.removeAttribute('data-processed')
    el.innerHTML = mermaidCode
    mermaid.run({ nodes: [el] })
  }, [activeTab, mermaidCode])

  const onConnect = useCallback(params =>
    setEdges(eds => addEdge({
      ...params,
      style: { stroke: '#7c3aed', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
    }, eds)), [setEdges])

  const onDragOver = useCallback(e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault()
    const type = e.dataTransfer.getData('nodeType')
    if (!type) return
    const bounds = e.currentTarget.getBoundingClientRect()
    const position = { x: e.clientX - bounds.left - 60, y: e.clientY - bounds.top - 20 }
    setNodes(nds => [...nds, {
      id: `node-${Date.now()}`,
      type: 'flowNode',
      position,
      data: { label: type.toUpperCase(), shape: type },
    }])
  }, [setNodes])

  return (
    <div className="canvas-wrapper">
      <div className="canvas-tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`ctab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
        <span className="canvas-label-right">NONAME.CPP</span>
      </div>

      {activeTab === 'FLOWCHART' && (
        <div className="canvas-flow">
          {mermaidCode ? (
            <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '1rem', background: '#080d0a' }}>
              <div className="mermaid" ref={mermaidRef} />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes} edges={edges}
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
              <Controls style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 0 }} />
              <MiniMap style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)' }} nodeColor="#a855f744" maskColor="#080d0acc" />
            </ReactFlow>
          )}
        </div>
      )}

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