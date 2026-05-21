import requests
import json

data = {
    "nodes": [
        {"id": "n1", "type": "inicio", "label": "Inicio"},
        {"id": "n2", "type": "asignacion", "varName": "n", "varType": "int", "varValue": "5"},
        {"id": "n3", "type": "asignacion", "varName": "f", "varType": "int", "varValue": "1"},
        {"id": "n4", "type": "condicion", "label": "n > 0"},
        {"id": "n5", "type": "proceso", "label": "f = f * n"},
        {"id": "n6", "type": "proceso", "label": "n = n - 1"},
        {"id": "n7", "type": "io", "label": "f"},
        {"id": "n8", "type": "fin", "label": "Fin"}
    ],
    "edges": [
        {"id": "e1", "source": "n1", "target": "n2"},
        {"id": "e2", "source": "n2", "target": "n3"},
        {"id": "e3", "source": "n3", "target": "n4"},
        {"id": "e4", "source": "n4", "target": "n5", "label": "SI"},
        {"id": "e5", "source": "n5", "target": "n6"},
        {"id": "e6", "source": "n6", "target": "n4"},
        {"id": "e7", "source": "n4", "target": "n7", "label": "NO"},
        {"id": "e8", "source": "n7", "target": "n8"}
    ]
}

res = requests.post("http://localhost:5000/api/compilar_diagrama", json=data)
print(json.dumps(res.json(), indent=2))
