// flowData.js — Estado inicial del canvas React Flow
import { MarkerType } from 'reactflow'

const edgeStyle = {
  style:     { stroke: '#7c3aed', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
  type: 'smoothstep',
}

const edgeNo = {
  style:        { stroke: '#f43f5e', strokeWidth: 2 },
  markerEnd:    { type: MarkerType.ArrowClosed, color: '#f43f5e' },
  label:        'NO',
  labelStyle:   { fill: '#f43f5e', fontSize: 10, fontWeight: 700, fontFamily: 'Courier New' },
  labelBgStyle: { fill: 'rgba(244,63,94,0.12)', strokeWidth: 0 },
  labelBgPadding: [4, 6],
  type: 'smoothstep',
}

const edgeSi = {
  style:        { stroke: '#4ade80', strokeWidth: 2 },
  markerEnd:    { type: MarkerType.ArrowClosed, color: '#4ade80' },
  label:        'SI',
  labelStyle:   { fill: '#4ade80', fontSize: 10, fontWeight: 700, fontFamily: 'Courier New' },
  labelBgStyle: { fill: 'rgba(74,222,128,0.12)', strokeWidth: 0 },
  labelBgPadding: [4, 6],
  type: 'smoothstep',
}

export const INITIAL_NODES = []
export const INITIAL_EDGES = []

// ── Diagrama preconstruido: Cálculo del Factorial ──────────────────────────────
//
//  INICIO
//    ↓
//  [I/O] "Ingrese un numero entero positivo"   ← println (salida)
//    ↓
//  [I/O] "leer n"                              ← scanf (entrada)
//    ↓
//  [DECL] int resultado = 1
//    ↓
//  [DECL] int i = 1
//    ↓
//  ◇ i <= n   (WHILE: SI→cuerpo, NO→salida)
//    ↓ SI
//  [PROC] resultado = resultado * i
//    ↓
//  [PROC] i = i + 1
//    ↓ (vuelve al rombo)
//    ↓ NO
//  [PRINT] resultado
//    ↓
//  FIN
//

export const FACTORIAL_NODES = [
  {
    id: 'f-inicio',
    type: 'flowNode',
    position: { x: 300, y: 30 },
    data: { shape: 'inicio', label: 'INICIO' },
  },
  {
    id: 'f-prompt',
    type: 'flowNode',
    position: { x: 300, y: 130 },
    data: {
      shape: 'io',
      label: '"Ingrese un numero entero positivo"',
      expr:  '"Ingrese un numero entero positivo"',
    },
  },
  {
    id: 'f-leer',
    type: 'flowNode',
    position: { x: 300, y: 240 },
    data: {
      shape: 'io',
      label: 'leer n',
      expr:  'leer n',
    },
  },
  {
    id: 'f-decl-res',
    type: 'flowNode',
    position: { x: 300, y: 350 },
    data: {
      shape:    'asignacion',
      label:    'int resultado = 1',
      varName:  'resultado',
      varType:  'Entero',
      varValue: '1',
    },
  },
  {
    id: 'f-decl-i',
    type: 'flowNode',
    position: { x: 300, y: 455 },
    data: {
      shape:    'asignacion',
      label:    'int i = 1',
      varName:  'i',
      varType:  'Entero',
      varValue: '1',
    },
  },
  {
    id: 'f-cond',
    type: 'flowNode',
    position: { x: 300, y: 570 },
    data: {
      shape:    'condicion',
      label:    'i <= n',
      expr:     'i <= n',
      loopType: 'while',
    },
  },
  {
    id: 'f-mult',
    type: 'flowNode',
    position: { x: 560, y: 570 },
    data: {
      shape: 'proceso',
      label: 'resultado = resultado * i',
      expr:  'resultado = resultado * i',
    },
  },
  {
    id: 'f-incr',
    type: 'flowNode',
    position: { x: 560, y: 680 },
    data: {
      shape: 'proceso',
      label: 'i = i + 1',
      expr:  'i = i + 1',
    },
  },
  {
    id: 'f-print',
    type: 'flowNode',
    position: { x: 300, y: 720 },
    data: {
      shape: 'print',
      label: 'resultado',
      expr:  'resultado',
    },
  },
  {
    id: 'f-fin',
    type: 'flowNode',
    position: { x: 300, y: 830 },
    data: { shape: 'fin', label: 'FIN' },
  },
]

export const FACTORIAL_EDGES = [
  { id: 'fe-1', source: 'f-inicio',   target: 'f-prompt',   ...edgeStyle },
  { id: 'fe-2', source: 'f-prompt',   target: 'f-leer',     ...edgeStyle },
  { id: 'fe-3', source: 'f-leer',     target: 'f-decl-res', ...edgeStyle },
  { id: 'fe-4', source: 'f-decl-res', target: 'f-decl-i',   ...edgeStyle },
  { id: 'fe-5', source: 'f-decl-i',   target: 'f-cond',     ...edgeStyle },
  // Rama SI del while (derecha): va al cuerpo del bucle
  {
    id: 'fe-6',
    source: 'f-cond', sourceHandle: 'si',
    target: 'f-mult',
    ...edgeSi,
  },
  { id: 'fe-7', source: 'f-mult',  target: 'f-incr',  ...edgeStyle },
  // El cuerpo regresa al rombo (forma el bucle)
  {
    id: 'fe-8',
    source: 'f-incr',
    target: 'f-cond',
    ...edgeStyle,
    style: { stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '5,3' },
  },
  // Rama NO del while (abajo): sale del bucle
  {
    id: 'fe-9',
    source: 'f-cond', sourceHandle: 'no',
    target: 'f-print',
    ...edgeNo,
  },
  { id: 'fe-10', source: 'f-print', target: 'f-fin', ...edgeStyle },
]
