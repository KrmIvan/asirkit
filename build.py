#!/usr/bin/env python3
"""Genera index.html (un solo fichero, sin dependencias) a partir de src/.

Uso:  python3 build.py
"""
from pathlib import Path

RAIZ = Path(__file__).parent
SRC = RAIZ / "src"

plantilla = (SRC / "plantilla.html").read_text(encoding="utf-8")
css = (SRC / "estilos.css").read_text(encoding="utf-8")
js = "\n".join(f.read_text(encoding="utf-8") for f in sorted((SRC / "js").glob("*.js")))

html = plantilla.replace("{{CSS}}", css).replace("{{JS}}", js)
(RAIZ / "index.html").write_text(html, encoding="utf-8")
print(f"index.html generado ({len(html.encode('utf-8')) // 1024} KB)")
