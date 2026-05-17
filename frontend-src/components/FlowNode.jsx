import React from 'react'
import { Handle, Position } from 'reactflow'
import './FlowNode.css'

const SHAPE_MAP = {
  inicio:    'oval',
  fin:       'oval',
  proceso:   'rect',
  condicion: 'diamond',
  io:        'parallelogram',
  ciclo:     'hexagon',
  asignacion:'rect',
  print:     'parallelogram',
}

export default function FlowNode({ data, selected }) {
  const shape = data.shape ? (SHAPE_MAP[data.shape] || 'rect') : 'rect'
  const isDiamond = shape === 'diamond'

  return (
    <div className={`flow-node-wrap shape-${shape} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top}    className="rf-handle" />
      <Handle type="target" position={Position.Left}   className="rf-handle" />
      <span className="flow-node-label">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="rf-handle" />
      <Handle type="source" position={Position.Right}  className="rf-handle" />
      {isDiamond && (
        <>
          <span className="edge-label si-label">SI</span>
          <span className="edge-label no-label">NO</span>
        </>
      )}
    </div>
  )
}
