# -*- coding: utf-8 -*-
"""
compilador_core.py
Módulo del compilador: Léxico + Parser + AST + Semántico + Generación de código.
"""

import re
import json

# ─────────────────────────────────────────────
# ANÁLISIS LÉXICO
# ─────────────────────────────────────────────
token_patron = {
    "COMMENT_LINE":  r'//[^\n]*',
    "COMMENT_BLOCK": r'/\*[\s\S]*?\*/',
    "INCLUDE":       r'#\s*include\s*[<"][^>"]*[>"]',
    "STRING":        r'"[^"]*"',
    "CHAR":          r"'[^']*'",
    "KEYWORD":       r'\b(if|else|while|for|return|int|float|double|char|void|bool|long|short|unsigned|print|println|cout|scanf|printf|break|continue)\b',
    "IDENTIFIER":    r'\b[a-zA-Z_][a-zA-Z0-9_]*\b',
    "FLOAT":         r'\b\d+\.\d+(?:[eE][+-]?\d+)?\b',
    "NUMBER":        r'\b\d+\b',
    "LOGIC_OP":      r'&&|\|\|',
    "OPERATOR":      r'\+\+|--|<<=|>>=|<<|>>|==|!=|<=|>=|[+\-*/=<>!%&|^~]',
    "AMPERSAND":     r'&',
    "DELIMITER":     r'[(),;{}[\]]',
    "WHITESPACE":    r'[ \t]+',
    "NEWLINE":       r'\n',
}

def identificar_tokens(texto):
    patron_general = "|".join(
        f"(?P<{tok}>{pat})" for tok, pat in token_patron.items()
    )
    patron_regex = re.compile(patron_general)
    tokens_encontrados = []
    pos = 0
    for match in patron_regex.finditer(texto):
        if match.start() > pos:
            valor_error = texto[pos:match.start()]
            tokens_encontrados.append(('ERROR', valor_error))
        tipo = match.lastgroup
        valor = match.group()
        # Ignorar espacios en blanco (no newlines), comentarios e includes
        if tipo in ('WHITESPACE', 'COMMENT_LINE', 'COMMENT_BLOCK', 'INCLUDE'):
            pass
        elif tipo == 'NEWLINE':
            tokens_encontrados.append(('NEWLINE', '\n'))
        else:
            tokens_encontrados.append((tipo, valor))
        pos = match.end()
    if pos < len(texto):
        valor_error = texto[pos:]
        tokens_encontrados.append(('ERROR', valor_error))
    return tokens_encontrados


# ─────────────────────────────────────────────
# NODOS AST
# ─────────────────────────────────────────────
_asm_data = []
_asm_label_counter = 0

class NodoAST:
    def traducirPy(self):   raise NotImplementedError
    def traducirJS(self):   raise NotImplementedError
    def traducirRuby(self): raise NotImplementedError
    def traducirRust(self): raise NotImplementedError
    def generarAssembler(self): raise NotImplementedError

class NodoPrograma(NodoAST):
    def __init__(self, funciones, main):
        self.variables = []
        self.funciones = funciones
        self.main = main

    def traducirPy(self):
        partes = [f.traducirPy() for f in self.funciones]
        if self.main: partes.append(self.main.traducirPy())
        return "\n\n".join(partes)

    def traducirJS(self):
        partes = [f.traducirJS() for f in self.funciones]
        if self.main: partes.append(self.main.traducirJS())
        return "\n\n".join(partes)

    def traducirRuby(self):
        partes = [f.traducirRuby() for f in self.funciones]
        if self.main: partes.append(self.main.traducirRuby())
        return "\n\n".join(partes)

    def traducirRust(self):
        partes = [f.traducirRust() for f in self.funciones]
        if self.main: partes.append(self.main.traducirRust())
        return "\n\n".join(partes)

    def generarAssembler(self):
        global _asm_data
        _asm_data = []
        self.variables = []

        def recolectar_variables(instrucciones):
            for inst in instrucciones:
                if isinstance(inst, NodoAsignacion) and inst.tipo is not None:
                    self.variables.append((inst.tipo[1], inst.nombre[1]))
                elif isinstance(inst, NodoIf):
                    recolectar_variables(inst.cuerpo_if)
                    if inst.cuerpo_else:
                        recolectar_variables(inst.cuerpo_else)
                elif isinstance(inst, NodoWhile):
                    recolectar_variables(inst.cuerpo)
                elif isinstance(inst, NodoFor):
                    recolectar_variables([inst.inicializacion])
                    recolectar_variables(inst.cuerpo)

        codigo = [
            "extern printf",
            "extern scanf",
            "extern fflush",
            "section .text",
            "global main"
        ]
        data = [
            "section .data",
            '    fmt_int    db "%d", 0',
            '    fmt_int_ln db "%d", 10, 0',
            '    fmt_float  db "%f", 0',
            '    fmt_float_ln db "%f", 10, 0',
            '    fmt_str    db "%s", 0',
            '    fmt_str_ln db "%s", 10, 0',
            '    fmt_scanf  db "%d", 0',
            '    msg_pide   db "Ingrese un numero entero positivo: ", 0'
        ]
        bss = ["section .bss"]

        for funcion in self.funciones:
            codigo.append(funcion.generarAssembler())
            recolectar_variables(funcion.cuerpo)
            for inst in funcion.cuerpo:
                if hasattr(inst, 'expresion') and isinstance(inst.expresion, NodoFloat):
                    val = inst.expresion.valor[1]
                    etiqueta = "val_" + val.replace(".", "_")
                    entry = f'    {etiqueta}  dd {val}'
                    if entry not in data:
                        data.append(entry)
            for param in funcion.parametros:
                self.variables.append((param.tipo[1], param.nombre[1]))

        codigo.append("main:")
        if self.main:
            recolectar_variables(self.main.cuerpo)
            codigo.append(self.main.generarAssembler())

        codigo.append("    mov eax, 0")
        codigo.append("    ret")

        for entry in _asm_data:
            if entry not in data:
                data.append(entry)

        seen = set()
        for variable in self.variables:
            key = variable[1]
            if key not in seen:
                seen.add(key)
                if variable[0] in ('int', 'long', 'short', 'unsigned'):
                    bss.append(f'    {variable[1]}: resd 1')
                elif variable[0] in ('float', 'double'):
                    bss.append(f'    {variable[1]}: resd 1')

        return "\n".join(data) + "\n" + "\n".join(bss) + "\n" + "\n".join(codigo)


class NodoFuncion(NodoAST):
    def __init__(self, tipo, nombre, parametros, cuerpo):
        self.tipo = tipo
        self.nombre = nombre
        self.parametros = parametros
        self.cuerpo = cuerpo

    def traducirPy(self):
        params = ", ".join(p.traducirPy() for p in self.parametros)
        cuerpo = "\n    ".join(c.traducirPy() for c in self.cuerpo)
        return f"def {self.nombre[1]}({params}):\n    {cuerpo}"

    def traducirJS(self):
        params = ", ".join(p.traducirJS() for p in self.parametros)
        cuerpo = "\n    ".join(c.traducirJS() for c in self.cuerpo)
        return f"function {self.nombre[1]}({params}) {{\n    {cuerpo}\n}}"

    def traducirRuby(self):
        params = ", ".join(p.traducirRuby() for p in self.parametros)
        cuerpo = "\n    ".join(c.traducirRuby() for c in self.cuerpo)
        return f"def {self.nombre[1]}({params})\n    {cuerpo}\nend"

    def traducirRust(self):
        params = ", ".join(p.traducirRust() for p in self.parametros)
        cuerpo = "\n    ".join(c.traducirRust() for c in self.cuerpo)
        ret = " -> i32" if self.tipo[1] == "int" else (" -> f32" if self.tipo[1] in ("float","double") else "")
        return f"fn {self.nombre[1]}({params}){ret} {{\n    {cuerpo}\n}}"

    def generarAssembler(self):
        if self.nombre[1] != 'main':
            codigo = f"{self.nombre[1]}:\n"
            codigo += "    push  ebp\n"
            codigo += "    mov   ebp, esp\n"
            for idx, param in enumerate(self.parametros):
                offset = 8 + idx * 4
                codigo += f"    mov   eax, [ebp+{offset}]\n"
                codigo += f"    mov   [{param.nombre[1]}], eax\n"
        else:
            codigo = ""
        
        if self.nombre[1] == 'main':
            partes = []
            for c in self.cuerpo:
                if isinstance(c, NodoRetorno):
                    partes.append(c.generarAssembler(en_main=True))
                else:
                    partes.append(c.generarAssembler())
            codigo += "\n".join(partes)
        else:
            codigo += "\n".join(c.generarAssembler() for c in self.cuerpo)
        
        if self.nombre[1] != 'main':
            ultimo = self.cuerpo[-1] if self.cuerpo else None
            if not isinstance(ultimo, NodoRetorno):
                codigo += "\n    pop   ebp\n"
                codigo += "    ret\n"
        return codigo


class NodoParametro(NodoAST):
    def __init__(self, tipo, nombre):
        self.tipo = tipo
        self.nombre = nombre

    def traducirPy(self):   return self.nombre[1]
    def traducirJS(self):   return self.nombre[1]
    def traducirRuby(self): return self.nombre[1]
    def traducirRust(self):
        t = "i32" if self.tipo[1] == "int" else ("f32" if self.tipo[1] in ("float","double") else self.tipo[1])
        return f"{self.nombre[1]}: {t}"
    def generarAssembler(self): return ""


class NodoAsignacion(NodoAST):
    def __init__(self, tipo, nombre, expresion):
        self.tipo = tipo
        self.nombre = nombre
        self.expresion = expresion

    def traducirPy(self):   return f"{self.nombre[1]} = {self.expresion.traducirPy()}"
    def traducirJS(self):
        kw = "let " if self.tipo else ""
        return f"{kw}{self.nombre[1]} = {self.expresion.traducirJS()};"
    def traducirRuby(self): return f"{self.nombre[1]} = {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"let {self.nombre[1]} = {self.expresion.traducirRust()};"

    def generarAssembler(self):
        codigo = self.expresion.generarAssembler()
        if isinstance(self.expresion, NodoFloat):
            codigo += f"\n    fstp dword [{self.nombre[1]}]"
        else:
            codigo += f"\n    mov [{self.nombre[1]}], eax"
        return codigo


class NodoOperacion(NodoAST):
    def __init__(self, izquierda, operador, derecha):
        self.izquierda = izquierda
        self.operador  = operador
        self.derecha   = derecha

    def traducirPy(self):
        op = self.operador[1]
        if op == '&&': op = 'and'
        elif op == '||': op = 'or'
        return f"{self.izquierda.traducirPy()} {op} {self.derecha.traducirPy()}"
    def traducirJS(self):   return f"{self.izquierda.traducirJS()} {self.operador[1]} {self.derecha.traducirJS()}"
    def traducirRuby(self):
        op = self.operador[1]
        if op == '&&': op = '&&'
        elif op == '||': op = '||'
        return f"{self.izquierda.traducirRuby()} {op} {self.derecha.traducirRuby()}"
    def traducirRust(self):   return f"{self.izquierda.traducirRust()} {self.operador[1]} {self.derecha.traducirRust()}"

    def generarAssembler(self):
        codigo = []
        codigo.append(self.izquierda.generarAssembler())
        codigo.append("    push  eax")
        codigo.append(self.derecha.generarAssembler())
        codigo.append("    mov   ebx, eax")
        codigo.append("    pop   eax")
        op = self.operador[1]
        if   op == '+': codigo.append("    add   eax, ebx")
        elif op == '-': codigo.append("    sub   eax, ebx")
        elif op == '*': codigo.append("    imul  eax, ebx")
        elif op == '/':
            codigo.append("    xor   edx, edx")
            codigo.append("    idiv  ebx")
        elif op == '%':
            codigo.append("    xor   edx, edx")
            codigo.append("    idiv  ebx")
            codigo.append("    mov   eax, edx")
        elif op in ['==', '!=', '>', '<', '>=', '<=']:
            codigo.append("    cmp   eax, ebx")
            if op == '==': codigo.append("    sete  al")
            elif op == '!=': codigo.append("    setne al")
            elif op == '>':  codigo.append("    setg  al")
            elif op == '<':  codigo.append("    setl  al")
            elif op == '>=': codigo.append("    setge al")
            elif op == '<=': codigo.append("    setle al")
            codigo.append("    movzx eax, al")
        return "\n".join(codigo)


class NodoRetorno(NodoAST):
    def __init__(self, expresion):
        self.expresion = expresion

    def traducirPy(self):   return f"return {self.expresion.traducirPy()}"
    def traducirJS(self):   return f"return {self.expresion.traducirJS()};"
    def traducirRuby(self): return f"return {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"return {self.expresion.traducirRust()};"
    def generarAssembler(self, en_main=False):
        codigo = self.expresion.generarAssembler()
        if not en_main:
            codigo += "\n    pop   ebp"
            codigo += "\n    ret"
        return codigo


class NodoPrint(NodoAST):
    def __init__(self, expresion):
        self.expresion = expresion

    def traducirPy(self):   return f"print({self.expresion.traducirPy()}, end='')"
    def traducirJS(self):   return f"process.stdout.write(String({self.expresion.traducirJS()}));"
    def traducirRuby(self): return f"print {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"print!(\"{{}}\", {self.expresion.traducirRust()});"

    def generarAssembler(self):
        if isinstance(self.expresion, NodoString):
            lbl = self.expresion.generarAssembler()
            res  = f"\n    ; ── printf(\"%s\", str)"
            res += f"\n    push  {lbl}"
            res += "\n    push  fmt_str"
            res += "\n    call  printf"
            res += "\n    add   esp, 8"
            res += "\n    push  0\n    call  fflush\n    add   esp, 4"
            return res
        res  = self.expresion.generarAssembler()
        res += "\n    push  eax"
        res += "\n    push  fmt_int"
        res += "\n    call  printf"
        res += "\n    add   esp, 8"
        res += "\n    push  0\n    call  fflush\n    add   esp, 4"
        return res


class NodoPrintln(NodoAST):
    def __init__(self, expresion):
        self.expresion = expresion

    def traducirPy(self):   return f"print({self.expresion.traducirPy()})"
    def traducirJS(self):   return f"console.log({self.expresion.traducirJS()});"
    def traducirRuby(self): return f"puts {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"println!(\"{{}}\", {self.expresion.traducirRust()});"

    def generarAssembler(self):
        if isinstance(self.expresion, NodoString):
            lbl = self.expresion.generarAssembler()
            res  = f"\n    ; ── printf(\"%s\\n\", str)"
            res += f"\n    push  {lbl}"
            res += "\n    push  fmt_str_ln"
            res += "\n    call  printf"
            res += "\n    add   esp, 8"
            res += "\n    push  0\n    call  fflush\n    add   esp, 4"
            return res
        res  = self.expresion.generarAssembler()
        res += "\n    push  eax"
        res += "\n    push  fmt_int_ln"
        res += "\n    call  printf"
        res += "\n    add   esp, 8"
        res += "\n    push  0\n    call  fflush\n    add   esp, 4"
        return res


class NodoPrintf(NodoAST):
    """Nodo para printf("formato", arg1, arg2, ...)"""
    def __init__(self, formato, argumentos):
        self.formato    = formato
        self.argumentos = argumentos

    def traducirPy(self):
        args = ", ".join(a.traducirPy() for a in self.argumentos)
        fmt  = self.formato.valor[1] if isinstance(self.formato, NodoString) else self.formato.traducirPy()
        # Convertir formato printf a f-string básico
        fmt_limpio = fmt.strip('"').replace('%d','{}').replace('%f','{}').replace('%s','{}').replace('%i','{}')
        if self.argumentos:
            return f"print({repr(fmt_limpio)}.format({args}))"
        return f"print({fmt})"

    def traducirJS(self):
        args = ", ".join(a.traducirJS() for a in self.argumentos)
        return f"console.log({self.formato.traducirJS()}{', ' + args if args else ''});"

    def traducirRuby(self):
        args = ", ".join(a.traducirRuby() for a in self.argumentos)
        return f"printf({self.formato.traducirRuby()}{', ' + args if args else ''});"

    def traducirRust(self):
        args = ", ".join(a.traducirRust() for a in self.argumentos)
        fmt  = self.formato.valor[1] if isinstance(self.formato, NodoString) else '""'
        fmt_rust = fmt.strip('"').replace('%d','{}').replace('%f','{}').replace('%s','{}').replace('%i','{}')
        if self.argumentos:
            return f"print!(\"{fmt_rust}\", {args});"
        return f"print!(\"{fmt_rust}\");"

    def generarAssembler(self):
        codigo = []
        # Push argumentos en orden inverso
        for arg in reversed(self.argumentos):
            codigo.append(arg.generarAssembler())
            codigo.append("    push  eax")
        # Push formato
        if isinstance(self.formato, NodoString):
            lbl = self.formato.generarAssembler()
            codigo.append(f"    push  {lbl}")
        else:
            codigo.append(self.formato.generarAssembler())
            codigo.append("    push  eax")
        codigo.append("    call  printf")
        n_args = len(self.argumentos) + 1
        codigo.append(f"    add   esp, {n_args * 4}")
        codigo.append("    push  0\n    call  fflush\n    add   esp, 4")
        return "\n".join(codigo)


class NodoIf(NodoAST):
    def __init__(self, condicion, cuerpo_if, cuerpo_else):
        self.condicion  = condicion
        self.cuerpo_if  = cuerpo_if
        self.cuerpo_else = cuerpo_else

    def traducirPy(self):
        cond = self.condicion.traducirPy()
        body = "\n    ".join(c.traducirPy() for c in self.cuerpo_if)
        out  = f"if {cond}:\n    {body}"
        if self.cuerpo_else:
            ebod = "\n    ".join(c.traducirPy() for c in self.cuerpo_else)
            out += f"\nelse:\n    {ebod}"
        return out

    def traducirJS(self):
        cond = self.condicion.traducirJS()
        body = "\n    ".join(c.traducirJS() for c in self.cuerpo_if)
        out  = f"if ({cond}) {{\n    {body}\n}}"
        if self.cuerpo_else:
            ebod = "\n    ".join(c.traducirJS() for c in self.cuerpo_else)
            out += f" else {{\n    {ebod}\n}}"
        return out

    def traducirRuby(self):
        cond = self.condicion.traducirRuby()
        body = "\n    ".join(c.traducirRuby() for c in self.cuerpo_if)
        out  = f"if {cond}\n    {body}\nend"
        if self.cuerpo_else:
            ebod = "\n    ".join(c.traducirRuby() for c in self.cuerpo_else)
            out = f"if {cond}\n    {body}\nelse\n    {ebod}\nend"
        return out

    def traducirRust(self):
        cond = self.condicion.traducirRust()
        body = "\n    ".join(c.traducirRust() for c in self.cuerpo_if)
        out  = f"if {cond} {{\n    {body}\n}}"
        if self.cuerpo_else:
            ebod = "\n    ".join(c.traducirRust() for c in self.cuerpo_else)
            out += f" else {{\n    {ebod}\n}}"
        return out

    def generarAssembler(self):
        global _asm_label_counter
        _asm_label_counter += 1
        lbl = f"if_{_asm_label_counter}"

        codigo = []
        codigo.append(f"    ; ── IF ──────────────────────────────────────────")
        codigo.append(self.condicion.generarAssembler())
        codigo.append("    cmp   eax, 0")
        codigo.append(f"    je    {lbl}_else")

        for inst in self.cuerpo_if:
            codigo.append(inst.generarAssembler())

        ultimo_if = self.cuerpo_if[-1] if self.cuerpo_if else None
        if not isinstance(ultimo_if, NodoRetorno):
            codigo.append(f"    jmp   {lbl}_end")

        codigo.append(f"{lbl}_else:")

        if self.cuerpo_else:
            for inst in self.cuerpo_else:
                codigo.append(inst.generarAssembler())

        codigo.append(f"{lbl}_end:")
        return "\n".join(codigo)


class NodoWhile(NodoAST):
    def __init__(self, condicion, cuerpo):
        self.condicion = condicion
        self.cuerpo    = cuerpo

    def traducirPy(self):
        cond = self.condicion.traducirPy()
        body = "\n    ".join(c.traducirPy() for c in self.cuerpo)
        return f"while {cond}:\n    {body}"

    def traducirJS(self):
        cond = self.condicion.traducirJS()
        body = "\n    ".join(c.traducirJS() for c in self.cuerpo)
        return f"while ({cond}) {{\n    {body}\n}}"

    def traducirRuby(self):
        cond = self.condicion.traducirRuby()
        body = "\n    ".join(c.traducirRuby() for c in self.cuerpo)
        return f"while {cond}\n    {body}\nend"

    def traducirRust(self):
        cond = self.condicion.traducirRust()
        body = "\n    ".join(c.traducirRust() for c in self.cuerpo)
        return f"while {cond} {{\n    {body}\n}}"

    def generarAssembler(self):
        global _asm_label_counter
        _asm_label_counter += 1
        lbl = f"while_{_asm_label_counter}"

        codigo = []
        codigo.append(f"    ; ── WHILE ───────────────────────────────────────")
        codigo.append(f"{lbl}_start:")
        codigo.append(self.condicion.generarAssembler())
        codigo.append("    cmp   eax, 0")
        codigo.append(f"    je    {lbl}_end")

        for inst in self.cuerpo:
            codigo.append(inst.generarAssembler())

        codigo.append(f"    jmp   {lbl}_start")
        codigo.append(f"{lbl}_end:")
        return "\n".join(codigo)


class NodoFor(NodoAST):
    def __init__(self, inicializacion, condicion, incremento, cuerpo):
        self.inicializacion = inicializacion
        self.condicion      = condicion
        self.incremento     = incremento
        self.cuerpo         = cuerpo

    def traducirPy(self):
        init = self.inicializacion.traducirPy()
        cond = self.condicion.traducirPy()
        incr = self.incremento.traducirPy()
        body = "\n    ".join(c.traducirPy() for c in self.cuerpo)
        return f"{init}\nwhile {cond}:\n    {body}\n    {incr}"

    def traducirJS(self):
        init = self.inicializacion.traducirJS()
        cond = self.condicion.traducirJS()
        incr = self.incremento.traducirJS().rstrip(";")
        body = "\n    ".join(c.traducirJS() for c in self.cuerpo)
        return f"for ({init} {cond}; {incr}) {{\n    {body}\n}}"

    def traducirRuby(self):
        init = self.inicializacion.traducirRuby()
        cond = self.condicion.traducirRuby()
        incr = self.incremento.traducirRuby()
        body = "\n    ".join(c.traducirRuby() for c in self.cuerpo)
        return f"{init}\nwhile {cond}\n    {body}\n    {incr}\nend"

    def traducirRust(self):
        body = "\n    ".join(c.traducirRust() for c in self.cuerpo)
        return f"loop {{\n    {body}\n}}"

    def generarAssembler(self):
        global _asm_label_counter
        _asm_label_counter += 1
        lbl = f"for_{_asm_label_counter}"

        codigo = []
        codigo.append(f"    ; ── FOR ─────────────────────────────────────────")
        codigo.append(self.inicializacion.generarAssembler())
        codigo.append(f"{lbl}_start:")
        codigo.append(self.condicion.generarAssembler())
        codigo.append("    cmp   eax, 0")
        codigo.append(f"    je    {lbl}_end")

        for inst in self.cuerpo:
            codigo.append(inst.generarAssembler())

        codigo.append(self.incremento.generarAssembler())
        codigo.append(f"    jmp   {lbl}_start")
        codigo.append(f"{lbl}_end:")
        return "\n".join(codigo)


class NodoBreak(NodoAST):
    def traducirPy(self):   return "break"
    def traducirJS(self):   return "break;"
    def traducirRuby(self): return "break"
    def traducirRust(self): return "break;"
    def generarAssembler(self): return "    ; break — requiere etiqueta de salida del loop"


class NodoContinue(NodoAST):
    def traducirPy(self):   return "continue"
    def traducirJS(self):   return "continue;"
    def traducirRuby(self): return "next"
    def traducirRust(self): return "continue;"
    def generarAssembler(self): return "    ; continue — requiere etiqueta de inicio del loop"


class NodoIdent(NodoAST):
    def __init__(self, nombre):
        self.nombre = nombre

    def traducirPy(self):   return self.nombre[1]
    def traducirJS(self):   return self.nombre[1]
    def traducirRuby(self): return self.nombre[1]
    def traducirRust(self): return self.nombre[1]
    def generarAssembler(self): return f"\n    mov   eax, [{self.nombre[1]}]"


class NodoNumero(NodoAST):
    def __init__(self, valor):
        self.valor = valor

    def traducirPy(self):   return self.valor[1]
    def traducirJS(self):   return self.valor[1]
    def traducirRuby(self): return self.valor[1]
    def traducirRust(self): return self.valor[1]
    def generarAssembler(self): return f"\n    mov   eax, {self.valor[1]}"


class NodoFloat(NodoAST):
    def __init__(self, valor):
        self.valor = valor

    def traducirPy(self):   return self.valor[1]
    def traducirJS(self):   return self.valor[1]
    def traducirRuby(self): return self.valor[1]
    def traducirRust(self): return self.valor[1]

    def generarAssembler(self):
        etiqueta = "val_" + self.valor[1].replace(".", "_")
        _asm_data.append(f'    {etiqueta}  dd {self.valor[1]}')
        return f"\n    fld dword [{etiqueta}]"


class NodoString(NodoAST):
    _str_counter = 0

    def __init__(self, valor):
        self.valor = valor

    def traducirPy(self):   return self.valor[1]
    def traducirJS(self):   return self.valor[1]
    def traducirRuby(self): return self.valor[1]
    def traducirRust(self): return self.valor[1]

    def generarAssembler(self):
        NodoString._str_counter += 1
        lbl   = f"str_{NodoString._str_counter}"
        raw = self.valor[1].strip('"')
        partes = []
        segmento = ""
        i = 0
        while i < len(raw):
            if raw[i:i+2] == '\\n':
                if segmento: partes.append(f'"{segmento}"')
                partes.append('10')
                segmento = ""
                i += 2
            elif raw[i:i+2] == '\\t':
                if segmento: partes.append(f'"{segmento}"')
                partes.append('9')
                segmento = ""
                i += 2
            else:
                segmento += raw[i]
                i += 1
        if segmento: partes.append(f'"{segmento}"')
        partes.append('0')
        _asm_data.append(f'    {lbl}  db {", ".join(partes)}')
        return lbl


class NodoLlamadaFuncion(NodoAST):
    def __init__(self, nombre_funcion, argumentos):
        self.nombre_funcion = nombre_funcion
        self.argumentos     = argumentos

    def traducirPy(self):
        args = ", ".join(a.traducirPy() for a in self.argumentos)
        return f"{self.nombre_funcion}({args})"

    def traducirJS(self):
        args = ", ".join(a.traducirJS() for a in self.argumentos)
        return f"{self.nombre_funcion}({args})"

    def traducirRuby(self):
        args = ", ".join(a.traducirRuby() for a in self.argumentos)
        return f"{self.nombre_funcion}({args})"

    def traducirRust(self):
        args = ", ".join(a.traducirRust() for a in self.argumentos)
        return f"{self.nombre_funcion}({args})"

    def generarAssembler(self):
        codigo = []
        for arg in reversed(self.argumentos):
            codigo.append(arg.generarAssembler())
            codigo.append("    push  eax")
        codigo.append(f"    call  {self.nombre_funcion}")
        if self.argumentos:
            codigo.append(f"    add   esp, {len(self.argumentos) * 4}")
        return "\n".join(codigo)


class NodoInstruccion(NodoAST):
    """Nodo genérico para cout."""
    def __init__(self, tipo_instruccion, argumentos_instruccion):
        self.tipo_instruccion       = tipo_instruccion
        self.argumentos_instruccion = argumentos_instruccion

    def traducirPy(self):
        args = ", ".join(a.traducirPy() for a in self.argumentos_instruccion)
        return f"print({args})"

    def traducirJS(self):
        args = ", ".join(a.traducirJS() for a in self.argumentos_instruccion)
        return f"console.log({args});"

    def traducirRuby(self):
        args = ", ".join(a.traducirRuby() for a in self.argumentos_instruccion)
        return f"puts {args}"

    def traducirRust(self):
        args = ", ".join(a.traducirRust() for a in self.argumentos_instruccion)
        return f"println!(\"{{}}\", {args});"

    def generarAssembler(self):
        # Generar ensamblador para cada argumento de cout
        codigo = []
        for arg in self.argumentos_instruccion:
            if isinstance(arg, NodoString):
                lbl = arg.generarAssembler()
                codigo.append(f"    push  {lbl}")
                codigo.append("    push  fmt_str_ln")
                codigo.append("    call  printf")
                codigo.append("    add   esp, 8")
            else:
                codigo.append(arg.generarAssembler())
                codigo.append("    push  eax")
                codigo.append("    push  fmt_int_ln")
                codigo.append("    call  printf")
                codigo.append("    add   esp, 8")
        return "\n".join(codigo)


class NodoCondicional(NodoAST):
    """Alias para compatibilidad."""
    def __init__(self, condicion, cuerpo_if, cuerpo_else):
        self.condicion   = condicion
        self.cuerpo_if   = cuerpo_if
        self.cuerpo_else = cuerpo_else

    def traducirPy(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirPy()
    def traducirJS(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirJS()
    def traducirRuby(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirRuby()
    def traducirRust(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirRust()
    def generarAssembler(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).generarAssembler()


class NodoIncremento(NodoAST):
    def __init__(self, nombre, operador):
        self.nombre   = nombre
        self.operador = operador

    def traducirPy(self):
        if self.operador[1] == '++': return f"{self.nombre[1]} += 1"
        if self.operador[1] == '--': return f"{self.nombre[1]} -= 1"
        return f"{self.nombre[1]}{self.operador[1]}"

    def traducirJS(self):   return f"{self.nombre[1]}{self.operador[1]};"
    def traducirRuby(self): return self.traducirPy()
    def traducirRust(self): return self.traducirPy() + ";"

    def generarAssembler(self):
        if self.operador[1] == '++': return f"\n    inc dword [{self.nombre[1]}]"
        if self.operador[1] == '--': return f"\n    dec dword [{self.nombre[1]}]"
        return ""


class NodoEntrada(NodoAST):
    def __init__(self, keyword, formato, variable):
        self.keyword  = keyword
        self.formato  = formato
        self.variable = variable

    def traducirPy(self):   return f"{self.variable[1]} = int(input())"
    def traducirJS(self):   return f"// scanf({self.variable[1]})"
    def traducirRuby(self): return f"{self.variable[1]} = gets.chomp.to_i"
    def traducirRust(self): return f"// stdin → {self.variable[1]}"

    def generarAssembler(self):
        var = self.variable[1]
        codigo  = "\n    ; ── scanf(\"%d\", &" + var + ") ────────────────────────────────"
        codigo += "\n    lea   eax, [" + var + "]"
        codigo += "\n    push  eax"
        codigo += "\n    push  fmt_scanf"
        codigo += "\n    call  scanf"
        codigo += "\n    add   esp, 8"
        return codigo


# ─────────────────────────────────────────────
# PARSER
# ─────────────────────────────────────────────
class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos    = 0
        self.linea  = 1

    def obtener_token(self):
        while self.pos < len(self.tokens) and self.tokens[self.pos][0] == 'NEWLINE':
            self.linea += 1
            self.pos += 1
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def peek_next(self):
        """Mira el token siguiente sin consumir el actual (ignorando NEWLINEs)."""
        i = self.pos + 1
        while i < len(self.tokens) and self.tokens[i][0] == 'NEWLINE':
            i += 1
        return self.tokens[i] if i < len(self.tokens) else None

    def coincidir(self, tipo_esperado):
        tok = self.obtener_token()
        if tok and tok[0] == tipo_esperado:
            self.pos += 1
            return tok
        tok_valor = tok[1] if tok else 'EOF'
        raise SyntaxError(
            f"Línea ~{self.linea}: se esperaba {tipo_esperado} "
            f"pero se encontró '{tok_valor}'"
        )

    def coincidir_valor(self, valor_esperado):
        tok = self.obtener_token()
        if tok and tok[1] == valor_esperado:
            self.pos += 1
            return tok
        tok_valor = tok[1] if tok else 'EOF'
        raise SyntaxError(
            f"Línea ~{self.linea}: se esperaba '{valor_esperado}' "
            f"pero se encontró '{tok_valor}'"
        )

    def parsear(self):
        funciones = []
        main      = None
        while self.obtener_token() is not None:
            f = self.funcion()
            if f.nombre[1] == 'main':
                main = f
            else:
                funciones.append(f)
        return NodoPrograma(funciones, main)

    def funcion(self):
        tipo_retorno   = self.coincidir('KEYWORD')
        nombre_funcion = self.coincidir('IDENTIFIER')
        self.coincidir('DELIMITER')  # (
        parametros = [] if self.obtener_token() and self.obtener_token()[1] == ')' else self.parametros()
        self.coincidir('DELIMITER')  # )
        self.coincidir('DELIMITER')  # {
        cuerpo = self.cuerpo()
        self.coincidir('DELIMITER')  # }
        return NodoFuncion(tipo_retorno, nombre_funcion, parametros, cuerpo)

    def parametros(self):
        lista = []
        tipo   = self.coincidir('KEYWORD')
        nombre = self.coincidir('IDENTIFIER')
        lista.append(NodoParametro(tipo, nombre))
        while self.obtener_token() and self.obtener_token()[1] == ',':
            self.coincidir('DELIMITER')
            tipo   = self.coincidir('KEYWORD')
            nombre = self.coincidir('IDENTIFIER')
            lista.append(NodoParametro(tipo, nombre))
        return lista

    def es_tipo(self, tok):
        """Verifica si el token es un tipo de dato C."""
        return tok and tok[0] == 'KEYWORD' and tok[1] in (
            'int', 'float', 'double', 'char', 'void', 'bool', 'long', 'short', 'unsigned'
        )

    def cuerpo(self):
        instrucciones = []
        while self.obtener_token() and self.obtener_token()[1] != '}':
            tok = self.obtener_token()
            if tok[1] == 'return':
                instrucciones.append(self.retorno())
            elif tok[1] == 'print':
                instrucciones.append(self.print_instr())
            elif tok[1] == 'println':
                instrucciones.append(self.println_instr())
            elif tok[1] == 'cout':
                instrucciones.append(self.impresionCout())
            elif tok[1] == 'printf':
                instrucciones.append(self.printf_instr())
            elif tok[1] == 'scanf':
                instrucciones.append(self.entradaUsuario())
            elif tok[1] == 'if':
                instrucciones.append(self.if_instr())
            elif tok[1] == 'while':
                instrucciones.append(self.while_instr())
            elif tok[1] == 'for':
                instrucciones.append(self.for_instr())
            elif tok[1] == 'break':
                self.coincidir('KEYWORD')
                self.coincidir('DELIMITER')  # ;
                instrucciones.append(NodoBreak())
            elif tok[1] == 'continue':
                self.coincidir('KEYWORD')
                self.coincidir('DELIMITER')  # ;
                instrucciones.append(NodoContinue())
            elif self.es_tipo(tok):
                instrucciones.append(self.asignacion())
            elif tok[0] == 'IDENTIFIER':
                siguiente = self.peek_next()
                if siguiente and siguiente[0] == 'OPERATOR' and siguiente[1] in ['++', '--']:
                    instrucciones.append(self.incremento_puro())
                elif siguiente and siguiente[1] == '(':
                    # Llamada a función como instrucción
                    instrucciones.append(self.llamada_funcion_stmt())
                else:
                    instrucciones.append(self.asignacion_sin_tipo())
            else:
                raise SyntaxError(f"Instrucción no válida en línea ~{self.linea}: {tok}")
        return instrucciones

    def asignacion(self):
        tipo   = self.coincidir('KEYWORD')
        nombre = self.coincidir('IDENTIFIER')
        # Puede ser solo una declaración sin valor (int x;)
        tok = self.obtener_token()
        if tok and tok[1] == ';':
            self.coincidir('DELIMITER')
            return NodoAsignacion(tipo, nombre, NodoNumero(('NUMBER', '0')))
        self.coincidir('OPERATOR')   # =
        expr   = self.expresion()
        self.coincidir('DELIMITER')  # ;
        return NodoAsignacion(tipo, nombre, expr)

    def asignacion_sin_tipo(self):
        nombre = self.coincidir('IDENTIFIER')
        self.coincidir('OPERATOR')   # =
        expr   = self.expresion()
        self.coincidir('DELIMITER')  # ;
        return NodoAsignacion(None, nombre, expr)

    def llamada_funcion_stmt(self):
        """Parsea una llamada a función como instrucción (descarta el return value)."""
        nombre = self.coincidir('IDENTIFIER')
        self.coincidir('DELIMITER')  # (
        args = self.args_llamada()
        self.coincidir('DELIMITER')  # )
        self.coincidir('DELIMITER')  # ;
        return NodoLlamadaFuncion(nombre[1], args)

    def incremento_puro(self):
        nombre   = self.coincidir('IDENTIFIER')
        operador = self.coincidir('OPERATOR')  # ++ o --
        self.coincidir('DELIMITER')  # ;
        return NodoIncremento(nombre, operador)

    def retorno(self):
        self.coincidir('KEYWORD')
        # void return (return;)
        tok = self.obtener_token()
        if tok and tok[1] == ';':
            self.coincidir('DELIMITER')
            return NodoRetorno(NodoNumero(('NUMBER', '0')))
        expr = self.expresion()
        self.coincidir('DELIMITER')
        return NodoRetorno(expr)

    def print_instr(self):
        self.coincidir('KEYWORD')
        expr = self.expresion()
        self.coincidir('DELIMITER')
        return NodoPrint(expr)

    def println_instr(self):
        self.coincidir('KEYWORD')
        expr = self.expresion()
        self.coincidir('DELIMITER')
        return NodoPrintln(expr)

    def printf_instr(self):
        """Parsea printf("fmt", arg1, arg2, ...);"""
        self.coincidir('KEYWORD')    # printf
        self.coincidir('DELIMITER')  # (
        fmt = self.termino()         # formato (string)
        args = []
        while self.obtener_token() and self.obtener_token()[1] == ',':
            self.coincidir('DELIMITER')
            args.append(self.expresion())
        self.coincidir('DELIMITER')  # )
        self.coincidir('DELIMITER')  # ;
        return NodoPrintf(fmt, args)

    def impresionCout(self):
        keyword = self.coincidir('KEYWORD')  # cout
        args = []
        while self.obtener_token() and self.obtener_token()[1] == '<<':
            self.coincidir('OPERATOR')
            # Ignorar std::endl
            tok = self.obtener_token()
            if tok and tok[1] == 'endl':
                self.coincidir('IDENTIFIER')
                args.append(NodoString(('STRING', '"\\n"')))
            else:
                args.append(self.termino())
        self.coincidir('DELIMITER')  # ;
        return NodoInstruccion(keyword, args)

    def entradaUsuario(self):
        """Parsea scanf("%d", &variable); o scanf("%d", variable);"""
        keyword  = self.coincidir('KEYWORD')   # scanf
        self.coincidir('DELIMITER')            # (
        formato  = self.expresion()            # "%d"
        self.coincidir('DELIMITER')            # ,
        # Consumir & si existe (puede llegar como OPERATOR o AMPERSAND)
        tok = self.obtener_token()
        if tok and tok[1] == '&':
            self.pos += 1  # consumir sin validar tipo exacto
        variable = self.coincidir('IDENTIFIER')
        self.coincidir('DELIMITER')            # )
        self.coincidir('DELIMITER')            # ;
        return NodoEntrada(keyword, formato, variable)

    def if_instr(self):
        self.coincidir('KEYWORD')    # if
        self.coincidir('DELIMITER')  # (
        cond = self.expresion()
        self.coincidir('DELIMITER')  # )
        self.coincidir('DELIMITER')  # {
        cuerpo_if = self.cuerpo()
        self.coincidir('DELIMITER')  # }
        cuerpo_else = None
        if self.obtener_token() and self.obtener_token()[1] == 'else':
            self.coincidir('KEYWORD')  # else
            if self.obtener_token() and self.obtener_token()[1] == 'if':
                cuerpo_else = [self.if_instr()]
            else:
                self.coincidir('DELIMITER')  # {
                cuerpo_else = self.cuerpo()
                self.coincidir('DELIMITER')  # }
        return NodoIf(cond, cuerpo_if, cuerpo_else)

    def while_instr(self):
        self.coincidir('KEYWORD')
        self.coincidir('DELIMITER')  # (
        cond = self.expresion()
        self.coincidir('DELIMITER')  # )
        self.coincidir('DELIMITER')  # {
        cuerpo = self.cuerpo()
        self.coincidir('DELIMITER')  # }
        return NodoWhile(cond, cuerpo)

    def for_instr(self):
        self.coincidir('KEYWORD')    # for
        self.coincidir('DELIMITER')  # (
        # Inicio: puede ser "int i = 0;" o "i = 0;"
        tok = self.obtener_token()
        if self.es_tipo(tok):
            inicio = self.asignacion()   # int i = 0;  (ya consume el ;)
        else:
            inicio = self.asignacion_sin_tipo()  # i = 0;  (ya consume el ;)
        cond   = self.expresion()
        self.coincidir('DELIMITER')  # ;
        incr   = self.incremento_for()
        self.coincidir('DELIMITER')  # )
        self.coincidir('DELIMITER')  # {
        cuerpo = self.cuerpo()
        self.coincidir('DELIMITER')  # }
        return NodoFor(inicio, cond, incr, cuerpo)

    def incremento_for(self):
        nombre   = self.coincidir('IDENTIFIER')
        tok = self.obtener_token()
        if tok and tok[1] in ('++', '--'):
            operador = self.coincidir('OPERATOR')
            return NodoIncremento(nombre, operador)
        elif tok and tok[1] == '=':
            # Soporta i = i + 1 como incremento del for
            self.coincidir('OPERATOR')  # =
            expr = self.expresion()
            return NodoAsignacion(None, nombre, expr)

    # ── Expresiones ────────────────────────────────────────────────────────

    def expresion(self):
        """Maneja operadores lógicos (&&, ||)."""
        izq = self.comparacion()
        while self.obtener_token() and self.obtener_token()[0] in ('LOGIC_OP', 'OPERATOR') \
              and self.obtener_token()[1] in ['&&', '||']:
            op = self.coincidir(self.obtener_token()[0])
            der = self.comparacion()
            izq = NodoOperacion(izq, op, der)
        return izq

    def comparacion(self):
        """Maneja operadores de comparación (==, !=, <, >, <=, >=)."""
        izq = self.suma_resta()
        while self.obtener_token() and self.obtener_token()[0] == 'OPERATOR' \
              and self.obtener_token()[1] in ['==', '!=', '<', '>', '<=', '>=']:
            op = self.coincidir('OPERATOR')
            der = self.suma_resta()
            izq = NodoOperacion(izq, op, der)
        return izq

    def suma_resta(self):
        izq = self.factor()
        while self.obtener_token() and self.obtener_token()[0] == 'OPERATOR' \
              and self.obtener_token()[1] in ['+', '-']:
            op = self.coincidir('OPERATOR')
            der = self.factor()
            izq = NodoOperacion(izq, op, der)
        return izq

    def factor(self):
        izq = self.termino()
        while self.obtener_token() and self.obtener_token()[0] == 'OPERATOR' \
              and self.obtener_token()[1] in ['*', '/', '%']:
            op = self.coincidir('OPERATOR')
            der = self.termino()
            izq = NodoOperacion(izq, op, der)
        return izq

    def termino(self):
        tok = self.obtener_token()
        if not tok:
            raise SyntaxError("Se esperaba un término pero no hay más tokens")
        if tok[0] == 'NUMBER':
            return NodoNumero(self.coincidir('NUMBER'))
        elif tok[0] == 'FLOAT':
            return NodoFloat(self.coincidir('FLOAT'))
        elif tok[0] == 'STRING':
            return NodoString(self.coincidir('STRING'))
        elif tok[0] == 'CHAR':
            # Tratar char literal como número (valor ASCII)
            t = self.coincidir('CHAR')
            return NodoNumero(t)
        elif tok[0] == 'IDENTIFIER':
            ident = self.coincidir('IDENTIFIER')
            if self.obtener_token() and self.obtener_token()[1] == '(':
                self.coincidir('DELIMITER')
                args = self.args_llamada()
                self.coincidir('DELIMITER')
                return NodoLlamadaFuncion(ident[1], args)
            return NodoIdent(ident)
        elif tok[1] == '(':
            self.coincidir('DELIMITER')
            expr = self.expresion()
            self.coincidir('DELIMITER')  # )
            return expr
        else:
            raise SyntaxError(f"Expresión no válida en línea ~{self.linea}: {tok}")

    def args_llamada(self):
        args = []
        if self.obtener_token() and self.obtener_token()[1] == ')':
            return args
        args.append(self.expresion())
        while self.obtener_token() and self.obtener_token()[1] == ',':
            self.coincidir('DELIMITER')
            args.append(self.expresion())
        return args


# ─────────────────────────────────────────────
# ANALIZADOR SEMÁNTICO
# ─────────────────────────────────────────────
class AnalizadorSemantico:
    def __init__(self):
        self.pila_tablas      = [{}]
        self.historial_scopes = []

    def analizar(self, nodo):
        metodo = f'visitar_{type(nodo).__name__}'
        if hasattr(self, metodo):
            return getattr(self, metodo)(nodo)
        return None

    def entrar_scope(self):
        self.pila_tablas.append({})

    def salir_scope(self):
        scope = self.pila_tablas.pop()
        self.historial_scopes.append(scope)

    def declarar(self, nombre, tipo):
        tabla = self.pila_tablas[-1]
        if nombre in tabla:
            raise Exception(f"Error semántico: '{nombre}' ya está declarado en este ámbito")
        tabla[nombre] = {'tipo': tipo}

    def buscar(self, nombre):
        for tabla in reversed(self.pila_tablas):
            if nombre in tabla:
                return tabla[nombre]
        raise Exception(f"Error semántico: '{nombre}' no está definido")

    def visitar_NodoPrograma(self, nodo):
        todas = nodo.funciones + ([nodo.main] if nodo.main else [])
        for f in todas:
            nombre = f.nombre[1]
            if nombre in self.pila_tablas[0]:
                raise Exception(f"Error semántico: función '{nombre}' ya definida")
            self.pila_tablas[0][nombre] = {
                'tipo': f.tipo[1],
                'parametros': f.parametros
            }
        for f in nodo.funciones:
            self.entrar_scope()
            for p in f.parametros:
                self.declarar(p.nombre[1], p.tipo[1])
            for inst in f.cuerpo:
                self.analizar(inst)
            self.salir_scope()
        if nodo.main:
            self.entrar_scope()
            for inst in nodo.main.cuerpo:
                self.analizar(inst)
            self.salir_scope()

    def visitar_NodoFuncion(self, nodo):
        nombre = nodo.nombre[1]
        if nombre in self.pila_tablas[0]:
            raise Exception(f"Error semántico: función '{nombre}' ya definida")
        self.pila_tablas[0][nombre] = {'tipo': nodo.tipo[1], 'parametros': nodo.parametros}
        self.entrar_scope()
        for p in nodo.parametros:
            self.declarar(p.nombre[1], p.tipo[1])
        for inst in nodo.cuerpo:
            self.analizar(inst)
        self.salir_scope()

    def visitar_NodoAsignacion(self, nodo):
        tipo_expr = self.analizar(nodo.expresion)
        nombre    = nodo.nombre[1]
        if nodo.tipo is not None:
            self.declarar(nombre, nodo.tipo[1])
        else:
            try:
                self.buscar(nombre)
            except Exception:
                # Variable no declarada previamente — declarar implícitamente
                self.declarar(nombre, tipo_expr or 'int')

    def visitar_NodoOperacion(self, nodo):
        ti = self.analizar(nodo.izquierda)
        td = self.analizar(nodo.derecha)
        if ti and td and ti != td:
            # int/float mixing es válido en C, no lanzar error
            if set([ti, td]) <= {'int', 'float', 'double'}:
                return 'float'
        return ti

    def visitar_NodoNumero(self, nodo):  return 'int'
    def visitar_NodoFloat(self, nodo):   return 'float'
    def visitar_NodoString(self, nodo):  return 'string'

    def visitar_NodoIdent(self, nodo):
        try:
            return self.buscar(nodo.nombre[1])['tipo']
        except Exception:
            return 'int'  # Tolerante: no romper por variables no declaradas

    def visitar_NodoRetorno(self, nodo):
        return self.analizar(nodo.expresion)

    def visitar_NodoPrint(self, nodo):
        return self.analizar(nodo.expresion)

    def visitar_NodoPrintln(self, nodo):
        return self.analizar(nodo.expresion)

    def visitar_NodoPrintf(self, nodo):
        for a in nodo.argumentos:
            self.analizar(a)

    def visitar_NodoInstruccion(self, nodo):
        for a in nodo.argumentos_instruccion:
            self.analizar(a)

    def visitar_NodoIf(self, nodo):
        self.analizar(nodo.condicion)
        self.entrar_scope()
        for c in nodo.cuerpo_if:  self.analizar(c)
        self.salir_scope()
        if nodo.cuerpo_else:
            self.entrar_scope()
            for c in nodo.cuerpo_else: self.analizar(c)
            self.salir_scope()

    def visitar_NodoCondicional(self, nodo):
        self.visitar_NodoIf(nodo)

    def visitar_NodoWhile(self, nodo):
        self.analizar(nodo.condicion)
        self.entrar_scope()
        for c in nodo.cuerpo: self.analizar(c)
        self.salir_scope()

    def visitar_NodoFor(self, nodo):
        self.entrar_scope()
        self.analizar(nodo.inicializacion)
        self.analizar(nodo.condicion)
        for c in nodo.cuerpo: self.analizar(c)
        self.salir_scope()

    def visitar_NodoLlamadaFuncion(self, nodo):
        nf = nodo.nombre_funcion
        if nf not in self.pila_tablas[0]:
            # Funciones de C estándar — no lanzar error
            return 'int'
        funcion = self.pila_tablas[0][nf]
        params  = funcion.get('parametros', [])
        args    = nodo.argumentos
        if len(args) != len(params):
            raise Exception(
                f"Error semántico: '{nf}' espera {len(params)} argumento(s), "
                f"se pasaron {len(args)}"
            )
        return funcion.get('tipo', 'int')

    def tabla_como_dict(self):
        resultado = {}
        global_scope = {}
        for nombre, info in self.pila_tablas[0].items():
            if 'parametros' in info:
                global_scope[nombre] = {
                    'tipo': info['tipo'],
                    'clase': 'funcion',
                    'parametros': [
                        {'nombre': p.nombre[1], 'tipo': p.tipo[1]}
                        for p in info['parametros']
                    ]
                }
            else:
                global_scope[nombre] = {'tipo': info['tipo'], 'clase': 'variable'}
        resultado['global'] = global_scope
        for i, scope in enumerate(self.historial_scopes):
            resultado[f'scope_{i+1}'] = {
                k: {'tipo': v['tipo'], 'clase': 'variable'}
                for k, v in scope.items()
            }
        return resultado


# ─────────────────────────────────────────────
# AST → JSON
# ─────────────────────────────────────────────
def ast_a_json(nodo):
    if nodo is None: return None
    if isinstance(nodo, NodoPrograma):
        return {
            'tipo': 'programa',
            'funciones': [ast_a_json(f) for f in nodo.funciones],
            'main': ast_a_json(nodo.main)
        }
    if isinstance(nodo, NodoFuncion):
        return {
            'tipo': 'funcion',
            'nombre': nodo.nombre[1],
            'retorno': nodo.tipo[1],
            'parametros': [ast_a_json(p) for p in nodo.parametros],
            'cuerpo': [ast_a_json(c) for c in nodo.cuerpo]
        }
    if isinstance(nodo, NodoParametro):
        return {'tipo': 'parametro', 'nombre': nodo.nombre[1], 'tipo_dato': nodo.tipo[1]}
    if isinstance(nodo, NodoAsignacion):
        return {
            'tipo': 'asignacion',
            'variable': nodo.nombre[1],
            'tipo_dato': nodo.tipo[1] if nodo.tipo else None,
            'expresion': ast_a_json(nodo.expresion)
        }
    if isinstance(nodo, NodoOperacion):
        return {
            'tipo': 'operacion',
            'operador': nodo.operador[1],
            'izquierda': ast_a_json(nodo.izquierda),
            'derecha': ast_a_json(nodo.derecha)
        }
    if isinstance(nodo, NodoRetorno):
        return {'tipo': 'retorno', 'expresion': ast_a_json(nodo.expresion)}
    if isinstance(nodo, NodoPrint):
        return {'tipo': 'print', 'expresion': ast_a_json(nodo.expresion)}
    if isinstance(nodo, NodoPrintln):
        return {'tipo': 'println', 'expresion': ast_a_json(nodo.expresion)}
    if isinstance(nodo, NodoPrintf):
        return {
            'tipo': 'printf',
            'formato': ast_a_json(nodo.formato),
            'argumentos': [ast_a_json(a) for a in nodo.argumentos]
        }
    if isinstance(nodo, NodoIdent):
        return {'tipo': 'identificador', 'nombre': nodo.nombre[1]}
    if isinstance(nodo, NodoNumero):
        return {'tipo': 'numero', 'valor': nodo.valor[1]}
    if isinstance(nodo, NodoFloat):
        return {'tipo': 'float', 'valor': nodo.valor[1]}
    if isinstance(nodo, NodoString):
        return {'tipo': 'string', 'valor': nodo.valor[1]}
    if isinstance(nodo, NodoLlamadaFuncion):
        return {
            'tipo': 'llamada_funcion',
            'nombre': nodo.nombre_funcion,
            'argumentos': [ast_a_json(a) for a in nodo.argumentos]
        }
    if isinstance(nodo, (NodoIf, NodoCondicional)):
        r = {
            'tipo': 'if',
            'condicion': ast_a_json(nodo.condicion),
            'cuerpo_if': [ast_a_json(c) for c in nodo.cuerpo_if]
        }
        if nodo.cuerpo_else:
            r['cuerpo_else'] = [ast_a_json(c) for c in nodo.cuerpo_else]
        return r
    if isinstance(nodo, NodoWhile):
        return {
            'tipo': 'while',
            'condicion': ast_a_json(nodo.condicion),
            'cuerpo': [ast_a_json(c) for c in nodo.cuerpo]
        }
    if isinstance(nodo, NodoFor):
        return {
            'tipo': 'for',
            'inicio': ast_a_json(nodo.inicializacion),
            'condicion': ast_a_json(nodo.condicion),
            'incremento': ast_a_json(nodo.incremento),
            'cuerpo': [ast_a_json(c) for c in nodo.cuerpo]
        }
    if isinstance(nodo, NodoIncremento):
        return {'tipo': 'incremento', 'variable': nodo.nombre[1], 'operador': nodo.operador[1]}
    if isinstance(nodo, NodoInstruccion):
        return {
            'tipo': 'instruccion',
            'instruccion': nodo.tipo_instruccion[1],
            'argumentos': [ast_a_json(a) for a in nodo.argumentos_instruccion]
        }
    if isinstance(nodo, NodoBreak):
        return {'tipo': 'break'}
    if isinstance(nodo, NodoContinue):
        return {'tipo': 'continue'}
    return {'tipo': 'desconocido', 'clase': type(nodo).__name__}


# ─────────────────────────────────────────────
# SIMULACIÓN DE EJECUCIÓN (echo)
# ─────────────────────────────────────────────
def simular_echo(arbol):
    output = []
    memoria = {}
    call_depth = [0]
    MAX_DEPTH = 50

    STDIN_DEMO = {}

    def evaluar_con_mem(nodo, mem):
        if isinstance(nodo, NodoNumero):
            return int(nodo.valor[1])
        if isinstance(nodo, NodoFloat):
            return float(nodo.valor[1])
        if isinstance(nodo, NodoString):
            return nodo.valor[1].strip('"')
        if isinstance(nodo, NodoIdent):
            return mem.get(nodo.nombre[1], '?')
        if isinstance(nodo, NodoOperacion):
            izq = evaluar_con_mem(nodo.izquierda, mem)
            der = evaluar_con_mem(nodo.derecha, mem)
            if '?' in [str(izq), str(der)]: return '?'
            op = nodo.operador[1]
            try:
                if op == '+': return izq + der
                if op == '-': return izq - der
                if op == '*': return izq * der
                if op == '/' and der != 0:
                    return izq // der if isinstance(izq, int) and isinstance(der, int) else izq / der
                if op == '%' and der != 0: return izq % der
                if op == '<':  return 1 if izq < der else 0
                if op == '>':  return 1 if izq > der else 0
                if op == '<=': return 1 if izq <= der else 0
                if op == '>=': return 1 if izq >= der else 0
                if op == '==': return 1 if izq == der else 0
                if op == '!=': return 1 if izq != der else 0
                if op == '&&': return 1 if (izq and der) else 0
                if op == '||': return 1 if (izq or der) else 0
            except Exception:
                return '?'
            return '?'
        if isinstance(nodo, NodoLlamadaFuncion):
            if call_depth[0] >= MAX_DEPTH:
                return '?'
            func = next((f for f in arbol.funciones if f.nombre[1] == nodo.nombre_funcion), None)
            if not func: return '?'
            call_depth[0] += 1
            args_evaluados = [evaluar_con_mem(arg, mem) for arg in nodo.argumentos]
            mem_local = {}
            for param, val in zip(func.parametros, args_evaluados):
                mem_local[param.nombre[1]] = val
            resultado = ejecutar_cuerpo(func.cuerpo, mem_local)
            call_depth[0] -= 1
            return resultado
        return '?'

    def ejecutar_cuerpo(cuerpo, mem, redeclaradas=None):
        if redeclaradas is None:
            redeclaradas = set()
        for inst in cuerpo:
            if isinstance(inst, NodoEntrada):
                var = inst.variable[1]
                demo_val = STDIN_DEMO.get(var, 5)
                mem[var] = demo_val
                output.append(f"[entrada: {var} = {demo_val}]")
                continue
            if isinstance(inst, NodoAsignacion):
                if inst.tipo is not None:
                    redeclaradas.add(inst.nombre[1])
                val = evaluar_con_mem(inst.expresion, mem)
                mem[inst.nombre[1]] = val
            elif isinstance(inst, NodoRetorno):
                return evaluar_con_mem(inst.expresion, mem)
            elif isinstance(inst, (NodoPrint, NodoPrintln)):
                if isinstance(inst.expresion, NodoString):
                    texto = inst.expresion.valor[1].strip('"')
                    output.append(texto)
                else:
                    val = evaluar_con_mem(inst.expresion, mem)
                    output.append(str(val))
            elif isinstance(inst, NodoPrintf):
                # Simular printf básico
                if isinstance(inst.formato, NodoString):
                    fmt = inst.formato.valor[1].strip('"')
                    args_vals = [evaluar_con_mem(a, mem) for a in inst.argumentos]
                    try:
                        fmt_py = fmt.replace('%d', '{}').replace('%f', '{:.6f}').replace('%s', '{}').replace('%i', '{}').replace('\\n', '\n').replace('\\t', '\t')
                        resultado = fmt_py.format(*args_vals)
                        output.append(resultado.rstrip('\n'))
                    except Exception:
                        output.append(fmt)
            elif isinstance(inst, NodoInstruccion):
                # cout
                partes = []
                for arg in inst.argumentos_instruccion:
                    if isinstance(arg, NodoString):
                        partes.append(arg.valor[1].strip('"'))
                    else:
                        val = evaluar_con_mem(arg, mem)
                        partes.append(str(val))
                output.append("".join(partes))
            elif isinstance(inst, NodoIf):
                cond = evaluar_con_mem(inst.condicion, mem)
                if cond and cond != '?':
                    claves_antes = set(mem.keys())
                    mem_local = dict(mem)
                    redeclaradas_if = set()
                    ret = ejecutar_cuerpo(inst.cuerpo_if, mem_local, redeclaradas_if)
                    for k in claves_antes:
                        if k not in redeclaradas_if and k in mem_local:
                            mem[k] = mem_local[k]
                    if ret is not None: return ret
                elif inst.cuerpo_else:
                    claves_antes = set(mem.keys())
                    mem_local = dict(mem)
                    redeclaradas_else = set()
                    ret = ejecutar_cuerpo(inst.cuerpo_else, mem_local, redeclaradas_else)
                    for k in claves_antes:
                        if k not in redeclaradas_else and k in mem_local:
                            mem[k] = mem_local[k]
                    if ret is not None: return ret
            elif isinstance(inst, NodoWhile):
                limite = 100
                while limite > 0:
                    cond = evaluar_con_mem(inst.condicion, mem)
                    if not cond or cond == '?': break
                    resultado = ejecutar_cuerpo(inst.cuerpo, mem)
                    if resultado is not None: return resultado
                    limite -= 1
            elif isinstance(inst, NodoFor):
                ejecutar_cuerpo([inst.inicializacion], mem)
                limite = 100
                while limite > 0:
                    cond = evaluar_con_mem(inst.condicion, mem)
                    if not cond or cond == '?': break
                    resultado = ejecutar_cuerpo(inst.cuerpo, mem)
                    if resultado is not None: return resultado
                    ejecutar_cuerpo([inst.incremento], mem)
                    limite -= 1
            elif isinstance(inst, NodoIncremento):
                val = mem.get(inst.nombre[1], 0)
                if inst.operador[1] == '++':
                    mem[inst.nombre[1]] = val + 1
                elif inst.operador[1] == '--':
                    mem[inst.nombre[1]] = val - 1
            elif isinstance(inst, NodoLlamadaFuncion):
                evaluar_con_mem(inst, mem)
        return None

    if arbol.main:
        ejecutar_cuerpo(arbol.main.cuerpo, memoria)

    return output


# ─────────────────────────────────────────────
# AST → MERMAID
# ─────────────────────────────────────────────
def ast_a_mermaid(nodo):
    lines = ["flowchart TD"]
    counter = [0]

    def new_id():
        counter[0] += 1
        return f"N{counter[0]}"

    def agregar_flecha(desde, hasta, label=None):
        if label:
            lines.append(f'    {desde} -->|{label}| {hasta}')
        else:
            lines.append(f'    {desde} --> {hasta}')

    def procesar(nodo, padre_id=None):
        if nodo is None:
            return
        if isinstance(nodo, NodoPrograma):
            for f in nodo.funciones:
                procesar(f, padre_id)
            if nodo.main:
                procesar(nodo.main, padre_id)
        elif isinstance(nodo, NodoFuncion):
            nid = new_id()
            label = f"func: {nodo.nombre[1]}()"
            lines.append(f'    {nid}(["{label}"])')
            if padre_id:
                lines.append(f'    {padre_id} --> {nid}')
            prev = nid
            for inst in nodo.cuerpo:
                prev = procesar_inst(inst, prev)
        return None

    def procesar_inst(nodo, prev_id):
        if nodo is None:
            return prev_id
        if isinstance(nodo, NodoAsignacion):
            nid = new_id()
            expr = expr_label(nodo.expresion)
            label = f"{nodo.nombre[1]} = {expr}"
            lines.append(f'    {nid}["{label}"]')
            lines.append(f'    {prev_id} --> {nid}')
            return nid
        elif isinstance(nodo, NodoRetorno):
            nid = new_id()
            label = f"return {expr_label(nodo.expresion)}"
            lines.append(f'    {nid}["{label}"]')
            lines.append(f'    {prev_id} --> {nid}')
            return nid
        elif isinstance(nodo, (NodoPrint, NodoPrintln, NodoPrintf)):
            nid = new_id()
            if isinstance(nodo, NodoPrintf):
                label = f"printf {expr_label(nodo.formato)}"
            else:
                label = f"print {expr_label(nodo.expresion)}"
            lines.append(f'    {nid}[/"{label}"/]')
            lines.append(f'    {prev_id} --> {nid}')
            return nid
        elif isinstance(nodo, NodoInstruccion):
            nid = new_id()
            args = ", ".join(expr_label(a) for a in nodo.argumentos_instruccion)
            label = f"cout {args}"
            lines.append(f'    {nid}[/"{label}"/]')
            lines.append(f'    {prev_id} --> {nid}')
            return nid
        elif isinstance(nodo, NodoIf):
            nid = new_id()
            label = expr_label(nodo.condicion)
            lines.append(f'    {nid}{{"{label}"}}')
            lines.append(f'    {prev_id} --> {nid}')
            if nodo.cuerpo_if:
                si_start = f"N{counter[0]+1}"
                prev_si = nid
                for inst in nodo.cuerpo_if:
                    prev_si = procesar_inst(inst, prev_si)
                flecha_sin_label = f'    {nid} --> {si_start}'
                if flecha_sin_label in lines:
                    lines.remove(flecha_sin_label)
                agregar_flecha(nid, si_start, "SI")
            else:
                prev_si = nid
            if nodo.cuerpo_else:
                no_start = f"N{counter[0]+1}"
                prev_no = nid
                for inst in nodo.cuerpo_else:
                    prev_no = procesar_inst(inst, prev_no)
                flecha_sin_label = f'    {nid} --> {no_start}'
                if flecha_sin_label in lines:
                    lines.remove(flecha_sin_label)
                agregar_flecha(nid, no_start, "NO")
            else:
                prev_no = nid
            end_id = new_id()
            lines.append(f'    {end_id}["fin if"]')
            lines.append(f'    {prev_si} --> {end_id}')
            if nodo.cuerpo_else:
                lines.append(f'    {prev_no} --> {end_id}')
            else:
                lines.append(f'    {nid} -->|NO| {end_id}')
            return end_id
        elif isinstance(nodo, NodoWhile):
            nid = new_id()
            label = expr_label(nodo.condicion)
            lines.append(f'    {nid}{{"{label}"}}')
            lines.append(f'    {prev_id} --> {nid}')
            if nodo.cuerpo:
                primer_id = f"N{counter[0]+1}"
                prev_w = nid
                for inst in nodo.cuerpo:
                    prev_w = procesar_inst(inst, prev_w)
                flecha_sin_label = f'    {nid} --> {primer_id}'
                if flecha_sin_label in lines:
                    lines.remove(flecha_sin_label)
                agregar_flecha(nid, primer_id, "SI")
            else:
                prev_w = nid
            lines.append(f'    {prev_w} --> {nid}')
            end_id = new_id()
            lines.append(f'    {end_id}["fin while"]')
            lines.append(f'    {nid} -->|NO| {end_id}')
            return end_id
        elif isinstance(nodo, NodoFor):
            init_id = procesar_inst(nodo.inicializacion, prev_id)
            cond_id = new_id()
            label = expr_label(nodo.condicion)
            lines.append(f'    {cond_id}{{"{label}"}}')
            lines.append(f'    {init_id} --> {cond_id}')
            if nodo.cuerpo:
                primer_id = f"N{counter[0]+1}"
                prev_f = cond_id
                for inst in nodo.cuerpo:
                    prev_f = procesar_inst(inst, prev_f)
                flecha_sin_label = f'    {cond_id} --> {primer_id}'
                if flecha_sin_label in lines:
                    lines.remove(flecha_sin_label)
                agregar_flecha(cond_id, primer_id, "SI")
            else:
                prev_f = cond_id
            inc_id = procesar_inst(nodo.incremento, prev_f)
            lines.append(f'    {inc_id} --> {cond_id}')
            end_id = new_id()
            lines.append(f'    {end_id}["fin for"]')
            lines.append(f'    {cond_id} -->|NO| {end_id}')
            return end_id
        elif isinstance(nodo, NodoLlamadaFuncion):
            nid = new_id()
            args = ", ".join(expr_label(a) for a in nodo.argumentos)
            label = f"{nodo.nombre_funcion}({args})"
            lines.append(f'    {nid}["{label}"]')
            lines.append(f'    {prev_id} --> {nid}')
            return nid
        elif isinstance(nodo, NodoIncremento):
            nid = new_id()
            label = f"{nodo.nombre[1]}{nodo.operador[1]}"
            lines.append(f'    {nid}["{label}"]')
            lines.append(f'    {prev_id} --> {nid}')
            return nid
        return prev_id

    def expr_label(nodo):
        if nodo is None: return "?"
        if isinstance(nodo, NodoNumero): return nodo.valor[1]
        if isinstance(nodo, NodoFloat):  return nodo.valor[1]
        if isinstance(nodo, NodoIdent):  return nodo.nombre[1]
        if isinstance(nodo, NodoString): return nodo.valor[1]
        if isinstance(nodo, NodoOperacion):
            return f"{expr_label(nodo.izquierda)} {nodo.operador[1]} {expr_label(nodo.derecha)}"
        if isinstance(nodo, NodoLlamadaFuncion):
            args = ", ".join(expr_label(a) for a in nodo.argumentos)
            return f"{nodo.nombre_funcion}({args})"
        return "expr"

    procesar(nodo)
    return "\n".join(lines)


# ─────────────────────────────────────────────
# PIPELINE PRINCIPAL
# ─────────────────────────────────────────────
def compilar_codigo(codigo_fuente):
    """
    Ejecuta el pipeline completo y devuelve un dict JSON-serializable con:
      - tokens, ast, tabla_simbolos
      - cpp (código fuente tal como viene), assembler
      - traducciones: python, javascript, ruby, rust
      - errores (si los hay)
    """
    resultado = {
        'ok': False,
        'errores': [],
        'tokens': [],
        'ast': None,
        'assembler': '',
        'tabla_simbolos': {},
        'traducciones': {'python': '', 'javascript': '', 'ruby': '', 'rust': ''},
        'cpp': codigo_fuente,
        'mermaid': '',
        'echo': [],
    }

    # 1. LÉXICO
    try:
        tokens = identificar_tokens(codigo_fuente)
        resultado['tokens'] = [{'tipo': t[0], 'valor': t[1]} for t in tokens]
    except Exception as e:
        resultado['errores'].append(f'Léxico: {e}')
        return resultado

    if not tokens:
        resultado['errores'].append('Léxico: no se encontraron tokens')
        return resultado

    tokens_error = [t for t in tokens if t[0] == 'ERROR']
    if tokens_error:
        for t in tokens_error:
            resultado['errores'].append(f'Léxico: carácter no reconocido "{t[1]}"')
        return resultado

    # 2. SINTÁCTICO
    try:
        parser = Parser(tokens)
        arbol  = parser.parsear()
        resultado['ast'] = ast_a_json(arbol)
    except SyntaxError as e:
        resultado['errores'].append(f'Sintáctico: {e}')
        return resultado
    except Exception as e:
        resultado['errores'].append(f'Sintáctico: {e}')
        return resultado

    # 3. SEMÁNTICO
    try:
        semantico = AnalizadorSemantico()
        semantico.analizar(arbol)
        resultado['tabla_simbolos'] = semantico.tabla_como_dict()
    except Exception as e:
        resultado['errores'].append(f'Semántico: {e}')
        # No retornamos — seguimos generando código

    # 4. ASSEMBLER
    try:
        resultado['assembler'] = arbol.generarAssembler()
    except Exception as e:
        resultado['errores'].append(f'Assembler: {e}')

    # 5. TRADUCCIONES
    for lang, metodo in [
        ('python',     'traducirPy'),
        ('javascript', 'traducirJS'),
        ('ruby',       'traducirRuby'),
        ('rust',       'traducirRust'),
    ]:
        try:
            resultado['traducciones'][lang] = getattr(arbol, metodo)()
        except Exception as e:
            resultado['traducciones'][lang] = f'# Error: {e}'

    # 6. MERMAID
    try:
        resultado['mermaid'] = ast_a_mermaid(arbol)
    except Exception as e:
        resultado['mermaid'] = f'flowchart TD\n    ERR["Error: {e}"]'

    # 7. ECHO (vacío, la ejecución es interactiva en el frontend via websockets)
    resultado['echo'] = []

    resultado['ok'] = len(resultado['errores']) == 0
    return resultado