# -*- coding: utf-8 -*-
"""
app.py — Servidor Flask del IDE CYBER_DRIVE (Compiladores)
=============================================================
Endpoints REST:
  POST /api/compilar          → Compila código fuente texto (editor Monaco)
  POST /api/compilar_diagrama → Compila diagrama React Flow (JSON → C → ASM)
  POST /api/tokens            → Solo análisis léxico
  POST /api/ast               → Solo análisis léxico + sintáctico
  GET  /api/ping              → Health-check

Schema de respuesta (v2, usado por compilar_diagrama):
  {
    "ok":               bool,
    "c_code":           str,
    "assembler":        str,
    "execution_output": list,
    "errors":           list,
    "mermaid_syntax":   str,
    "tokens":           list,
    "ast":              dict,
    "tabla_simbolos":   dict,
    "traducciones":     dict
  }
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sock import Sock
from compilador_core import compilar_codigo
import subprocess
import tempfile
import shutil
import os

app = Flask(__name__)
CORS(app)
sock = Sock(app)


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Compilar código fuente texto
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/ejecutar_c', methods=['POST'])
def ejecutar_c():
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({'ok': False, 'error': 'Falta campo codigo'}), 400
    
    import subprocess, tempfile, shutil, os
    temp_dir = tempfile.mkdtemp()
    try:
        c_path  = os.path.join(temp_dir, 'programa.c')
        exe_path = os.path.join(temp_dir, 'programa')
        with open(c_path, 'w') as f:
            f.write('#include <stdio.h>\n')
            f.write(data['codigo'])
        result_gcc = subprocess.run(
            ['gcc', c_path, '-o', exe_path, '-lm'],
            capture_output=True, text=True
        )
        if result_gcc.returncode != 0:
            return jsonify({'ok': False, 'error': result_gcc.stderr}), 422
        stdin_data = data.get('stdin', '')
        result_exe = subprocess.run(
            [exe_path], input=stdin_data,
            capture_output=True, text=True, timeout=5
        )
        return jsonify({'ok': True, 'output': result_exe.stdout, 'stderr': result_exe.stderr})
    except subprocess.TimeoutExpired:
        return jsonify({'ok': False, 'error': 'Timeout'}), 422
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        shutil.rmtree(temp_dir)

@app.route('/api/compilar', methods=['POST'])
def compilar():
    """Compila código fuente en lenguaje C-like (editor Monaco)."""
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({
            'ok': False,
            'errores': ['Se requiere el campo "codigo" en el body JSON'],
            'tokens': [], 'ast': None, 'assembler': '',
            'tabla_simbolos': {}, 'traducciones': {}, 'cpp': ''
        }), 400

    resultado   = compilar_codigo(data['codigo'])
    status_code = 200 if resultado['ok'] else 422
    return jsonify(resultado), status_code


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Compilar diagrama visual (React Flow JSON)
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/compilar_diagrama', methods=['POST'])
def compilar_diagrama():
    """
    Recibe el JSON serializado del canvas React Flow y lo compila:
      1. diagrama_a_codigo()  → genera código C desde los nodos/aristas
      2. compilar_codigo()    → léxico + sintáctico + semántico + ensamblador
      3. generar_mermaid()    → genera sintaxis Mermaid del diagrama
    """
    data = request.get_json(silent=True)
    if not data or 'nodes' not in data or 'edges' not in data:
        return jsonify({
            'ok': False,
            'errors': ['Se requiere { nodes, edges } en el body JSON'],
            'c_code': '', 'assembler': '', 'execution_output': [],
            'mermaid_syntax': '', 'tokens': [], 'ast': None,
            'tabla_simbolos': {}, 'traducciones': {}
        }), 400

    nodes = data['nodes']
    edges = data['edges']

    # ── Paso 1: Diagrama → Código C ──────────────────────────────────────
    try:
        c_code = diagrama_a_codigo(nodes, edges)
    except Exception as e:
        return jsonify({
            'ok': False,
            'errors': [f'Error al convertir diagrama a C: {str(e)}'],
            'c_code': '', 'assembler': '', 'execution_output': [],
            'mermaid_syntax': generar_mermaid(nodes, edges),
            'tokens': [], 'ast': None, 'tabla_simbolos': {}, 'traducciones': {}
        }), 422

    # ── Paso 2: Compilar código C ─────────────────────────────────────────
    resultado = compilar_codigo(c_code)

    # ── Paso 3: Generar Mermaid ───────────────────────────────────────────
    mermaid_syntax = generar_mermaid(nodes, edges)

    return jsonify({
        'ok':               resultado.get('ok', False),
        'c_code':           c_code,
        'assembler':        resultado.get('assembler', ''),
        'execution_output': resultado.get('echo', []),
        'errors':           resultado.get('errores', []),
        'mermaid_syntax':   mermaid_syntax,
        'tokens':           resultado.get('tokens', []),
        'ast':              resultado.get('ast', None),
        'tabla_simbolos':   resultado.get('tabla_simbolos', {}),
        'traducciones':     resultado.get('traducciones', {}),
    }), (200 if resultado.get('ok') else 422)


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Modo ASM (Compilar y Ejecutar Ensamblador Puro)
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/run_asm', methods=['POST'])
def run_asm():
    """
    Recibe código ensamblador puro y lo ejecuta invocando a gcc.
    """
    import tempfile, subprocess, os
    data = request.get_json(silent=True)
    if not data or 'asm_code' not in data:
        return jsonify({
            'ok': False,
            'errors': ['Se requiere el campo "asm_code" en el body JSON'],
            'execution_output': []
        }), 400

    asm_code = data['asm_code']
    stdin_data = data.get('stdin', '')
    
    execution_output = []
    ok = False

    try:
        fd, temp_s = tempfile.mkstemp(suffix='.s')
        os.close(fd)
        temp_exe = temp_s.replace('.s', '.exe')
        
        with open(temp_s, 'w', encoding='utf-8') as f:
            f.write(asm_code)
        
        gcc_res = subprocess.run(['gcc', '-m32', temp_s, '-o', temp_exe], capture_output=True, text=True)
        if gcc_res.returncode != 0:
            execution_output = [f'Error compilando ASM con gcc:'] + gcc_res.stderr.splitlines()
        else:
            exe_res = subprocess.run([temp_exe], input=stdin_data, capture_output=True, text=True)
            lines = exe_res.stdout.splitlines()
            if exe_res.stderr:
                lines.extend(exe_res.stderr.splitlines())
            execution_output = lines
            ok = True
        
        try:
            if os.path.exists(temp_s): os.remove(temp_s)
            if os.path.exists(temp_exe): os.remove(temp_exe)
        except:
            pass

    except Exception as e:
        execution_output = [f'Error interno al ejecutar ASM: {str(e)}']

    return jsonify({
        'ok': ok,
        'execution_output': execution_output,
        'errors': [] if ok else execution_output
    }), (200 if ok else 422)


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Modo Interactivo via WebSockets
# ════════════════════════════════════════════════════════════════════════════

@sock.route('/api/ws/run')
def ws_run(ws):
    """
    Recibe JSON inicial: {"asm_code": "..."},
    pasa por NASM → GCC → Ejecutar.
    Envía stdout al WebSocket y recibe stdin desde él.
    """
    import json, tempfile, os, subprocess, threading, queue, re, shutil

    NASM_PATH = r'C:\Users\Usuario\AppData\Local\bin\NASM\nasm.exe'

    data_str = ws.receive()
    try:
        data = json.loads(data_str)
        asm_code = data.get('asm_code', '')
    except Exception as e:
        ws.send(json.dumps({'type': 'err', 'text': 'Datos iniciales inválidos.'}))
        return

    if not asm_code:
        ws.send(json.dumps({'type': 'err', 'text': 'No se proporcionó asm_code.'}))
        return

    # ── Transformar ASM de Linux a Windows/MinGW ──────────────────────────
    # En Windows/MinGW, las funciones de C llevan prefijo _
    asm_win = asm_code
    asm_win = asm_win.replace('extern printf',  'extern _printf')
    asm_win = asm_win.replace('extern scanf',   'extern _scanf')
    asm_win = asm_win.replace('extern fflush',  'extern _fflush')
    asm_win = asm_win.replace('global main',    'global _main')
    asm_win = re.sub(r'^main:', '_main:', asm_win, flags=re.MULTILINE)
    asm_win = asm_win.replace('call  printf',   'call  _printf')
    asm_win = asm_win.replace('call  scanf',    'call  _scanf')
    asm_win = asm_win.replace('call  fflush',   'call  _fflush')
    # Eliminar caracteres no-ASCII (unicode dashes ── en comentarios que NASM no entiende)
    asm_win = asm_win.encode('ascii', errors='ignore').decode('ascii')
    # Asegurar newline final
    if not asm_win.endswith('\n'):
        asm_win += '\n'

    # ── Crear archivos temporales ─────────────────────────────────────────
    temp_dir = tempfile.mkdtemp()
    temp_asm = os.path.join(temp_dir, 'programa.asm')
    temp_obj = os.path.join(temp_dir, 'programa.o')
    temp_exe = os.path.join(temp_dir, 'programa.exe')

    with open(temp_asm, 'w', encoding='utf-8') as f:
        f.write(asm_win)

    # ── Paso 1: NASM ─────────────────────────────────────────────────────
    ws.send(json.dumps({'type': 'info', 'text': 'Ensamblando con NASM...'}))
    nasm_res = subprocess.run(
        [NASM_PATH, '-f', 'win32', temp_asm, '-o', temp_obj],
        capture_output=True, text=True
    )
    if nasm_res.returncode != 0:
        ws.send(json.dumps({'type': 'err', 'text': f'Error en NASM:\n{nasm_res.stderr}'}))
        ws.send(json.dumps({'type': 'exit', 'code': nasm_res.returncode}))
        shutil.rmtree(temp_dir, ignore_errors=True)
        return

    # ── Paso 2: GCC (enlazar) ─────────────────────────────────────────────
    ws.send(json.dumps({'type': 'info', 'text': 'Enlazando con GCC...'}))
    gcc_res = subprocess.run(
        ['gcc', temp_obj, '-o', temp_exe],
        capture_output=True, text=True
    )
    if gcc_res.returncode != 0:
        ws.send(json.dumps({'type': 'err', 'text': f'Error en GCC:\n{gcc_res.stderr}'}))
        ws.send(json.dumps({'type': 'exit', 'code': gcc_res.returncode}))
        shutil.rmtree(temp_dir, ignore_errors=True)
        return

    # ── Paso 3: Ejecutar ──────────────────────────────────────────────────
    ws.send(json.dumps({'type': 'info', 'text': 'Ejecutando programa...'}))
    ws.send(json.dumps({'type': 'clear'}))

    proc = subprocess.Popen(
        [temp_exe],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
        universal_newlines=False
    )

    q = queue.Queue()

    def reader_thread():
        """Lee stdout del proceso y acumula bytes antes de encolarlos."""
        import time
        try:
            while True:
                # Leer el primer byte (bloqueante — espera a que haya datos)
                first = proc.stdout.read(1)
                if not first:
                    break
                buf = first
                # Leer todo lo que esté disponible sin bloquear
                time.sleep(0.02)  # Dar 20ms para que se llene el buffer
                import msvcrt, ctypes
                try:
                    # Windows: check how many bytes available in pipe
                    import ctypes.wintypes
                    kernel32 = ctypes.windll.kernel32
                    handle = msvcrt.get_osfhandle(proc.stdout.fileno())
                    avail = ctypes.wintypes.DWORD(0)
                    if kernel32.PeekNamedPipe(handle, None, 0, None, ctypes.byref(avail), None):
                        if avail.value > 0:
                            buf += proc.stdout.read(avail.value)
                except Exception:
                    pass
                q.put(buf.decode('utf-8', errors='replace'))
        except Exception:
            pass

    t = threading.Thread(target=reader_thread, daemon=True)
    t.start()

    try:
        while proc.poll() is None:
            # Acumular todo lo que haya en la cola en un solo envío
            combined = ''
            while not q.empty():
                combined += q.get_nowait()
            if combined:
                ws.send(json.dumps({'type': 'stdout', 'text': combined}))

            # Recibir datos del frontend (stdin)
            msg = ws.receive(timeout=0.05)
            if msg:
                try:
                    payload = json.loads(msg)
                    if payload.get('type') == 'stdin' and proc.stdin:
                        proc.stdin.write((payload.get('text', '') + '\n').encode('utf-8'))
                        proc.stdin.flush()
                except Exception:
                    pass
    except Exception:
        proc.kill()

    t.join(timeout=2)

    # Vaciar cola final
    combined = ''
    while not q.empty():
        combined += q.get_nowait()
    if combined:
        ws.send(json.dumps({'type': 'stdout', 'text': combined}))

    code = proc.poll()
    ws.send(json.dumps({'type': 'exit', 'code': code}))

    try:
        import time
        time.sleep(0.1)
        shutil.rmtree(temp_dir, ignore_errors=True)
    except:
        pass


# ════════════════════════════════════════════════════════════════════════════
# LÓGICA: Conversor Diagrama React Flow → Código C
# ════════════════════════════════════════════════════════════════════════════

def tipo_c(var_type):
    """Mapea tipo visual ('Entero'/'Flotante') a tipo C ('int'/'float')."""
    if not var_type:
        return 'int'
    v = var_type.strip().lower()
    return 'float' if v in ('flotante', 'float', 'double') else 'int'


def fmt_str(tipo):
    """Formato printf/scanf según tipo."""
    return '%f' if tipo == 'float' else '%d'


def limpiar_expr(expr):
    """Quita punto y coma final y espacios."""
    return (expr or '').strip().rstrip(';').strip()


def es_io_entrada(expr):
    """
    Detecta si la expresión del nodo IO es una entrada (leer / scanf).
    Patrones: 'leer x', 'leer: x', 'scanf x', 'input x', 'read x'
    """
    if not expr:
        return False, None
    e = expr.strip().lower()
    for kw in ('leer ', 'leer:', 'scanf ', 'input ', 'read '):
        if e.startswith(kw):
            var = expr.strip()[len(kw):].strip().rstrip(';').strip()
            return True, var
    return False, None


def es_io_salida_string(expr):
    """Detecta si la expresión es un literal de string (empieza con comilla)."""
    return expr and expr.strip().startswith('"')


def diagrama_a_codigo(nodes, edges):
    """
    Recorre el grafo dirigido del canvas en orden topológico y genera
    código fuente compatible con el compilador (C-like).

    Tipos de nodo soportados:
      inicio     → int main() {
      fin        → return 0; }
      asignacion → int n = 0;  o  float x = 1.0;
      proceso    → expresión arbitraria: n = n * i;
      condicion  → if(...){...}else{...}  o  while(...)  según estructura SI/NO
      ciclo      → while(<expr>) { ... }
      io         → leer n → scanf("%d", &n);  o  imprimir x → println x;
      print      → println x;
    """
    # ── Índices ──────────────────────────────────────────────────────────
    node_map = {n['id']: n for n in nodes}

    adj_out = {}   # source_id → [{ target, label }]
    adj_in  = {}   # target_id → [source_id]
    for e in edges:
        adj_out.setdefault(e['source'], []).append({
            'target': e['target'],
            'label':  (e.get('label') or '').strip().upper()
        })
        adj_in.setdefault(e['target'], []).append(e['source'])

    # ── Localizar nodo de inicio ─────────────────────────────────────────
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

    # ── Estado ────────────────────────────────────────────────────────────
    lineas    = []
    visitados = set()

    # ── Helpers ───────────────────────────────────────────────────────────

    def rama_si(salidas):
        """Devuelve el target de la rama SI (verdadera)."""
        for s in salidas:
            if s['label'] in ('SI', 'YES', 'TRUE', 'S', 'SÍ'):
                return s['target']
        # Si no hay etiqueta explícita SI, la primera arista es SI
        for s in salidas:
            if s['label'] not in ('NO', 'FALSE', 'N'):
                return s['target']
        return None

    def rama_no(salidas):
        """Devuelve el target de la rama NO (falsa)."""
        for s in salidas:
            if s['label'] in ('NO', 'FALSE', 'N'):
                return s['target']
        return None

    def path_exists(from_id, to_id, depth=40, seen=None):
        """¿Existe un camino dirigido de from_id a to_id?"""
        if seen is None:
            seen = set()
        if depth <= 0 or from_id in seen:
            return False
        seen.add(from_id)
        for s in adj_out.get(from_id, []):
            if s['target'] == to_id:
                return True
            if path_exists(s['target'], to_id, depth - 1, seen):
                return True
        return False

    def find_join(si_id, no_id, max_depth=35):
        """
        BFS simultáneo para encontrar el nodo de convergencia
        (primer nodo alcanzable desde ambas ramas).
        """
        if not si_id or not no_id:
            return None
        reach_si = {}
        reach_no = {}
        q_si = [si_id]
        q_no = [no_id]
        for _ in range(max_depth):
            if q_si:
                cur = q_si.pop(0)
                if cur in reach_no:
                    return cur
                if cur not in reach_si:
                    reach_si[cur] = True
                    for s in adj_out.get(cur, []):
                        q_si.append(s['target'])
            if q_no:
                cur = q_no.pop(0)
                if cur in reach_si:
                    return cur
                if cur not in reach_no:
                    reach_no[cur] = True
                    for s in adj_out.get(cur, []):
                        q_no.append(s['target'])
        return None

    def emit_node_code(ntype, n, pad):
        """Emite el código de un único nodo (sin recursión)."""
        if ntype in ('inicio', 'fin'):
            return  # manejado por recorrer

        if ntype == 'asignacion':
            expr_label = limpiar_expr(n.get('label') or '')
            # ¿Es una expresión directa? (ej: "int x = 0")
            if expr_label and expr_label.lower() not in ('declarar', 'asignacion', 'declarar'):
                import re
                if re.match(r'^(int|float)\s+\w+\s*=', expr_label, re.IGNORECASE):
                    lineas.append(f'{pad}{expr_label};')
                    return
            # Campos individuales
            vn = (n.get('varName')  or 'x').strip()
            vt = tipo_c(n.get('varType'))
            vv = (n.get('varValue') or '0').strip()
            lineas.append(f'{pad}{vt} {vn} = {vv};')

        elif ntype == 'proceso':
            expr = limpiar_expr(n.get('expr') or n.get('label') or '')
            if expr and expr.lower() not in ('proceso', ''):
                lineas.append(f'{pad}{expr};')

        elif ntype in ('io', 'print'):
            raw = (n.get('expr') or n.get('label') or '').strip()
            clean = limpiar_expr(raw)

            if ntype == 'io':
                is_entrada, var_io = es_io_entrada(clean)
                if is_entrada and var_io:
                    # Entrada: scanf("%d", variable) (sin & porque el lexer no lo reconoce)
                    lineas.append(f'{pad}scanf("%d", {var_io});')
                    return

            # Salida: puede ser string literal o variable
            if es_io_salida_string(clean):
                # String literal → println "msg" (el parser conoce NodoPrintln con NodoString)
                lineas.append(f'{pad}println {clean};')
            elif clean and clean.lower() not in ('i/o', 'imprimir', 'io', 'print', ''):
                if ' ' in clean and '=' not in clean and not clean.startswith('"'):
                    # Probable string sin comillas
                    lineas.append(f'{pad}println "{clean}";')
                elif '=' in clean:
                    # Usuario puso una asignación en bloque I/O
                    lineas.append(f'{pad}{clean};')
                else:
                    lineas.append(f'{pad}println {clean};')



    def recorrer_bloque(start_id, stop_id, indent, depth=80):
        """Recorre nodos desde start_id hasta stop_id (exclusivo)."""
        cur = start_id
        seen_local = set()
        while cur and cur != stop_id and depth > 0:
            if cur in visitados or cur in seen_local:
                break
            seen_local.add(cur)
            visitados.add(cur)
            n     = node_map.get(cur)
            if not n:
                break
            ntype = (n.get('type') or 'proceso').lower()
            pad   = '    ' * indent
            depth -= 1

            if ntype == 'fin':
                break
            if ntype == 'inicio':
                pass
            elif ntype == 'condicion':
                recorrer_condicion(cur, n, indent, depth)
                return  # la condición maneja el avance
            elif ntype == 'ciclo':
                recorrer_ciclo(cur, n, indent, depth)
                return
            else:
                emit_node_code(ntype, n, pad)

            salidas = adj_out.get(cur, [])
            si_target = rama_si(salidas)
            cur = si_target

    def recorrer_condicion(node_id, n, indent, depth):
        """Emite un if/else o while para un nodo condicion."""
        pad     = '    ' * indent
        expr    = limpiar_expr(n.get('expr') or n.get('label') or 'false')
        if expr.lower() in ('condición', 'condicion', ''):
            expr = 'false'

        salidas  = adj_out.get(node_id, [])
        si_tgt   = rama_si(salidas)
        no_tgt   = rama_no(salidas)

        # Detectar WHILE: alguna rama regresa a este nodo
        es_while_si = si_tgt and path_exists(si_tgt, node_id)
        es_while_no = no_tgt and path_exists(no_tgt, node_id)

        if es_while_si or es_while_no:
            # Es un WHILE
            cuerpo_id = si_tgt if es_while_si else no_tgt
            salida_id = no_tgt if es_while_si else si_tgt

            lineas.append(f'{pad}while ({expr}) {{')
            recorrer_bloque(cuerpo_id, node_id, indent + 1, depth - 1)
            lineas.append(f'{pad}}}')

            if salida_id and salida_id not in visitados:
                recorrer_bloque(salida_id, None, indent, depth - 1)
        else:
            # Es un IF/ELSE
            join_id = find_join(si_tgt, no_tgt)

            lineas.append(f'{pad}if ({expr}) {{')
            if si_tgt and si_tgt not in visitados:
                recorrer_bloque(si_tgt, join_id, indent + 1, depth - 1)
            if no_tgt and no_tgt not in visitados:
                lineas.append(f'{pad}}} else {{')
                recorrer_bloque(no_tgt, join_id, indent + 1, depth - 1)
            lineas.append(f'{pad}}}')

            if join_id and join_id not in visitados:
                recorrer_bloque(join_id, None, indent, depth - 1)

    def recorrer_ciclo(node_id, n, indent, depth):
        """Emite un while para un nodo hexágono (ciclo explícito)."""
        pad  = '    ' * indent
        expr = limpiar_expr(n.get('expr') or n.get('label') or 'true')
        if expr.lower() in ('ciclo', ''):
            expr = 'true'

        salidas = adj_out.get(node_id, [])
        lineas.append(f'{pad}while ({expr}) {{')
        for s in salidas:
            recorrer_bloque(s['target'], node_id, indent + 1, depth - 1)
            break  # solo primera salida como cuerpo
        lineas.append(f'{pad}}}')

        # Salida del ciclo (la arista que sale hacia afuera)
        for s in salidas:
            if not path_exists(s['target'], node_id):
                if s['target'] not in visitados:
                    recorrer_bloque(s['target'], None, indent, depth - 1)
                break

    def recorrer(node_id, indent=1, depth=150):
        """Recorrido principal del grafo desde INICIO."""
        cur = node_id
        safety = 0
        while cur and safety < 200:
            safety += 1
            if cur in visitados:
                break
            visitados.add(cur)

            n     = node_map.get(cur)
            if not n:
                break
            ntype = (n.get('type') or 'proceso').lower()
            pad   = '    ' * indent

            if ntype == 'fin':
                lineas.append(f'{pad}return 0;')
                break

            if ntype == 'inicio':
                pass  # solo avanza
            elif ntype == 'condicion':
                recorrer_condicion(cur, n, indent, depth)
                return
            elif ntype == 'ciclo':
                recorrer_ciclo(cur, n, indent, depth)
                return
            else:
                emit_node_code(ntype, n, pad)

            salidas = adj_out.get(cur, [])
            si_tgt  = rama_si(salidas)
            if si_tgt and si_tgt not in visitados:
                cur = si_tgt
            else:
                # Avanzar por cualquier salida no visitada
                next_cur = None
                for s in salidas:
                    if s['target'] not in visitados:
                        next_cur = s['target']
                        break
                cur = next_cur

    # ── Generar código final ──────────────────────────────────────────────
    lineas.append('int main(){')
    recorrer(inicio['id'], indent=1)
    # Asegurar return 0
    if not any(l.strip().startswith('return') for l in lineas):
        lineas.append('    return 0;')
    lineas.append('}')
    return '\n'.join(lineas)


# ════════════════════════════════════════════════════════════════════════════
# LÓGICA: Generador de sintaxis Mermaid desde el diagrama
# ════════════════════════════════════════════════════════════════════════════

def generar_mermaid(nodes, edges):
    """Convierte el grafo de nodos/aristas en sintaxis Mermaid (flowchart TD)."""
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
        elif ntype == 'ciclo':
            lines.append(f'    {nid}[["{label}"]]')
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
    """Health-check."""
    return jsonify({'status': 'CYBER_DRIVE API online', 'version': '2.0'})


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINT: Ejecutar código ASM
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/ejecutar_asm', methods=['POST'])
def ejecutar_asm():
    """
    Recibe {"asm": "...código asm..."}, lo compila con nasm y gcc,
    y ejecuta el programa resultante, capturando stdout/stderr.
    """
    data = request.get_json(silent=True)
    if not data or 'asm' not in data:
        return jsonify({
            'ok': False,
            'error': 'Se requiere el campo "asm" en el body JSON'
        }), 400
    
    asm_code = data['asm']
    temp_dir = None
    
    try:
        # Crear directorio temporal
        temp_dir = tempfile.mkdtemp()
        asm_path = os.path.join(temp_dir, 'programa.asm')
        obj_path = os.path.join(temp_dir, 'programa.o')
        exe_path = os.path.join(temp_dir, 'programa')
        
        # Guardar el código ASM
        with open(asm_path, 'w') as f:
            f.write(asm_code)
        
        # Compilar con nasm
        result_nasm = subprocess.run(
            ['nasm', '-f', 'elf32', asm_path, '-o', obj_path],
            capture_output=True,
            text=True
        )
        
        if result_nasm.returncode != 0:
            print(f'NASM ERROR: {result_nasm.stderr}')
            return jsonify({
                'ok': False,
                'error': f'Error en nasm: {result_nasm.stderr}'
            }), 422
        
        # Enlazar con gcc
        result_gcc = subprocess.run(
            ['gcc', '-m32', obj_path, '-o', exe_path, '-no-pie', '-nostartfiles'],
            capture_output=True,
            text=True
        )
        
        if result_gcc.returncode != 0:
            print(f'GCC ERROR: {result_gcc.stderr}')
            return jsonify({
                'ok': False,
                'error': f'Error en gcc: {result_gcc.stderr}'
            }), 422
        
        # Ejecutar el programa
        stdin_data = data.get('stdin', '')
        result_exe = subprocess.run(
            [exe_path],
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=5
        )
        
        return jsonify({
            'ok': True,
            'output': result_exe.stdout,
            'stderr': result_exe.stderr
        }), 200
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'ok': False,
            'error': 'Timeout: el programa tardó más de 5 segundos'
        }), 422
    except Exception as e:
        return jsonify({
            'ok': False,
            'error': f'Error ejecutando ASM: {str(e)}'
        }), 500
    finally:
        # Limpiar directorio temporal
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


# ════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print("=" * 55)
    print("  CYBER_DRIVE — Compiler API v2.0")
    print("  Endpoints:")
    print("    POST /api/compilar")
    print("    POST /api/compilar_diagrama")
    print("    GET  /api/ping")
    print("  URL: http://localhost:5000")
    print("=" * 55)
    app.run(debug=True, port=5000)
