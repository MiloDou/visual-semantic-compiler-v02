//=============================================================================
// utils/astToFlow.js — Conversor de AST a React Flow (Editor -> Flowchart)
//
// Recibe un AST JSON desde el backend y genera un arreglo de `nodes` y `edges`
// para inyectarlo en React Flow. Implementa un layout básico automático.
//=============================================================================

function exprToString(expr) {
  if (!expr) return '';
  if (expr.tipo === 'numero' || expr.tipo === 'float') return expr.valor;
  if (expr.tipo === 'identificador') return expr.nombre;
  if (expr.tipo === 'operacion') {
    const izq = exprToString(expr.izquierda);
    const der = exprToString(expr.derecha);
    return `${izq} ${expr.operador} ${der}`;
  }
  return '';
}

export function astToFlow(ast) {
  const nodes = [];
  const edges = [];
  let nodeIdCounter = 1;
  let edgeIdCounter = 1;

  const newId = () => `node-${nodeIdCounter++}`;
  const newEdgeId = () => `edge-${edgeIdCounter++}`;

  let currentY = 50;

  // 1. Nodo Inicio
  const inicioId = newId();
  nodes.push({
    id: inicioId,
    type: 'flowNode',
    position: { x: 250, y: currentY },
    data: { shape: 'inicio', label: 'INICIO' },
  });

  if (!ast || ast.tipo !== 'programa' || !ast.main) {
    return { nodes, edges }; // AST vacío o inválido
  }

  let prevId = inicioId;

  // Función recursiva para procesar un bloque de instrucciones
  function processBlock(instrucciones, parentId, startX, startY) {
    let currentId = parentId;
    let localY = startY;

    if (!instrucciones) return { lastId: currentId, nextY: localY };

    for (const inst of instrucciones) {
      localY += 100;
      const id = newId();

      let shape = 'proceso';
      let label = '';
      let varType = '';
      let varName = '';
      let varValue = '';

      if (inst.tipo === 'asignacion') {
        shape = 'asignacion';
        const exprStr = exprToString(inst.expresion);
        label = `${inst.tipo_dato || ''} ${inst.variable} = ${exprStr}`.trim();
        varType = inst.tipo_dato;
        varName = inst.variable;
        varValue = exprStr;
      } else if (inst.tipo === 'nodoprint' || inst.tipo === 'nodoprintln') {
        shape = 'print';
        label = exprToString(inst.expresion);
      } else if (inst.tipo === 'retorno') {
        shape = 'fin'; // Trataremos el return como un fin preliminar
        label = `return ${exprToString(inst.expresion)}`;
      } else if (inst.tipo === 'if') {
        shape = 'condicion';
        label = exprToString(inst.condicion);
      } else if (inst.tipo === 'while') {
        shape = 'condicion'; // Podría ser ciclo, pero usaremos condicion
        label = exprToString(inst.condicion);
      } else if (inst.tipo === 'incremento') {
        shape = 'proceso';
        label = `${inst.variable}${inst.operador}`;
      } else if (inst.tipo === 'instruccion') {
        shape = 'proceso';
        label = inst.instruccion;
      }

      nodes.push({
        id,
        type: 'flowNode',
        position: { x: startX, y: localY },
        data: { shape, label, varType, varName, varValue, expr: label },
      });

      edges.push({
        id: newEdgeId(),
        source: currentId,
        target: id,
        style: { stroke: '#7c3aed', strokeWidth: 1.5 }
      });

      currentId = id;

      // Ramificaciones
      if (inst.tipo === 'if') {
        const condId = id;
        
        // Rama SI (derecha)
        let endSiId = condId;
        if (inst.cuerpo_if && inst.cuerpo_if.length > 0) {
          const siBlock = processBlock(inst.cuerpo_if, condId, startX + 200, localY);
          // Modificamos el label del primer edge de la rama SI
          const firstSiEdge = edges[edges.length - inst.cuerpo_if.length]; // Aproximación, mejor buscar por source=condId
          // Buscar el edge exacto
          const edge = edges.find(e => e.source === condId && e.target === siBlock.firstTargetId);
          
          endSiId = siBlock.lastId;
        }

        // Rama NO (izquierda)
        let endNoId = condId;
        if (inst.cuerpo_else && inst.cuerpo_else.length > 0) {
          const noBlock = processBlock(inst.cuerpo_else, condId, startX - 200, localY);
          endNoId = noBlock.lastId;
        }

        // Nodo de confluencia (proceso dummy vacío o simplemente continuamos desde un punto)
        // Para simplificar el autolayout de árboles, no crearemos un nodo de "merge" por ahora,
        // simplemente conectaremos los extremos al siguiente nodo de la lista original, si hay.
        // Pero necesitamos retornar de alguna forma. En este diseño básico, la generación visual 
        // a partir de C++ puede requerir ajustes manuales del usuario.
        // Asignaremos currentId a endSiId para continuar el flujo principal (como un hack simplificado).
        currentId = endSiId; // Ojo, esto no une la rama NO al flujo principal.
      } else if (inst.tipo === 'while') {
        const condId = id;
        if (inst.cuerpo && inst.cuerpo.length > 0) {
          const whileBlock = processBlock(inst.cuerpo, condId, startX + 200, localY);
          // Arista de retorno
          edges.push({
            id: newEdgeId(),
            source: whileBlock.lastId,
            target: condId,
            label: 'NO', // En realidad la salida es NO, el ciclo es SI, pero en nuestro generador NO es salir.
            style: { stroke: '#7c3aed', strokeWidth: 1.5 }
          });
          currentId = condId; // El flujo principal continúa desde la condición (rama NO)
        }
      }
    }

    return { lastId: currentId, nextY: localY, firstTargetId: edges.find(e => e.source === parentId)?.target };
  }

  const { lastId, nextY } = processBlock(ast.main.cuerpo, inicioId, 250, currentY);

  // 3. Nodo Fin
  const finId = newId();
  nodes.push({
    id: finId,
    type: 'flowNode',
    position: { x: 250, y: nextY + 100 },
    data: { shape: 'fin', label: 'FIN' },
  });

  edges.push({
    id: newEdgeId(),
    source: lastId,
    target: finId,
    style: { stroke: '#7c3aed', strokeWidth: 1.5 }
  });

  // Arreglar etiquetas de aristas en condiciones (If / While)
  for (const node of nodes) {
    if (node.data.shape === 'condicion') {
      const outEdges = edges.filter(e => e.source === node.id);
      if (outEdges.length > 0) outEdges[0].label = 'SI';
      if (outEdges.length > 1) outEdges[1].label = 'NO';
    }
  }

  return { nodes, edges };
}
