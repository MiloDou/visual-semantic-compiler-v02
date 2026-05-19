// src/services/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Todas las llamadas al backend Flask van aquí.
// El frontend NUNCA habla directo al compilador, solo via JSON.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:5000/api'

/**
 * Compilación completa desde código fuente texto:
 * Léxico → Sintáctico → Semántico → Assembler + Traducciones
 *
 * @param {string} codigo  - Código fuente C-like
 * @returns {Promise<CompileResult>}
 */
export async function compilarCodigo(codigo) {
  const res = await fetch(`${BASE_URL}/compilar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  })
  return res.json()
}

/**
 * Compilación desde el diagrama de flujo visual (React Flow canvas).
 * El payload es el JSON serializado del lienzo.
 *
 * El backend espera:
 * {
 *   "version": "1.0",
 *   "nodes": [ { id, type, label, varName, varType, varValue, expr, position } ],
 *   "edges": [ { id, source, target, label } ]
 * }
 *
 * El backend devuelve el mismo esquema que /api/compilar:
 * { ok, errores, tokens, ast, assembler, tabla_simbolos,
 *   traducciones, cpp, mermaid, echo }
 *
 * @param {object} flowJson  - Objeto { version, nodes, edges }
 * @returns {Promise<CompileResult>}
 */
export async function compilarDiagrama(flowJson) {
  const res = await fetch(`${BASE_URL}/compilar_diagrama`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flowJson),
  })
  return res.json()
}

/**
 * Solo análisis léxico (tokens).
 */
export async function obtenerTokens(codigo) {
  const res = await fetch(`${BASE_URL}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  })
  return res.json()
}

/**
 * Solo análisis léxico + sintáctico (AST).
 */
export async function obtenerAST(codigo) {
  const res = await fetch(`${BASE_URL}/ast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  })
  return res.json()
}

/**
 * Health-check del servidor.
 */
export async function ping() {
  try {
    const res = await fetch(`${BASE_URL}/ping`)
    return res.json()
  } catch {
    return { status: 'offline' }
  }
}
