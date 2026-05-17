import { MarkerType } from 'reactflow'

const edgeStyle = {
  style: { stroke: '#7c3aed', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
}

const edgeStyleRed = {
  style: { stroke: '#f43f5e', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f43f5e' },
  label: 'NO',
  labelStyle: { fill: '#f43f5e', fontSize: 9, fontFamily: 'Courier New' },
  labelBgStyle: { fill: 'transparent' },
}

export const INITIAL_NODES = [
  {
    id: 'n-inicio',
    type: 'flowNode',
    position: { x: 160, y: 20 },
    data: { label: 'INICIO', shape: 'inicio' },
  },
  {
    id: 'n-asig',
    type: 'flowNode',
    position: { x: 148, y: 110 },
    data: { label: 'int n = 0', shape: 'asignacion' },
  },
  {
    id: 'n-cond',
    type: 'flowNode',
    position: { x: 140, y: 200 },
    data: { label: 'n >= 5', shape: 'condicion' },
  },
  {
    id: 'n-fin',
    type: 'flowNode',
    position: { x: 340, y: 205 },
    data: { label: 'FIN', shape: 'fin' },
  },
  {
    id: 'n-print',
    type: 'flowNode',
    position: { x: 136, y: 310 },
    data: { label: 'print n', shape: 'print' },
  },
  {
    id: 'n-inc',
    type: 'flowNode',
    position: { x: 158, y: 400 },
    data: { label: 'n++', shape: 'proceso' },
  },
]

export const INITIAL_EDGES = [
  { id: 'e1', source: 'n-inicio', target: 'n-asig',  ...edgeStyle },
  { id: 'e2', source: 'n-asig',  target: 'n-cond',   ...edgeStyle },
  {
    id: 'e3-si',
    source: 'n-cond', target: 'n-fin',
    sourceHandle: null,
    label: 'SI',
    labelStyle: { fill: '#e8c84a', fontSize: 9, fontFamily: 'Courier New' },
    labelBgStyle: { fill: 'transparent' },
    ...edgeStyle,
  },
  { id: 'e4-no', source: 'n-cond',  target: 'n-print', ...edgeStyleRed },
  { id: 'e5',    source: 'n-print', target: 'n-inc',   ...edgeStyle },
  {
    id: 'e6-loop',
    source: 'n-inc',
    target: 'n-cond',
    type: 'smoothstep',
    style: { stroke: '#7c3aed55', strokeWidth: 1, strokeDasharray: '4 3' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed55' },
    label: 'loop',
    labelStyle: { fill: '#4a5568', fontSize: 8, fontFamily: 'Courier New' },
    labelBgStyle: { fill: 'transparent' },
  },
]
