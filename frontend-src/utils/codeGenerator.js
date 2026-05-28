//=============================================================================
// utils/codeGenerator.js — Generador de código en tiempo real (cliente)
//
// Recorre el grafo del canvas React Flow partiendo del nodo INICIO y
// produce código sin llamadas a red. Se ejecuta en cada cambio del diagrama.
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
//   io        → entrada/salida       : println x;
//   print     → impresión            : println x;
//   ciclo     → while explícito (⬡)  : while (expr) { ... }
//=============================================================================

// ─── Utilidades internas ──────────────────────────────────────────────────────

/** @param {string} varType - Tipo visual ('Entero'|'Flotante') */
const toCType = (varType = '') =>
  ['flotante', 'float', 'double'].includes((varType || '').toLowerCase())
    ? 'float' : 'int'

/**
 * Determina si existe un camino dirigido de `from` → `to` en el grafo.
 * Usado para detectar bucles (while) en condiciones.
 */
function pathExists(from, to, adjOut, depth = 40, seen = new Set()) {
  if (depth <= 0 || seen.has(from)) return false
  seen.add(from)
  for (const e of (adjOut[from] || [])) {
    if (e.target === to) return true
    if (pathExists(e.target, to, adjOut, depth - 1, new Set(seen))) return true
  }
  return false
}

/**
 * Construye el mapa de adyacencia a partir de las aristas del canvas.
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
const isNoLabel = (label = '') => {
  const upper = (label || '').trim().toUpperCase()
  return ['NO', 'FALSE', 'N'].includes(upper) || 
         /\b(NO|FALSE|N)\b/.test(upper)
}

/** Detecta si una etiqueta de arista corresponde a la rama "SI/verdadera". */
const isSiLabel = (label = '') => {
  const upper = (label || '').trim().toUpperCase()
  return ['SI', 'YES', 'TRUE', 'S', 'SÍ'].includes(upper) || 
         /\b(SI|SÍ|YES|TRUE|S)\b/.test(upper)
}

// ─── Generador de código C ────────────────────────────────────────────────────

/**
 * Genera código C válido recorriendo el grafo en orden topológico.
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

  // ── Nodo de convergencia de if/else ──────────────────────────────────────
  /**
   * Encuentra el nodo de convergencia (join) después de un if/else.
   * Es el primer nodo alcanzable desde ambas ramas.
   */
  function findJoinNode(siTarget, noTarget, maxDepth = 30) {
    if (!siTarget || !noTarget) return null
    // BFS desde ambas ramas para encontrar el primer nodo común
    const reachSi = new Set()
    const reachNo = new Set()
    const qSi = [siTarget]
    const qNo = [noTarget]
    for (let d = 0; d < maxDepth; d++) {
      if (qSi.length === 0 && qNo.length === 0) break
      if (qSi.length) {
        const cur = qSi.shift()
        if (!cur || reachSi.has(cur)) { /* skip */ } else {
          reachSi.add(cur)
          if (reachNo.has(cur)) return cur
          for (const e of (adjOut[cur] || [])) qSi.push(e.target)
        }
      }
      if (qNo.length) {
        const cur = qNo.shift()
        if (!cur || reachNo.has(cur)) { /* skip */ } else {
          reachNo.add(cur)
          if (reachSi.has(cur)) return cur
          for (const e of (adjOut[cur] || [])) qNo.push(e.target)
        }
      }
    }
    return null
  }

  /**
   * Recorre desde startId hasta stopId (exclusivo), emitiendo código.
   * Usado para el cuerpo de bloques (while, if, else).
   */
  function emitBlock(startId, stopId, indent, maxDepth = 60) {
    let cur = startId
    const localSeen = new Set()
    let depth = maxDepth
    while (cur && cur !== stopId && !localSeen.has(cur) && depth-- > 0) {
      localSeen.add(cur)
      const next = emitNode(cur, indent, stopId)
      if (next === null || next === undefined) break
      cur = next
    }
  }

  /**
   * Emite el código de un único nodo y devuelve el id del siguiente.
   * @returns {string|null} id del siguiente nodo, o null para detenerse
   */
  function emitNode(nodeId, indent, stopAt = null) {
    if (!nodeId || nodeId === stopAt) return null
    const node = nodeMap[nodeId]
    if (!node) return null
    if (visited.has(nodeId)) return null

    visited.add(nodeId)

    const shape = (node.data?.shape || 'proceso').toLowerCase()
    const pad   = '    '.repeat(indent)
    const outs  = adjOut[nodeId] || []

    // ── FIN ──────────────────────────────────────────────────────────────────
    if (shape === 'fin') {
      lines.push(`${pad}return 0;`)
      return null
    }

    // ── INICIO (sin código) ───────────────────────────────────────────────────
    if (shape === 'inicio') {
      const mainEdge = outs[0]
      return mainEdge?.target || null
    }

    // ── ASIGNACIÓN ────────────────────────────────────────────────────────────
    if (shape === 'asignacion') {
      const exprLabel = (node.data?.label || '').trim()
      // Si la label es una expresión directa válida (int x = 0)
      const hasDirectExpr = exprLabel &&
        exprLabel.toLowerCase() !== 'declarar' &&
        exprLabel.toLowerCase() !== 'asignacion' &&
        exprLabel !== ''

      if (hasDirectExpr) {
        lines.push(`${pad}${exprLabel.replace(/;+$/, '')};`)
      } else {
        const t  = toCType(node.data?.varType)
        const nm = (node.data?.varName  || 'x').trim()
        const vl = (node.data?.varValue || '0').trim()
        lines.push(`${pad}${t} ${nm} = ${vl};`)
      }
    }

    // ── PROCESO ───────────────────────────────────────────────────────────────
    else if (shape === 'proceso') {
      const expr = (node.data?.expr || node.data?.label || '').replace(/;+$/, '').trim()
      if (expr && expr.toLowerCase() !== 'proceso') {
        lines.push(`${pad}${expr};`)
      }
    }

    // ── PRINT / IO ────────────────────────────────────────────────────────
    else if (shape === 'print' || shape === 'io') {
      const raw   = (node.data?.expr || node.data?.label || '').trim()
      const clean = raw.replace(/;+$/, '').trim()

      // Detección de entrada: "leer n", "leer: n", "scanf n", "input n", "read n"
      const inputPrefixes = ['leer ', 'leer:', 'scanf ', 'input ', 'read ']
      let isInput = false
      let inputVar = ''
      for (const pref of inputPrefixes) {
        if (clean.toLowerCase().startsWith(pref.toLowerCase())) {
          isInput  = true
          inputVar = clean.slice(pref.length).trim().replace(/;+$/, '').trim()
          break
        }
      }

      if (isInput && inputVar) {
        lines.push(`${pad}scanf("%d", &${inputVar});`)
      } else if (clean && clean.toLowerCase() !== 'imprimir' && clean.toLowerCase() !== 'i/o') {
        lines.push(`${pad}println ${clean};`)
      }
    }

    // ── CONDICIÓN ─────────────────────────────────────────────────────────────
    else if (shape === 'condicion') {
      let expr = (node.data?.expr || node.data?.label || 'false').trim()
      if (expr.toLowerCase() === 'condición' || expr.toLowerCase() === 'condicion') {
        expr = 'false'
      }

      const siEdge   = outs.find(o => isSiLabel(o.label)) || outs.find(o => !isNoLabel(o.label))
      const noEdge   = outs.find(o => isNoLabel(o.label))
      const siTarget = siEdge?.target
      const noTarget = noEdge?.target

      // Detectar WHILE: si la rama SI vuelve al nodo actual → while(expr) { cuerpo NO }
      // O si la rama NO vuelve al nodo actual → while(!expr) pero usamos la rama SI como salida
      const loopBodyViaSi = siTarget && pathExists(siTarget, nodeId, adjOut)
      const loopBodyViaNo = noTarget && pathExists(noTarget, nodeId, adjOut)

      if (loopBodyViaSi || loopBodyViaNo) {
        // Es un WHILE
        // Convención: si la rama NO vuelve (cuerpo del bucle = NO), expr es la condición de permanencia
        // si la rama SI vuelve (cuerpo del bucle = SI), expr es la condición de permanencia
        const bodyTarget = loopBodyViaSi ? siTarget : noTarget
        const exitTarget = loopBodyViaSi ? noTarget : siTarget

        lines.push(`${pad}while (${expr}) {`)
        // Emitir el cuerpo del bucle hasta volver al nodo actual
        emitBlock(bodyTarget, nodeId, indent + 1)
        lines.push(`${pad}}`)

        if (exitTarget && !visited.has(exitTarget)) {
          return exitTarget
        }
        return null
      } else {
        // Es un IF/ELSE
        lines.push(`${pad}if (${expr}) {`)

        const joinNode = findJoinNode(siTarget, noTarget)

        // Emitir rama SI — temporalmente sacar siTarget de visited para que emitNode lo procese
        if (siTarget) {
          visited.delete(siTarget)
          emitBlock(siTarget, joinNode, indent + 1)
        }

        // Emitir rama NO (else) — siempre emitirla si noTarget existe
        if (noTarget) {
          lines.push(`${pad}} else {`)
          visited.delete(noTarget)
          emitBlock(noTarget, joinNode, indent + 1)
        }

        lines.push(`${pad}}`)

        if (joinNode) {
          visited.delete(joinNode)
          return joinNode
        }
        return null
      }
    }

    // ── CICLO (hexágono explícito) ────────────────────────────────────────────
    else if (shape === 'ciclo') {
      const expr = (node.data?.expr || node.data?.label || 'true').trim()
      lines.push(`${pad}while (${expr}) {`)
      const firstOut = outs[0]
      if (firstOut) {
        emitBlock(firstOut.target, nodeId, indent + 1)
      }
      lines.push(`${pad}}`)
      // Salida del ciclo: buscar arista sin "cuerpo" (la que sale hacia afuera)
      const exitOut = outs.find(o => !pathExists(o.target, nodeId, adjOut))
      return exitOut?.target || null
    }

    // ── Avanzar al siguiente nodo ─────────────────────────────────────────────
    // Para nodos normales: tomar la arista SI o la primera arista
    const mainEdge = outs.find(o => isSiLabel(o.label)) || outs.find(o => !isNoLabel(o.label)) || outs[0]
    return mainEdge?.target || null
  }

  // ── Recorrido principal desde INICIO ─────────────────────────────────────────
  visited.add(inicio.id)
  const startOuts = adjOut[inicio.id] || []
  let cur = startOuts[0]?.target || null

  let safetyCount = 0
  while (cur && safetyCount++ < 200) {
    if (visited.has(cur)) break
    const next = emitNode(cur, 1)
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
    '    fmt_scanf db "%d", 0        ; formato para lectura scanf',
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
    '    extern printf, scanf',
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
    const siEdge   = outs.find(o => isSiLabel(o.label)) || outs.find(o => !isNoLabel(o.label))

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
      let nm = (node.data?.varName  || 'x').trim()
      let vl = (node.data?.varValue || '0').trim()
      let t  = toCType(node.data?.varType)

      const label = (node.data?.label || '').trim()
      if (label && label.toLowerCase() !== 'declarar') {
        const match = label.match(/^(?:int|float)\s+(\w+)\s*=\s*(.+)$/i)
        if (match) {
          nm = match[1]
          vl = match[2].replace(/;+$/, '')
        }
      }

      text.push(``, `    ; ── ${t} ${nm} = ${vl}`)
      text.push(`    mov     eax, ${vl}`)
      text.push(`    mov     [${nm}], eax`)
    }

    // ── PROCESO ──────────────────────────────────────────────────────────────
    else if (shape === 'proceso') {
      const expr = (node.data?.expr || node.data?.label || '').replace(/;+$/, '').trim()
      if (expr) {
        text.push(``, `    ; ── ${expr}`)
        const incMatch = expr.match(/^(\w+)\s*=\s*\1\s*\+\s*(\d+)$/)
        const decMatch = expr.match(/^(\w+)\s*=\s*\1\s*-\s*(\d+)$/)
        const ppMatch  = expr.match(/^(\w+)\+\+$/)
        const mmMatch  = expr.match(/^(\w+)--$/)

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
        } else {
          text.push(`    ; (expresión compleja — ver código C)`)
          text.push(`    ; ${expr}`)
        }
      }
    }

    // ── PRINT / IO ────────────────────────────────────────────────────────
    else if (shape === 'print' || shape === 'io') {
      const raw   = (node.data?.expr || node.data?.label || '').trim()
      const clean = raw.replace(/;+$/, '').trim()

      // Detectar entrada: leer n
      const inputPrefixes = ['leer ', 'leer:', 'scanf ', 'input ', 'read ']
      let isInput = false
      let inputVar = ''
      for (const pref of inputPrefixes) {
        if (clean.toLowerCase().startsWith(pref.toLowerCase())) {
          isInput  = true
          inputVar = clean.slice(pref.length).trim().replace(/;+$/, '').trim()
          break
        }
      }

      if (isInput && inputVar) {
        text.push(``, `    ; ── scanf("%d", &${inputVar})`)
        text.push(`    push  ${inputVar}         ; dirección de la variable`)
        text.push(`    push  fmt_scanf`)
        text.push(`    call  scanf`)
        text.push(`    add   esp, 8`)
      } else {
        let expr = clean
        if (expr.toLowerCase() === 'imprimir' || expr.toLowerCase() === 'i/o') expr = '0'
        text.push(``, `    ; ── printf("%d\\n", ${expr})`)
        text.push(`    push    dword [${expr}]`)
        text.push(`    push    fmt_int`)
        text.push(`    call    printf`)
        text.push(`    add     esp, 8`)
      }
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

        const condMatch = expr.match(/^(\w+)\s*([><=!]+)\s*(.+)$/)
        if (condMatch) {
          const [, lhs, op, rhs] = condMatch
          const jmpMap = { '>=': 'jge', '<=': 'jle', '>': 'jg', '<': 'jl', '==': 'je', '!=': 'jne' }
          let jmpOp = jmpMap[op] || 'jge'
          const invMap = { 'jge': 'jl', 'jle': 'jg', 'jg': 'jle', 'jl': 'jge', 'je': 'jne', 'jne': 'je' }
          jmpOp = invMap[jmpOp] || 'jl'
          text.push(`    mov     eax, [${lhs}]`)
          const rhsNum = isNaN(rhs) ? `[${rhs}]` : rhs
          text.push(`    cmp     eax, ${rhsNum}`)
          text.push(`    ${jmpOp}     .${lbl}_exit   ; salir del bucle`)
        } else {
          text.push(`    ; evaluar: ${expr}`)
          text.push(`    ; jge .${lbl}_exit`)
        }

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

  if (inicio) {
    visited.add(inicio.id)
    const startOuts = adjOut[inicio.id] || []
    let cur = startOuts[0]?.target || null
    let safety = 0
    while (cur && !visited.has(cur) && safety++ < 200) {
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

function generateMermaid(nodes, edges) {
  if (!nodes.length) {
    return 'flowchart TD\n    empty["[ Canvas vacío ]"]'
  }

  const lines = ['flowchart TD']

  nodes.forEach(n => {
    const shape = (n.data?.shape || 'proceso').toLowerCase()
    const label = (n.data?.label || shape).replace(/"/g, "'")
    const id    = n.id.replace(/[^a-zA-Z0-9]/g, '_')

    if (shape === 'inicio' || shape === 'fin') {
      lines.push(`    ${id}(["${label}"])`)
    } else if (shape === 'condicion') {
      lines.push(`    ${id}{"${label}"}`)
    } else if (shape === 'io' || shape === 'print') {
      lines.push(`    ${id}[/"${label}"/]`)
    } else if (shape === 'ciclo') {
      lines.push(`    ${id}{{"${label}"}}`)
    } else {
      lines.push(`    ${id}["${label}"]`)
    }
  })

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
