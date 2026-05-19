// flowData.js — Estado inicial del canvas React Flow
// Nodos de ejemplo: ciclo que imprime n de 0 a 4
import { MarkerType } from 'reactflow'

const edgeStyle = {
  style:     { stroke: '#7c3aed', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
}

const edgeStyleNo = {
  style:     { stroke: '#f43f5e', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f43f5e' },
  label:     'NO',
  labelStyle:   { fill: '#f43f5e', fontSize: 9, fontFamily: 'Courier New' },
  labelBgStyle: { fill: 'transparent' },
}

const edgeStyleSi = {
  ...edgeStyle,
  label:     'SI',
  labelStyle:   { fill: '#e8c84a', fontSize: 9, fontFamily: 'Courier New' },
  labelBgStyle: { fill: 'transparent' },
}

export const INITIAL_NODES = [
  {
    id:       'n-inicio',
    type:     'flowNode',
    position: { x: 160, y: 20 },
    data:     { label: 'INICIO', shape: 'inicio' },
  },
  {
    id:       'n-decl',
    type:     'flowNode',
    position: { x: 140, y: 110 },
    data: {
      label:    'int n = 0',
      shape:    'asignacion',
      varName:  'n',
      varType:  'Entero',
      varValue: '0',
    },
  },
  {
    id:       'n-cond',
    type:     'flowNode',
    position: { x: 133, y: 210 },
    data: {
      label: 'n >= 5',
      shape: 'condicion',
      expr:  'n >= 5',
    },
  },
  {
    id:       'n-print',
    type:     'flowNode',
    position: { x: 125, y: 320 },
    data: {
      label: 'imprimir n',
      shape: 'print',
      expr:  'n',
    },
  },
  {
    id:       'n-inc',
    type:     'flowNode',
    position: { x: 148, y: 420 },
    data: {
      label: 'n = n + 1',
      shape: 'proceso',
      expr:  'n = n + 1',
    },
  },
  {
    id:       'n-fin',
    type:     'flowNode',
    position: { x: 350, y: 210 },
    data:     { label: 'FIN', shape: 'fin' },
  },
]

export const INITIAL_EDGES = [
  { id: 'e1', source: 'n-inicio', target: 'n-decl',  ...edgeStyle },
  { id: 'e2', source: 'n-decl',  target: 'n-cond',   ...edgeStyle },
  { id: 'e3', source: 'n-cond',  target: 'n-fin',    ...edgeStyleSi },
  { id: 'e4', source: 'n-cond',  target: 'n-print',  ...edgeStyleNo },
  { id: 'e5', source: 'n-print', target: 'n-inc',    ...edgeStyle },
  {
    id:     'e6-loop',
    source: 'n-inc',
    target: 'n-cond',
    type:   'smoothstep',
    style:  { stroke: '#7c3aed55', strokeWidth: 1, strokeDasharray: '4 3' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed55' },
    label:          'loop',
    labelStyle:     { fill: '#4a5568', fontSize: 8, fontFamily: 'Courier New' },
    labelBgStyle:   { fill: 'transparent' },
  },
]
