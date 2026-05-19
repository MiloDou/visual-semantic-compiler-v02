//=============================================================================
// utils/codeGenerator.js — Generador de código en tiempo real (cliente)
//
// Recorre el grafo del canvas React Flow partiendo del nodo INICIO y
// produce código sin llamadas a red. Se ejecuta en cada cambio del diagrama
// para lograr la interactividad tipo "Scratch".
//
// API pública:
//   generateCode(nodes, edges) → { c_code, assembler, mermaid }
//
// Tipos de nodo soportados:
//   inicio    → punto de entrada (int main)
//   fin       → punto de salida (return 0)
//   asignacion→ declaración tipada   : int n = 0;
//   proceso   → expresión libre      : n = n + 1;
//   condicion → if/else o while      : detectado por estructura SI/NO
//   io        → entrada/salida       : printf("%d\n", x);
//   print     → impresión            : printf("%d\n", x);
//   ciclo     → while explícito (⬡)  : while (expr) { ... }
//=============================================================================

// ─── Utilidades internas ──────────────────────────────────────────────────────

/** @param {string} varType - Tipo visual ('Entero'|'Flotante') */
const toCType = (varType = '') =>
  ['flotante', 'float', 'double'].includes((varType || '').toLowerCase())
    ? 'float' : 'int'

/** @param {string} cType - 'float'|'int' → formato printf */
const fmtStr = (cType) => (cType === 'float' ? '%f' : '%d')

/**
 * Determina si existe un camino dirigido de `from` → `to` en el grafo.
 * Usado para detectar bucles (while) en condiciones.
 *
 * @param {string}  from
 * @param {string}  to
 * @param {object}  adjOut  - Mapa de adyacencia source → [{target, label}]
 * @param {number}  [depth=30]
 * @param {Set}     [seen]
 * @returns {boolean}
 */
function pathExists(from, to, adjOut, depth = 30, seen = new Set()) {
  if (depth <= 0 || seen.has(from)) return false
  seen.add(from)
  for (const e of (adjOut[from] || [])) {
    if (e.target === to) return true
    if (pathExists(e.target, to, adjOut, depth - 1, seen)) return true
  }
  return false
}

/**
 * Construye el mapa de adyacencia a partir de las aristas del canvas.
 * @param {object[]} edges
 * @returns {object}  adjOut[sourceId] = [{target, label}]
 */
function buildAdj(edges) {
  const adj = {}
  edges.forEach(e => {
    adj[e.source] = adj[e.source] || []
    adj[e.source].push({
      target: e.target,
      label: (e.label || '').trim().toUpperCase(),
    })
  })
  return adj
}

/** Detecta si una etiqueta de arista corresponde a la rama "NO/falsa". */
const isNoLabel = (label = '') =>
  ['NO', 'FALSE', 'N'].includes(label.trim().toUpperCase())

// ─── Generador de código C ────────────────────────────────────────────────────

/**
 * Genera código C válido recorriendo el grafo en orden topológico.
 *
 * @param {object[]} nodes - Nodos del canvas
 * @param {object[]} edges - Aristas del canvas
 * @returns {string} Código fuente C
 */
function generateCCode(nodes, edges) {
  if (!nodes.length) {
    return [
      '// Agrega nodos al diagrama de flujo para generar código.',
      '// Arrastra: Inicio → Asignación → Proceso → Fin',
    ].join('\n')
  }

  const nodeMap  = Object.fromEntries(nodes.map(n => [n.id, n]))
  const adjOut   = buildAdj(edges)
  const visited  = new Set()
  const varTypes = {}   // varName → 'int'|'float'
  const lines    = []

  // ── Localizar nodo INICIO ─────────────────────────────────────────────────
  const inicio = nodes.find(n => (n.data?.shape || '').toLowerCase() === 'inicio')
  if (!inicio) {
    return [
      '// ⚠ No se encontró nodo INICIO.',
      '// Agrega un nodo de tipo Inicio/Fin y conéctalo.',
    ].join('\n')
  }

  lines.push('int main() {')

  // ── Recorrido de cuerpo simple (sin bifurcación) ──────────────────────────
  /**
   * Recorre desde startId hasta stopId (exclusivo), emitiendo código.
   * Usado para el cuerpo de bucles while.
   * @param {string}  startId
   * @param {string}  stopId   - Nodo en el que parar (sin emitir)
   * @param {number}  indent
   */
  function emitBody(startId, stopId, indent) {
    let cur = startId
    const localSeen = new Set()
    while (cur && cur !== stopId && !localSeen.has(cur)) {
      if (visited.has(cur)) break
      localSeen.add(cur)
      visited.add(cur)
      cur = emitSingle(cur, indent, stopId, localSeen) || null
    }
  }

  /**
   * Emite el código de un único nodo y devuelve el id del siguiente.
   * @param {string}  nodeId
   * @param {number}  indent
   * @param {string}  [stopAt]    - Nodo en el que detener el avance
   * @param {Set}     [bodyLocal] - Visitados locales del cuerpo
   * @returns {string|null} id del siguiente nodo, o null para detenerse
   */
  function emitSingle(nodeId, indent, stopAt = null, bodyLocal = null) {
    const node  = nodeMap[nodeId]
    if (!node) return null

    const shape = (node.data?.shape || 'proceso').toLowerCase()
    const pad   = '    '.repeat(indent)
    const outs  = adjOut[nodeId] || []

    // ── FIN ──────────────────────────────────────────────────────────────────
    if (shape === 'fin') {
      lines.push(`${pad}return 0;`)
      return null
    }

    // ── INICIO (sin código) ───────────────────────────────────────────────────
    if (shape === 'inicio') { /* solo avanza */ }

    // ── ASIGNACIÓN ────────────────────────────────────────────────────────────
    else if (shape === 'asignacion') {
      const t  = toCType(node.data?.varType)
      const nm = (node.data?.varName  || 'x').trim()
      const vl = (node.data?.varValue || '0').trim()
      varTypes[nm] = t
      lines.push(`${pad}${t} ${nm} = ${vl};`)
    }

    // ── PROCESO ───────────────────────────────────────────────────────────────
    else if (shape === 'proceso') {
      const expr = (node.data?.expr || node.data?.label || '').replace(/;+$/, '').trim()
      if (expr) lines.push(`${pad}${expr};`)
    }

    // ── PRINT / IO ────────────────────────────────────────────────────────────
    else if (shape === 'print' || shape === 'io') {
      const expr = (node.data?.expr || node.data?.label || '').trim()
      lines.push(`${pad}println ${expr || '0'};`)
    }

    // ── CONDICIÓN ─────────────────────────────────────────────────────────────
    else if (shape === 'condicion') {
      const expr     = (node.data?.expr || node.data?.label || 'false').trim()
      const noEdge   = outs.find(o => isNoLabel(o.label))
      const siEdge   = outs.find(o => !isNoLabel(o.label))
      const noTarget = noEdge?.target
      const siTarget = siEdge?.target

      // Detectar WHILE: si la rama SI o NO regresa al nodo actual
      const isWhileSi = siTarget && pathExists(siTarget, nodeId, adjOut)
      const isWhileNo = noTarget && pathExists(noTarget, nodeId, adjOut)

      if (isWhileSi) {
        lines.push(`${pad}while (${expr}) {`)
        visited.add(nodeId)
        emitBody(siTarget, nodeId, indent + 1)
        lines.push(`${pad}}`)
        if (noTarget && !visited.has(noTarget)) return noTarget
        return null
      } else if (isWhileNo) {
        // Si el usuario hizo que la rama NO sea el bucle, usamos == 0 u omitimos !() si es complicado
        // Dado que el parser no soporta !(), lo emitiremos como comentario o forma simple
        lines.push(`${pad}while (${expr} == 0) {`)
        visited.add(nodeId)   
        emitBody(noTarget, nodeId, indent + 1)
        lines.push(`${pad}}`)
        if (siTarget && !visited.has(siTarget)) return siTarget
        return null
      } else {
        // if (condición) { rama_SI } else { rama_NO }
        lines.push(`${pad}if (${expr}) {`)
        if (siTarget && !visited.has(siTarget)) {
          visited.add(siTarget)
          emitSingle(siTarget, indent + 1)
        }
        if (noTarget && !visited.has(noTarget)) {
          lines.push(`${pad}} else {`)
          visited.add(noTarget)
          emitSingle(noTarget, indent + 1)
        }
        lines.push(`${pad}}`)
        return null
      }
    }

    // ── CICLO (hexágono) ──────────────────────────────────────────────────────
    else if (shape === 'ciclo') {
      const expr = (node.data?.expr || node.data?.label || 'true').trim()
      lines.push(`${pad}while (${expr}) {`)
      for (const e of outs) {
        const bodyLocal2 = new Set([nodeId])
        emitBody(e.target, nodeId, indent + 1)
        break
      }
      lines.push(`${pad}}`)
    }

    // ── Avanzar al siguiente nodo ─────────────────────────────────────────────
    const mainEdge = outs.find(o => !isNoLabel(o.label)) || outs[0]
    return mainEdge?.target || null
  }

  // ── Recorrido principal desde INICIO ─────────────────────────────────────────
  visited.add(inicio.id)
  const startOuts = adjOut[inicio.id] || []
  let cur = startOuts[0]?.target || null

  while (cur && !visited.has(cur)) {
    visited.add(cur)
    const next = emitSingle(cur, 1)
    if (next === null || next === undefined) break
    cur = next
  }

  // Garantizar return 0 si el nodo FIN no lo generó
  if (!lines.some(l => l.trim().startsWith('return'))) {
    lines.push('    return 0;')
  }
  lines.push('}')
  return lines.join('\n')
}

// ─── Generador de ensamblador x86 ────────────────────────────────────────────

/**
 * Genera ensamblador x86 NASM educativo a partir de los nodos del diagrama.
 * Refleja la estructura del código C generado con comentarios explicativos.
 *
 * @param {object[]} nodes
 * @param {object[]} edges
 * @returns {string} Código ensamblador NASM
 */
function generateAsmCode(nodes, edges) {
  if (!nodes.length) return '; Sin nodos en el diagrama'

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const adjOut  = buildAdj(edges)
  const inicio  = nodes.find(n => (n.data?.shape || '').toLowerCase() === 'inicio')

  // Recolectar variables para sección .bss
  const vars = nodes
    .filter(n => (n.data?.shape || '').toLowerCase() === 'asignacion' && n.data?.varName)
    .map(n => ({
      name: n.data.varName.trim(),
      type: toCType(n.data?.varType),
    }))

  const data = [
    '; ─────────────────────────────────────────────────────',
    `; CYBER_DRIVE — Ensamblador x86 (NASM)`,
    `; Generado automáticamente desde el diagrama de flujo`,
    `; Nodos: ${nodes.length}  Conexiones: ${edges.length}`,
    '; ─────────────────────────────────────────────────────',
    '',
    'section .data',
    '    fmt_int   db "%d", 10, 0    ; formato para entero + newline',
    '    fmt_float db "%f", 10, 0    ; formato para flotante + newline',
    '',
  ]

  const bss = ['section .bss']
  vars.forEach(v => {
    bss.push(`    ${v.name.padEnd(12)} resd 1    ; ${v.type}`)
  })
  if (!vars.length) bss.push('    ; (sin variables declaradas)')

  const text = [
    '',
    'section .text',
    '    extern printf',
    '    global _start',
    '',
    '_start:',
  ]

  // Traversal simplificado para generar instrucciones
  const visited = new Set()
  let   loopIdx = 0

  function visitAsm(nodeId, stopAt = null) {
    if (!nodeId || visited.has(nodeId) || nodeId === stopAt) return null
    visited.add(nodeId)

    const node  = nodeMap[nodeId]
    if (!node) return null

    const shape = (node.data?.shape || 'proceso').toLowerCase()
    const outs  = adjOut[nodeId] || []
    const noEdge   = outs.find(o => isNoLabel(o.label))
    const siEdge   = outs.find(o => !isNoLabel(o.label))

    // ── FIN ────────────────────────────────────────────────────────────────
    if (shape === 'fin') {
      text.push('', '    ; ── Fin del programa ─────────────────────')
      text.push('    mov     eax, 1          ; syscall exit')
      text.push('    xor     ebx, ebx        ; código de salida = 0')
      text.push('    int     0x80')
      return null
    }

    if (shape === 'inicio') { /* nada */ }

    // ── ASIGNACIÓN ───────────────────────────────────────────────────────────
    else if (shape === 'asignacion') {
      const nm = (node.data?.varName  || 'x').trim()
      const vl = (node.data?.varValue || '0').trim()
      const t  = toCType(node.data?.varType)
      text.push(``, `    ; ── ${t} ${nm} = ${vl}`)
      text.push(`    mov     eax, ${vl}`)
      text.push(`    mov     [${nm}], eax`)
    }

    // ── PROCESO ──────────────────────────────────────────────────────────────
    else if (shape === 'proceso') {
      const expr = (node.data?.expr || node.data?.label || '').replace(/;+$/, '').trim()
      if (expr) {
        text.push(``, `    ; ── ${expr}`)
        // Detectar patrones comunes: var = var + n, var++, var--
        const incMatch = expr.match(/^(\w+)\s*=\s*\1\s*\+\s*(\d+)$/)
        const decMatch = expr.match(/^(\w+)\s*=\s*\1\s*-\s*(\d+)$/)
        const ppMatch  = expr.match(/^(\w+)\+\+$/)
        const mmMatch  = expr.match(/^(\w+)--$/)
        const asgMatch = expr.match(/^(\w+)\s*=\s*(.+)$/)

        if (ppMatch) {
          text.push(`    inc     dword [${ppMatch[1]}]`)
        } else if (mmMatch) {
          text.push(`    dec     dword [${mmMatch[1]}]`)
        } else if (incMatch && incMatch[2] === '1') {
          text.push(`    inc     dword [${incMatch[1]}]`)
        } else if (decMatch && decMatch[2] === '1') {
          text.push(`    dec     dword [${decMatch[1]}]`)
        } else if (incMatch) {
          text.push(`    mov     eax, [${incMatch[1]}]`)
          text.push(`    add     eax, ${incMatch[2]}`)
          text.push(`    mov     [${incMatch[1]}], eax`)
        } else if (decMatch) {
          text.push(`    mov     eax, [${decMatch[1]}]`)
          text.push(`    sub     eax, ${decMatch[2]}`)
          text.push(`    mov     [${decMatch[1]}], eax`)
        } else if (asgMatch) {
          text.push(`    ; (expresión compleja — ver código C)`)
          text.push(`    ; ${expr}`)
        } else {
          text.push(`    ; ${expr}`)
        }
      }
    }

    // ── PRINT / IO ────────────────────────────────────────────────────────────
    else if (shape === 'print' || shape === 'io') {
      const expr = (node.data?.expr || node.data?.label || '').trim()
      text.push(``, `    ; ── printf("%d\\n", ${expr})`)
      text.push(`    push    dword [${expr}]`)
      text.push(`    push    fmt_int`)
      text.push(`    call    printf`)
      text.push(`    add     esp, 8`)
    }

    // ── CONDICIÓN ─────────────────────────────────────────────────────────────
    else if (shape === 'condicion') {
      const expr     = (node.data?.expr || node.data?.label || 'false').trim()
      const noTarget = noEdge?.target
      const siTarget = siEdge?.target
      const isWhileSi = siTarget && pathExists(siTarget, nodeId, adjOut)
      const isWhileNo = noTarget && pathExists(noTarget, nodeId, adjOut)
      const lbl       = `loop_${loopIdx++}`

      if (isWhileSi || isWhileNo) {
        const loopBody = isWhileSi ? siTarget : noTarget
        const exitBody = isWhileSi ? noTarget : siTarget
        
        text.push(``, `    ; ── while (${expr}) ────────────────────`)
        text.push(`.${lbl}:`)

        // Parseo básico de la condición para generar cmp/jge/jle...
        const condMatch = expr.match(/^(\w+)\s*([><=!]+)\s*(.+)$/)
        if (condMatch) {
          const [, lhs, op, rhs] = condMatch
          const jmpMap = { '>=': 'jge', '<=': 'jle', '>': 'jg', '<': 'jl', '==': 'je', '!=': 'jne' }
          let jmpOp  = jmpMap[op] || 'jge'
          // Invertir si es un bucle SI, ya que queremos saltar a exit si NO se cumple
          if (isWhileSi) {
             const invMap = { 'jge': 'jl', 'jle': 'jg', 'jg': 'jle', 'jl': 'jge', 'je': 'jne', 'jne': 'je' }
             jmpOp = invMap[jmpOp] || 'jl'
          }
          text.push(`    mov     eax, [${lhs}]`)
          const rhsNum = isNaN(rhs) ? `[${rhs}]` : rhs
          text.push(`    cmp     eax, ${rhsNum}`)
          text.push(`    ${jmpOp}     .${lbl}_exit   ; salir del bucle`)
        } else {
          text.push(`    ; evaluar: ${expr}`)
          text.push(`    ; jge .${lbl}_exit`)
        }

        // Emitir cuerpo del while
        visited.add(nodeId)
        let bodyCur = loopBody
        const bodySeen = new Set([nodeId])
        while (bodyCur && bodyCur !== nodeId && !bodySeen.has(bodyCur)) {
          bodySeen.add(bodyCur)
          visited.add(bodyCur)
          const next = visitAsm(bodyCur, nodeId)
          bodyCur = next || null
        }

        text.push(`    jmp     .${lbl}            ; volver al inicio del bucle`)
        text.push(`.${lbl}_exit:`)

        if (exitBody && !visited.has(exitBody)) return exitBody
        return null
      } else {
        text.push(``, `    ; ── if (${expr}) ──────────────────────────`)
        text.push(`    ; (ver código C para la lógica completa)`)
        return null
      }
    }

    // ── Siguiente nodo ────────────────────────────────────────────────────────
    const mainEdge = siEdge || outs[0]
    return mainEdge?.target || null
  }

  // Recorrido principal
  if (inicio) {
    visited.add(inicio.id)
    const startOuts = adjOut[inicio.id] || []
    let cur = startOuts[0]?.target || null
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      const next = visitAsm(cur)
      if (!next) break
      cur = next
    }
  } else {
    text.push('    ; ⚠ No se encontró nodo INICIO')
    text.push('    mov eax, 1')
    text.push('    xor ebx, ebx')
    text.push('    int 0x80')
  }

  return [...data, ...bss, ...text].join('\n')
}

// ─── Generador de sintaxis Mermaid ────────────────────────────────────────────

/**
 * Genera sintaxis Mermaid flowchart TD desde el grafo del canvas.
 * Usa formas estándar de diagramas de flujo ISO 5807.
 *
 * @param {object[]} nodes
 * @param {object[]} edges
 * @returns {string} Código Mermaid
 */
function generateMermaid(nodes, edges) {
  if (!nodes.length) {
    return 'flowchart TD\n    empty["[ Canvas vacío ]"]'
  }

  const lines = ['flowchart TD']

  // Nodos
  nodes.forEach(n => {
    const shape = (n.data?.shape || 'proceso').toLowerCase()
    const label = (n.data?.label || shape).replace(/"/g, "'")
    const id    = n.id.replace(/[^a-zA-Z0-9]/g, '_')

    if (shape === 'inicio' || shape === 'fin') {
      lines.push(`    ${id}(["${label}"])`)               // ovalado
    } else if (shape === 'condicion') {
      lines.push(`    ${id}{"${label}"}`)                 // rombo
    } else if (shape === 'io' || shape === 'print') {
      lines.push(`    ${id}[/"${label}"/]`)               // paralelogramo
    } else if (shape === 'ciclo') {
      lines.push(`    ${id}{{"${label}"}}`)               // hexágono
    } else {
      lines.push(`    ${id}["${label}"]`)                 // rectángulo
    }
  })

  // Estilos de nodo por tipo
  const styleMap = {
    inicio:     'fill:#134e4a,stroke:#4ade80,color:#86efac',
    fin:        'fill:#134e4a,stroke:#4ade80,color:#86efac',
    condicion:  'fill:#1e1b4b,stroke:#a855f7,color:#c084fc',
    io:         'fill:#1e1b4b,stroke:#7c3aed,color:#c084fc',
    print:      'fill:#1e1b4b,stroke:#7c3aed,color:#c084fc',
    proceso:    'fill:#0c1a2e,stroke:#06b6d4,color:#a5f3fc',
    asignacion: 'fill:#0c1a2e,stroke:#06b6d4,color:#a5f3fc',
    ciclo:      'fill:#1a0a2e,stroke:#f97316,color:#fb923c',
  }

  nodes.forEach(n => {
    const shape = (n.data?.shape || 'proceso').toLowerCase()
    const id    = n.id.replace(/[^a-zA-Z0-9]/g, '_')
    const style = styleMap[shape]
    if (style) lines.push(`    style ${id} ${style}`)
  })

  lines.push('')

  // Aristas
  edges.forEach(e => {
    const src = e.source.replace(/[^a-zA-Z0-9]/g, '_')
    const tgt = e.target.replace(/[^a-zA-Z0-9]/g, '_')
    const lbl = (e.label || '').trim()
    if (lbl) {
      lines.push(`    ${src} -->|"${lbl}"| ${tgt}`)
    } else {
      lines.push(`    ${src} --> ${tgt}`)
    }
  })

  return lines.join('\n')
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Genera código C, ensamblador y Mermaid a partir del estado actual del canvas.
 * Se ejecuta íntegramente en el cliente, sin llamadas de red.
 *
 * @param {import('reactflow').Node[]} nodes - Nodos del canvas
 * @param {import('reactflow').Edge[]} edges - Aristas del canvas
 * @returns {{ c_code: string, assembler: string, mermaid: string }}
 */
export function generateCode(nodes, edges) {
  // Filtra callbacks del data antes de procesar (onUpdate no es serializable)
  const cleanNodes = nodes.map(n => ({
    ...n,
    data: (({ onUpdate, ...rest }) => rest)(n.data || {}),
  }))

  return {
    c_code:    generateCCode(cleanNodes, edges),
    assembler: generateAsmCode(cleanNodes, edges),
    mermaid:   generateMermaid(cleanNodes, edges),
  }
}
