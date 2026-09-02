import ast, pathlib, re

PT_HINTS = re.compile(r'\b(nao|sem|vazio|vazia|desconhecid|declarad|degrau|balde|rampa|campo|conjunto|negativ|repetid|ilegivel|traducao|namespace|simbolo|inteiro|positivo|anula|encolher|espera|piso|topo|rajada|ordem|chegada|sentido|comecaria|primeira|pausa|mensagem|elemento)\b', re.IGNORECASE)

root = pathlib.Path("backend/src")
results = []
for path in root.rglob("*.py"):
    try:
        tree = ast.parse(path.read_text(), filename=str(path))
    except SyntaxError:
        continue
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func_name = None
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr
            if not func_name:
                continue
            if not (func_name.endswith("Error") or func_name.endswith("Exception") or func_name in ("ValueError","TypeError","RuntimeError")):
                continue
            for arg in node.args:
                text = None
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    text = arg.value
                elif isinstance(arg, ast.JoinedStr):
                    parts = []
                    for v in arg.values:
                        if isinstance(v, ast.Constant) and isinstance(v.value, str):
                            parts.append(v.value)
                        else:
                            parts.append("{X}")
                    text = "".join(parts)
                if text:
                    is_pt = bool(PT_HINTS.search(text))
                    results.append((str(path), node.lineno, func_name, is_pt, text[:100]))

pt = [r for r in results if r[3]]
en = [r for r in results if not r[3]]
print(f"TOTAL={len(results)} PT={len(pt)} EN={len(en)}")
print("--- PT ---")
for r in pt:
    print(f"{r[0]}:{r[1]} {r[2]}: {r[4]!r}")
