# -*- coding: utf-8 -*-
"""
compilador_core.py
Módulo limpio del compilador: Léxico + Parser + AST + Semántico + Generación de código.
Extraído y unificado desde compilador.py y sintactico.py.
"""

import re
import json

# ─────────────────────────────────────────────
# ANÁLISIS LÉXICO
# ─────────────────────────────────────────────
token_patron = {
    "STRING":     r'"[^"]*"',
    "KEYWORD":    r'\b(if|else|while|for|return|int|float|void|print|println|cout|scanf)\b',
    "IDENTIFIER": r'\b[a-zA-Z_][a-zA-Z0-9_]*\b',
    "FLOAT":      r'\b\d+\.\d+\b',
    "NUMBER":     r'\b\d+\b',
    "OPERATOR":   r'\+\+|--|<<|[+\-*/=<>]',
    "DELIMITER":  r'[(),;{}]',
    "WHITESPACE": r'\s+',
}

def identificar_tokens(texto):
    patron_general = "|".join(
        f"(?P<{tok}>{pat})" for tok, pat in token_patron.items()
    )
    patron_regex = re.compile(patron_general)
    tokens_encontrados = []
    for match in patron_regex.finditer(texto):
        for tok, valor in match.groupdict().items():
            if valor is not None and tok != "WHITESPACE":
                tokens_encontrados.append((tok, valor))
    return tokens_encontrados


# ─────────────────────────────────────────────
# NODOS AST
# ─────────────────────────────────────────────
_asm_data = []   # acumulador global de sección .data para assembler

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

        codigo = [
            "extern printf",
            "section .text",
            "global _start"
        ]
        data = [
            "section .data",
            '    fmt_int    db "%d", 0',
            '    fmt_int_ln db "%d", 10, 0'
        ]
        bss = ["section .bss"]

        for funcion in self.funciones:
            codigo.append(funcion.generarAssembler())
            for inst in funcion.cuerpo:
                if hasattr(inst, 'nombre') and inst.nombre and hasattr(inst, 'tipo') and inst.tipo:
                    self.variables.append((inst.tipo[1], inst.nombre[1]))
                if hasattr(inst, 'expresion') and isinstance(inst.expresion, NodoFloat):
                    val = inst.expresion.valor[1]
                    etiqueta = "val_" + val.replace(".", "_")
                    entry = f'    {etiqueta}  dd {val}'
                    if entry not in data:
                        data.append(entry)
            for param in funcion.parametros:
                self.variables.append((param.tipo[1], param.nombre[1]))

        codigo.append("_start:")
        if self.main:
            for inst in self.main.cuerpo:
                if hasattr(inst, 'nombre') and inst.nombre and hasattr(inst, 'tipo') and inst.tipo:
                    self.variables.append((inst.tipo[1], inst.nombre[1]))
            codigo.append(self.main.generarAssembler())

        codigo.append("    mov eax, 1      ; sys_exit")
        codigo.append("    xor ebx, ebx")
        codigo.append("    int 0x80")

        # floats adicionales acumulados
        for entry in _asm_data:
            if entry not in data:
                data.append(entry)

        seen = set()
        for variable in self.variables:
            key = variable[1]
            if key not in seen:
                seen.add(key)
                if variable[0] == 'int':
                    bss.append(f'    {variable[1]}: resd 1')
                elif variable[0] == 'float':
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
        ret = " -> i32" if self.tipo[1] == "int" else (" -> f32" if self.tipo[1] == "float" else "")
        return f"fn {self.nombre[1]}({params}){ret} {{\n    {cuerpo}\n}}"

    def generarAssembler(self):
        codigo = f"{self.nombre[1]}:\n"
        for param in self.parametros:
            codigo += "    pop   eax\n"
            codigo += f"    mov [{param.nombre[1]}], eax\n"
        codigo += "\n".join(c.generarAssembler() for c in self.cuerpo)
        codigo += "\n    ret\n"
        return codigo


class NodoParametro(NodoAST):
    def __init__(self, tipo, nombre):
        self.tipo = tipo
        self.nombre = nombre

    def traducirPy(self):   return self.nombre[1]
    def traducirJS(self):   return self.nombre[1]
    def traducirRuby(self): return self.nombre[1]
    def traducirRust(self):
        t = "i32" if self.tipo[1] == "int" else ("f32" if self.tipo[1] == "float" else self.tipo[1])
        return f"{self.nombre[1]}: {t}"


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

    def traducirPy(self):   return f"{self.izquierda.traducirPy()} {self.operador[1]} {self.derecha.traducirPy()}"
    def traducirJS(self):   return f"{self.izquierda.traducirJS()} {self.operador[1]} {self.derecha.traducirJS()}"
    def traducirRuby(self): return f"{self.izquierda.traducirRuby()} {self.operador[1]} {self.derecha.traducirRuby()}"
    def traducirRust(self): return f"{self.izquierda.traducirRust()} {self.operador[1]} {self.derecha.traducirRust()}"

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
        return "\n".join(codigo)


class NodoRetorno(NodoAST):
    def __init__(self, expresion):
        self.expresion = expresion

    def traducirPy(self):   return f"return {self.expresion.traducirPy()}"
    def traducirJS(self):   return f"return {self.expresion.traducirJS()};"
    def traducirRuby(self): return f"return {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"return {self.expresion.traducirRust()};"
    def generarAssembler(self): return self.expresion.generarAssembler()


class NodoPrint(NodoAST):
    def __init__(self, expresion):
        self.expresion = expresion

    def traducirPy(self):   return f"print({self.expresion.traducirPy()})"
    def traducirJS(self):   return f"console.log({self.expresion.traducirJS()});"
    def traducirRuby(self): return f"print {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"print!(\"{{}}\", {self.expresion.traducirRust()});"

    def generarAssembler(self):
        res  = self.expresion.generarAssembler()
        res += "\n    push  eax"
        res += "\n    push  fmt_int"
        res += "\n    call  printf"
        res += "\n    add   esp, 8"
        return res


class NodoPrintln(NodoAST):
    def __init__(self, expresion):
        self.expresion = expresion

    def traducirPy(self):   return f"print({self.expresion.traducirPy()})"
    def traducirJS(self):   return f"console.log({self.expresion.traducirJS()});"
    def traducirRuby(self): return f"puts {self.expresion.traducirRuby()}"
    def traducirRust(self): return f"println!(\"{{}}\", {self.expresion.traducirRust()});"

    def generarAssembler(self):
        res  = self.expresion.generarAssembler()
        res += "\n    push  eax"
        res += "\n    push  fmt_int_ln"
        res += "\n    call  printf"
        res += "\n    add   esp, 8"
        return res


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

    def generarAssembler(self): return "; if/else — pendiente"


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

    def generarAssembler(self): return "; while — pendiente"


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

    def generarAssembler(self): return "; for — pendiente"


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
    def __init__(self, valor):
        self.valor = valor

    def traducirPy(self):   return self.valor[1]
    def traducirJS(self):   return self.valor[1]
    def traducirRuby(self): return self.valor[1]
    def traducirRust(self): return self.valor[1]
    def generarAssembler(self): return "; string literal — pendiente"


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
        return "\n".join(codigo)


class NodoInstruccion(NodoAST):
    """Nodo genérico para instrucciones como cout, puts, printf."""
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

    def generarAssembler(self): return "; instruccion genérica — pendiente"


class NodoCondicional(NodoAST):
    """Alias para compatibilidad con sintactico.py (usa NodoCondicional)."""
    def __init__(self, condicion, cuerpo_if, cuerpo_else):
        self.condicion   = condicion
        self.cuerpo_if   = cuerpo_if
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
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirJS()

    def traducirRuby(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirRuby()

    def traducirRust(self):
        return NodoIf(self.condicion, self.cuerpo_if, self.cuerpo_else).traducirRust()

    def generarAssembler(self): return "; condicional — pendiente"


class NodoIncremento(NodoAST):
    def __init__(self, nombre, operador):
        self.nombre   = nombre
        self.operador = operador

    def traducirPy(self):
        if self.operador[1] == '++': return f"{self.nombre[1]} += 1"
        if self.operador[1] == '--': return f"{self.nombre[1]} -= 1"
        return f"{self.nombre[1]}{self.operador[1]}"

    def traducirJS(self):   return f"{self.nombre[1]}{self.operador[1]}"
    def traducirRuby(self): return self.traducirPy()
    def traducirRust(self): return self.traducirPy()
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
    def generarAssembler(self): return "; scanf — pendiente"


# ─────────────────────────────────────────────
# PARSER
# ─────────────────────────────────────────────
class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos    = 0

    def obtener_token(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def coincidir(self, tipo_esperado):
        tok = self.obtener_token()
        if tok and tok[0] == tipo_esperado:
            self.pos += 1
            return tok
        raise SyntaxError(
            f"Error sintáctico: se esperaba {tipo_esperado} "
            f"pero se encontró {tok}"
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
        tipo_retorno    = self.coincidir('KEYWORD')
        nombre_funcion  = self.coincidir('IDENTIFIER')
        self.coincidir('DELIMITER')   # (
        parametros = [] if self.obtener_token()[1] == ')' else self.parametros()
        self.coincidir('DELIMITER')   # )
        self.coincidir('DELIMITER')   # {
        cuerpo = self.cuerpo()
        self.coincidir('DELIMITER')   # }
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
            elif tok[1] == 'scanf':
                instrucciones.append(self.entradaUsuario())
            elif tok[1] == 'if':
                instrucciones.append(self.if_instr())
            elif tok[1] == 'while':
                instrucciones.append(self.while_instr())
            elif tok[1] == 'for':
                instrucciones.append(self.for_instr())
            elif tok[0] == 'KEYWORD':
                instrucciones.append(self.asignacion())
            elif tok[0] == 'IDENTIFIER':
                instrucciones.append(self.asignacion_sin_tipo())
            else:
                raise SyntaxError(f"Instrucción no válida: {tok}")
        return instrucciones

    def asignacion(self):
        tipo   = self.coincidir('KEYWORD')
        nombre = self.coincidir('IDENTIFIER')
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

    def retorno(self):
        self.coincidir('KEYWORD')
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

    def impresionCout(self):
        keyword = self.coincidir('KEYWORD')
        args = []
        while self.obtener_token() and self.obtener_token()[1] == '<<':
            self.coincidir('OPERATOR')
            args.append(self.termino())
        self.coincidir('DELIMITER')
        return NodoInstruccion(keyword, args)

    def entradaUsuario(self):
        keyword  = self.coincidir('KEYWORD')
        self.coincidir('DELIMITER')
        formato  = self.expresion()
        self.coincidir('DELIMITER')
        variable = self.coincidir('IDENTIFIER')
        self.coincidir('DELIMITER')
        self.coincidir('DELIMITER')
        return NodoEntrada(keyword, formato, variable)

    def if_instr(self):
        self.coincidir('KEYWORD')
        self.coincidir('DELIMITER')
        cond = self.expresion()
        self.coincidir('DELIMITER')
        self.coincidir('DELIMITER')
        cuerpo_if = self.cuerpo()
        self.coincidir('DELIMITER')
        cuerpo_else = None
        if self.obtener_token() and self.obtener_token()[1] == 'else':
            self.coincidir('KEYWORD')
            self.coincidir('DELIMITER')
            cuerpo_else = self.cuerpo()
            self.coincidir('DELIMITER')
        return NodoIf(cond, cuerpo_if, cuerpo_else)

    def while_instr(self):
        self.coincidir('KEYWORD')
        self.coincidir('DELIMITER')
        cond = self.expresion()
        self.coincidir('DELIMITER')
        self.coincidir('DELIMITER')
        cuerpo = self.cuerpo()
        self.coincidir('DELIMITER')
        return NodoWhile(cond, cuerpo)

    def for_instr(self):
        self.coincidir('KEYWORD')
        self.coincidir('DELIMITER')
        inicio = self.asignacion()
        cond   = self.expresion()
        self.coincidir('DELIMITER')
        incr   = self.incremento_for()
        self.coincidir('DELIMITER')
        self.coincidir('DELIMITER')
        cuerpo = self.cuerpo()
        self.coincidir('DELIMITER')
        return NodoFor(inicio, cond, incr, cuerpo)

    def incremento_for(self):
        nombre   = self.coincidir('IDENTIFIER')
        operador = self.coincidir('OPERATOR')
        return NodoIncremento(nombre, operador)

    def expresion(self):
        izquierda = self.termino()
        while self.obtener_token() and self.obtener_token()[0] == 'OPERATOR':
            op     = self.coincidir('OPERATOR')
            derecha = self.termino()
            izquierda = NodoOperacion(izquierda, op, derecha)
        return izquierda

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
        elif tok[0] == 'IDENTIFIER':
            ident = self.coincidir('IDENTIFIER')
            if self.obtener_token() and self.obtener_token()[1] == '(':
                self.coincidir('DELIMITER')
                args = self.llamadaFuncion()
                self.coincidir('DELIMITER')
                return NodoLlamadaFuncion(ident[1], args)
            return NodoIdent(ident)
        else:
            raise SyntaxError(f"Expresión no válida: {tok}")

    def llamadaFuncion(self):
        args = []
        if self.obtener_token() and self.obtener_token()[1] == ')':
            return args
        args.append(self.termino())
        while self.obtener_token() and self.obtener_token()[1] == ',':
            self.coincidir('DELIMITER')
            args.append(self.termino())
        return args


# ─────────────────────────────────────────────
# ANALIZADOR SEMÁNTICO
# ─────────────────────────────────────────────
class AnalizadorSemantico:
    def __init__(self):
        self.pila_tablas    = [{}]
        self.historial_scopes = []

    def analizar(self, nodo):
        metodo = f'visitar_{type(nodo).__name__}'
        if hasattr(self, metodo):
            return getattr(self, metodo)(nodo)
        # nodos que no necesitan análisis semántico especial
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
        for f in nodo.funciones:
            self.analizar(f)
        if nodo.main:
            self.analizar(nodo.main)

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
            sim = self.buscar(nombre)
            if tipo_expr and sim['tipo'] != tipo_expr:
                raise Exception(f"Error semántico: tipos incompatibles en asignación de '{nombre}'")

    def visitar_NodoOperacion(self, nodo):
        ti = self.analizar(nodo.izquierda)
        td = self.analizar(nodo.derecha)
        if ti and td and ti != td:
            raise Exception(f"Error semántico: operación entre tipos '{ti}' y '{td}'")
        return ti

    def visitar_NodoNumero(self, nodo):  return 'int'
    def visitar_NodoFloat(self, nodo):   return 'float'
    def visitar_NodoString(self, nodo):  return 'string'

    def visitar_NodoIdent(self, nodo):
        return self.buscar(nodo.nombre[1])['tipo']

    def visitar_NodoRetorno(self, nodo):
        return self.analizar(nodo.expresion)

    def visitar_NodoPrint(self, nodo):
        return self.analizar(nodo.expresion)

    def visitar_NodoPrintln(self, nodo):
        return self.analizar(nodo.expresion)

    def visitar_NodoInstruccion(self, nodo):
        for a in nodo.argumentos_instruccion:
            self.analizar(a)

    def visitar_NodoIf(self, nodo):
        self.analizar(nodo.condicion)
        for c in nodo.cuerpo_if:  self.analizar(c)
        if nodo.cuerpo_else:
            for c in nodo.cuerpo_else: self.analizar(c)

    def visitar_NodoCondicional(self, nodo):
        self.visitar_NodoIf(nodo)

    def visitar_NodoWhile(self, nodo):
        self.analizar(nodo.condicion)
        for c in nodo.cuerpo: self.analizar(c)

    def visitar_NodoFor(self, nodo):
        self.analizar(nodo.inicializacion)
        self.analizar(nodo.condicion)
        for c in nodo.cuerpo: self.analizar(c)

    def visitar_NodoLlamadaFuncion(self, nodo):
        nf = nodo.nombre_funcion
        if nf not in self.pila_tablas[0]:
            raise Exception(f"Error semántico: función '{nf}' no definida")
        funcion = self.pila_tablas[0][nf]
        params  = funcion['parametros']
        args    = nodo.argumentos
        if len(args) != len(params):
            raise Exception(
                f"Error semántico: '{nf}' espera {len(params)} argumento(s), "
                f"se pasaron {len(args)}"
            )
        for arg, param in zip(args, params):
            ta = self.analizar(arg)
            tp = param.tipo[1]
            if ta and ta != tp:
                raise Exception(
                    f"Error semántico: tipo incorrecto en argumento de '{nf}'"
                )
        return funcion['tipo']

    def tabla_como_dict(self):
        """Devuelve la tabla de símbolos como dict serializable."""
        resultado = {}
        # Scope global
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
        # Scopes de funciones
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
    if isinstance(nodo, (NodoPrint, NodoPrintln)):
        return {'tipo': type(nodo).__name__.lower(), 'expresion': ast_a_json(nodo.expresion)}
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
    return {'tipo': 'desconocido', 'clase': type(nodo).__name__}


# ─────────────────────────────────────────────
# PIPELINE PRINCIPAL (usado por la API)
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
        # No retornamos — igual intentamos generar código

    # 4. GENERACIÓN DE ASSEMBLER
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

    resultado['ok'] = len(resultado['errores']) == 0
    return resultado
