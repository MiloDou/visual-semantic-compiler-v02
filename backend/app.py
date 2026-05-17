# -*- coding: utf-8 -*-
"""
app.py — Servidor Flask para el IDE de Compiladores CYBER_DRIVE
Expone el pipeline completo (léxico → sintáctico → semántico → assembler + traducciones)
mediante un único endpoint POST /api/compilar que habla JSON.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from compilador_core import compilar_codigo

app = Flask(__name__)
CORS(app)  # permite peticiones desde el frontend React (localhost:5173)


# ───────────────────────────────────────────
# ENDPOINTS
# ───────────────────────────────────────────

@app.route('/api/compilar', methods=['POST'])
def compilar():
    """
    Body esperado (JSON):
        { "codigo": "int suma(int a, int b){ ... }" }

    Respuesta JSON:
    {
        "ok": true | false,
        "errores": [],
        "tokens": [{"tipo": "KEYWORD", "valor": "int"}, ...],
        "ast": { ... },
        "assembler": "section .text\n...",
        "tabla_simbolos": { "global": { ... } },
        "traducciones": {
            "python": "...",
            "javascript": "...",
            "ruby": "...",
            "rust": "..."
        },
        "cpp": "<código original>"
    }
    """
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({
            'ok': False,
            'errores': ['Se requiere el campo "codigo" en el body JSON'],
            'tokens': [], 'ast': None, 'assembler': '',
            'tabla_simbolos': {}, 'traducciones': {}, 'cpp': ''
        }), 400

    resultado = compilar_codigo(data['codigo'])
    status_code = 200 if resultado['ok'] else 422
    return jsonify(resultado), status_code


@app.route('/api/tokens', methods=['POST'])
def solo_tokens():
    """Solo análisis léxico — útil para depuración."""
    from compilador_core import identificar_tokens
    data = request.get_json(silent=True)
    if not data or 'codigo' not in data:
        return jsonify({'ok': False, 'errores': ['Falta campo "codigo"']}), 400
    try:
        tokens = identificar_tokens(data['codigo'])
        return jsonify({
            'ok': True,
            'tokens': [{'tipo': t[0], 'valor': t[1]} for t in tokens]
        })
    except Exception as e:
        return jsonify({'ok': False, 'errores': [str(e)]}), 500


@app.route('/api/ast', methods=['POST'])
def solo_ast():
    """Solo análisis léxico + sintáctico."""
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
    return jsonify({'status': 'CYBER_DRIVE API online', 'version': '1.0'})


# ───────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 50)
    print("  CYBER_DRIVE — Compiler API v1.0")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
