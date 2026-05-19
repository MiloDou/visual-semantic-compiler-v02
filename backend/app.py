# -*- coding: utf-8 -*-
"""
app.py — Servidor Flask del IDE CYBER_DRIVE (Compiladores)
=============================================================
Expone los endpoints REST que el frontend React consume:

  POST /api/compilar          → Compila código fuente texto (editor Monaco)
  POST /api/compilar_diagrama → Compila diagrama React Flow (JSON → C → ASM)
  POST /api/tokens            → Solo análisis léxico
  POST /api/ast               → Solo análisis léxico + sintáctico
  GET  /api/ping              → Health-check

Schema de respuesta (v2, usado por compilar_diagrama):
  {
    "ok":               bool,
    "c_code":           str,   # Código C generado del diagrama
    "assembler":        str,   # Código ensamblador (.s)
    "execution_output": list,  # Líneas de salida del programa
    "errors":           list,  # Errores de compilación
    "mermaid_syntax":   str,   # Diagrama Mermaid del flujo
    "tokens":           list,
    "ast":              dict,
    "tabla_simbolos":   dict,
    "traducciones":     dict
  }

Schema de respuesta (v1, usado por /compilar):
  { ok, errores, tokens, ast, assembler, tabla_simbolos,
    traducciones, cpp, mermaid, echo }
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from compilador_core import compilar_codigo

app = Flask(__name__)
CORS(app)   # Permite peticiones cross-origin desde localhost:5173 / 5174


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Compilar código fuente texto
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/compilar', methods=['POST'])
def compilar():
    """
    Compila código fuente en lenguaje C-like (editor Monaco).

    Body JSON:  { "codigo": "int main(){ ... }" }
    Respuesta:  schema v1  (ver módulo docstring)
    """
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({
            'ok': False,
            'errores': ['Se requiere el campo "codigo" en el body JSON'],
            'tokens': [], 'ast': None, 'assembler': '',
            'tabla_simbolos': {}, 'traducciones': {}, 'cpp': ''
        }), 400

    resultado     = compilar_codigo(data['codigo'])
    status_code   = 200 if resultado['ok'] else 422
    return jsonify(resultado), status_code


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Compilar diagrama visual (React Flow JSON)
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/compilar_diagrama', methods=['POST'])
def compilar_diagrama():
    """
    Recibe el JSON serializado del canvas React Flow y lo compila completo:
      1. diagrama_a_codigo()  → genera código C desde los nodos/aristas
      2. compilar_codigo()    → léxico + sintáctico + semántico + ensamblador
      3. generar_mermaid()    → genera sintaxis Mermaid del diagrama

    Body JSON (generado por serializeFlowToJSON en MainCanvas.jsx):
    {
      "version": "1.0",
      "nodes": [
        {
          "id":       "node-xxx",
          "type":     "inicio|fin|asignacion|proceso|condicion|ciclo|io|print",
          "label":    "texto visible del nodo",
          "varName":  "n",         // solo nodos de tipo 'asignacion'
          "varType":  "Entero",    // "Entero" | "Flotante"
          "varValue": "0",         // valor inicial
          "expr":     "n >= 5",    // para condicion, ciclo, proceso, io
          "position": { "x": 0, "y": 0 }
        }
      ],
      "edges": [
        { "id": "e1", "source": "n-inicio", "target": "n-decl", "label": "SI|NO|" }
      ]
    }

    Respuesta: schema v2 (ver módulo docstring)
    """
    data = request.get_json(silent=True)
    if not data or 'nodes' not in data or 'edges' not in data:
        return jsonify({
            'ok':               False,
            'errors':           ['Se requiere { nodes, edges } en el body JSON'],
            'c_code':           '',
            'assembler':        '',
            'execution_output': [],
            'mermaid_syntax':   '',
            'tokens':           [], 'ast': None,
            'tabla_simbolos':   {}, 'traducciones': {}
        }), 400

    nodes = data['nodes']
    edges = data['edges']

    # ── Paso 1: Diagrama → Código C ──────────────────────────────────────
    try:
        c_code = diagrama_a_codigo(nodes, edges)
    except Exception as e:
        return jsonify({
            'ok':               False,
            'errors':           [f'Error al convertir diagrama a C: {str(e)}'],
            'c_code':           '',
            'assembler':        '',
            'execution_output': [],
            'mermaid_syntax':   generar_mermaid(nodes, edges),
            'tokens': [], 'ast': None, 'tabla_simbolos': {}, 'traducciones': {}
        }), 422

    # ── Paso 2: Compilar código C ─────────────────────────────────────────
    resultado = compilar_codigo(c_code)

    # ── Paso 3: Generar Mermaid ───────────────────────────────────────────
    mermaid_syntax = generar_mermaid(nodes, edges)

    # ── Normalizar respuesta a schema v2 ──────────────────────────────────
    return jsonify({
        'ok':               resultado.get('ok', False),
        'c_code':           c_code,
        # diagrama_codigo preservado para debug en frontend
        'assembler':        resultado.get('assembler', ''),
        'execution_output': resultado.get('echo', []),
        'errors':           resultado.get('errores', []),
        'mermaid_syntax':   mermaid_syntax,
        # Campos de análisis (compatibilidad con paneles existentes)
        'tokens':           resultado.get('tokens', []),
        'ast':              resultado.get('ast', None),
        'tabla_simbolos':   resultado.get('tabla_simbolos', {}),
        'traducciones':     resultado.get('traducciones', {}),
    }), (200 if resultado.get('ok') else 422)


# ════════════════════════════════════════════════════════════════════════════
# LÓGICA: Conversor Diagrama React Flow → Código C
# ════════════════════════════════════════════════════════════════════════════

def diagrama_a_codigo(nodes, edges):
    """
    Recorre el grafo dirigido del canvas en orden topológico y genera
    código fuente compatible con el compilador existente (C-like).

    Tipos de nodo manejados:
      inicio     → punto de entrada (no genera código, marca el inicio)
      fin        → punto de salida (termina el recorrido)
      asignacion → declaración tipada: int n = 0;
      proceso    → expresión / reasignación: n = n + 1;
      condicion  → if(...){...}else{...}  o  while(...)  según estructura SI/NO
      ciclo      → while(<expr>) { ... }
      io         → println <var>;
      print      → println <var>;

    Args:
        nodes (list): Lista de dicts con campos id, type, label, varName, etc.
        edges (list): Lista de dicts con campos id, source, target, label.

    Returns:
        str: Código fuente C-like listo para pasar a compilar_codigo().

    Raises:
        ValueError: Si no se encuentra ningún nodo de tipo 'inicio'.
    """
    # ── Índices de acceso rápido ──────────────────────────────────────────
    node_map = {n['id']: n for n in nodes}

    # adj_out: source_id → [{ target, label }]
    adj_out = {}
    for e in edges:
        adj_out.setdefault(e['source'], []).append({
            'target': e['target'],
            'label':  (e.get('label') or '').strip().upper()
        })

    # ── Localizar nodo de inicio ──────────────────────────────────────────
    inicio = next(
        (n for n in nodes if (n.get('type') or '').lower() == 'inicio'),
        None
    )
    if not inicio:
        # Fallback: nodo sin aristas entrantes
        targets = {e['target'] for e in edges}
        inicio  = next((n for n in nodes if n['id'] not in targets), nodes[0] if nodes else None)

    if not inicio:
        raise ValueError('No se encontró nodo de inicio en el diagrama')

    # ── Acumulador de líneas ──────────────────────────────────────────────
    lineas    = []
    visitados = set()

    # ── Helpers ──────────────────────────────────────────────────────────

    def tipo_c(var_type):
        """Mapea tipo visual ('Entero'/'Flotante') a tipo C ('int'/'float')."""
        if not var_type:
            return 'int'
        v = var_type.strip().lower()
        return 'float' if v in ('flotante', 'float', 'double') else 'int'

    def es_ancestro(start, target, depth=25):
        """Determina si 'target' es alcanzable desde 'start' (detección de ciclos)."""
        if depth <= 0:
            return False
        for s in adj_out.get(start, []):
            if s['target'] == target:
                return True
            if es_ancestro(s['target'], target, depth - 1):
                return True
        return False

    def recorrer_cuerpo_bucle(start_id, stop_id, indent, depth):
        """
        Recorre el subgrafo del cuerpo de un bucle hasta llegar a stop_id.
        Emite las instrucciones internas con la indentación dada.
        """
        cur  = start_id
        seen = set()
        while cur and cur != stop_id and cur not in seen and depth > 0:
            seen.add(cur)
            visitados.add(cur)
            n     = node_map.get(cur)
            if not n:
                break
            ntype = (n.get('type') or 'proceso').lower()
            pad   = '    ' * indent
            depth -= 1

            if ntype == 'asignacion':
                vn = n.get('varName') or 'x'
                vt = tipo_c(n.get('varType'))
                vv = n.get('varValue') or '0'
                lineas.append(f'{pad}{vt} {vn} = {vv};')
            elif ntype == 'proceso':
                expr = (n.get('expr') or n.get('label') or '').strip().rstrip(';')
                if expr:
                    lineas.append(f'{pad}{expr};')
            elif ntype in ('print', 'io'):
                expr = (n.get('expr') or n.get('label') or '').strip()
                lineas.append(f'{pad}println {expr};')

            salidas = adj_out.get(cur, [])
            cur     = salidas[0]['target'] if salidas else None

    def recorrer(node_id, indent=1, depth=120):
        """
        Recorrido recursivo principal del grafo.
        Genera el código para cada nodo según su tipo, respetando el flujo.
        """
        if depth <= 0 or node_id in visitados:
            return
        visitados.add(node_id)

        n = node_map.get(node_id)
        if not n:
            return

        ntype = (n.get('type') or 'proceso').lower()
        pad   = '    ' * indent

        # ── INICIO / FIN ─────────────────────────────────────────────────
        if ntype == 'fin':
            return  # cierra el recorrido

        elif ntype == 'inicio':
            pass  # solo avanza al siguiente nodo

        # ── DECLARACIÓN / ASIGNACIÓN ─────────────────────────────────────
        elif ntype == 'asignacion':
            vn = n.get('varName') or 'x'
            vt = tipo_c(n.get('varType'))
            vv = n.get('varValue') or '0'
            lineas.append(f'{pad}{vt} {vn} = {vv};')

        # ── PROCESO (expresión arbitraria) ────────────────────────────────
        elif ntype == 'proceso':
            expr = (n.get('expr') or n.get('label') or '').strip().rstrip(';')
            if expr:
                lineas.append(f'{pad}{expr};')

        # ── I/O y PRINT ──────────────────────────────────────────────────
        elif ntype in ('io', 'print'):
            expr = (n.get('expr') or n.get('label') or '').strip()
            lineas.append(f'{pad}println {expr};')

        # ── CONDICIÓN (if / while) ────────────────────────────────────────
        elif ntype == 'condicion':
            expr    = (n.get('expr') or n.get('label') or 'false').strip()
            salidas = adj_out.get(node_id, [])
            rama_si = next((s['target'] for s in salidas if s['label'] in ('SI', 'YES', 'TRUE', 'S')), None)
            rama_no = next((s['target'] for s in salidas if s['label'] in ('NO', 'FALSE', 'N')),  None)

            # Detecta si la rama NO forma un bucle de vuelta al nodo actual → while
            es_while = rama_no and es_ancestro(rama_no, node_id)

            if es_while:
                # Estructura WHILE: itera mientras la condición sea verdadera
                lineas.append(f'{pad}while ({expr}) {{')
                if rama_no:
                    recorrer_cuerpo_bucle(rama_no, node_id, indent + 1, depth - 1)
                lineas.append(f'{pad}}}')
                # Continúa por la rama SI (salida del bucle)
                if rama_si and rama_si not in visitados:
                    recorrer(rama_si, indent, depth - 1)
                return  # evita el recorrido genérico de salidas al final

            else:
                # Estructura IF/ELSE
                lineas.append(f'{pad}if ({expr}) {{')
                if rama_si:
                    recorrer(rama_si, indent + 1, depth - 1)
                if rama_no:
                    lineas.append(f'{pad}}} else {{')
                    recorrer(rama_no, indent + 1, depth - 1)
                lineas.append(f'{pad}}}')
                return

        # ── CICLO explícito (hexágono) ────────────────────────────────────
        elif ntype == 'ciclo':
            expr    = (n.get('expr') or n.get('label') or 'true').strip()
            salidas = adj_out.get(node_id, [])
            lineas.append(f'{pad}while ({expr}) {{')
            for s in salidas:
                recorrer(s['target'], indent + 1, depth - 1)
            lineas.append(f'{pad}}}')
            return

        # ── Avanza al siguiente nodo (camino principal) ───────────────────
        for s in adj_out.get(node_id, []):
            if s['target'] not in visitados:
                recorrer(s['target'], indent, depth - 1)
                break  # un solo camino principal por nivel

    # ── Generar código final ──────────────────────────────────────────────
    lineas.append('int main(){')
    recorrer(inicio['id'], indent=1)
    lineas.append('}')
    return '\n'.join(lineas)


# ════════════════════════════════════════════════════════════════════════════
# LÓGICA: Generador de sintaxis Mermaid desde el diagrama
# ════════════════════════════════════════════════════════════════════════════

def generar_mermaid(nodes, edges):
    """
    Convierte el grafo de nodos/aristas del canvas en sintaxis Mermaid
    (flowchart TD) usando las formas estándar de diagramas de flujo:

      Inicio/Fin   → ([ ... ])   oval/stadium
      Proceso      → [ ... ]     rectángulo
      Condición    → { ... }     rombo
      I/O / Print  → [/ ... /]   paralelogramo

    Args:
        nodes (list): Lista de nodos del canvas.
        edges (list): Lista de aristas del canvas.

    Returns:
        str: Código Mermaid listo para renderizar con mermaid.js.
    """
    lines = ['flowchart TD']

    for n in nodes:
        ntype = (n.get('type') or 'proceso').lower()
        label = (n.get('label') or ntype).replace('"', "'")
        nid   = n['id'].replace('-', '_').replace(' ', '_')

        if ntype in ('inicio', 'fin'):
            lines.append(f'    {nid}(["{label}"])')
        elif ntype == 'condicion':
            lines.append(f'    {nid}{{"{label}"}}')
        elif ntype in ('io', 'print'):
            lines.append(f'    {nid}[/"{label}"/]')
        else:
            lines.append(f'    {nid}["{label}"]')

    for e in edges:
        src = e['source'].replace('-', '_').replace(' ', '_')
        tgt = e['target'].replace('-', '_').replace(' ', '_')
        lbl = (e.get('label') or '').strip()
        if lbl:
            lines.append(f'    {src} -->|"{lbl}"| {tgt}')
        else:
            lines.append(f'    {src} --> {tgt}')

    return '\n'.join(lines)


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS AUXILIARES
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/tokens', methods=['POST'])
def solo_tokens():
    """Solo análisis léxico — retorna la lista de tokens."""
    from compilador_core import identificar_tokens
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({'ok': False, 'errores': ['Falta campo "codigo"']}), 400
    try:
        tokens = identificar_tokens(data['codigo'])
        return jsonify({
            'ok':     True,
            'tokens': [{'tipo': t[0], 'valor': t[1]} for t in tokens]
        })
    except Exception as e:
        return jsonify({'ok': False, 'errores': [str(e)]}), 500


@app.route('/api/ast', methods=['POST'])
def solo_ast():
    """Solo análisis léxico + sintáctico — retorna el AST."""
    from compilador_core import identificar_tokens, Parser, ast_a_json
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({'ok': False, 'errores': ['Falta campo "codigo"']}), 400
    try:
        tokens = identificar_tokens(data['codigo'])
        arbol  = Parser(tokens).parsear()
        return jsonify({'ok': True, 'ast': ast_a_json(arbol)})
    except Exception as e:
        return jsonify({'ok': False, 'errores': [str(e)]}), 422


@app.route('/api/ping', methods=['GET'])
def ping():
    """Health-check — verifica que el servidor esté en línea."""
    return jsonify({'status': 'CYBER_DRIVE API online', 'version': '1.0'})


# ════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print("=" * 55)
    print("  CYBER_DRIVE — Compiler API v1.0")
    print("  Endpoints:")
    print("    POST /api/compilar")
    print("    POST /api/compilar_diagrama")
    print("    GET  /api/ping")
    print("  URL: http://localhost:5000")
    print("=" * 55)
    app.run(debug=True, port=5000)
