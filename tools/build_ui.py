#!/usr/bin/env python3
"""Build the plugin's web UI from the design mockup.

Input:
  ui/Main.dc.html   - the GUI design (template + Component logic)
  ui/bridge.js      - glue between the GUI and the plugin engine
  ui/vendor/*.js    - Preact + htm (small libraries that render the template)

Output:
  ui/build/index.html                - standalone page (open it in a browser to test)
  NeuralAmpModeler/DKRequiemUI.h     - the same page embedded in the plugin as C++ string chunks

Run:  python3 tools/build_ui.py
"""
import html as htmlmod
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ui", "Main.dc.html")
BRIDGE = os.path.join(ROOT, "ui", "bridge.js")
VENDOR = os.path.join(ROOT, "ui", "vendor")
OUT_HTML = os.path.join(ROOT, "ui", "build", "index.html")
OUT_HDR = os.path.join(ROOT, "NeuralAmpModeler", "DKRequiemUI.h")

TOKEN = re.compile(r"<sc-(for|if)\b([^>]*)>|</sc-(for|if)>|\{\{\s*([^}]*?)\s*\}\}")
IDENT = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$")


def attr(s, name):
    m = re.search(name + r'="([^"]*)"', s)
    return m.group(1) if m else None


def hole_path(expr):
    m = re.fullmatch(r"\{\{\s*([^}]*?)\s*\}\}", expr)
    return m.group(1) if m else expr


def js_ref(path, scope):
    if path in ("true", "false", "null"):
        return path
    if not IDENT.match(path):
        raise ValueError("Unsupported hole: {{%s}}" % path)
    parts = path.split(".")
    base = parts[0] if parts[0] in scope else "v." + parts[0]
    return base + "".join("?." + p for p in parts[1:])


def esc_static(s):
    # Static template text: decode HTML entities htm doesn't know about, escape for a JS template literal.
    for ent in ("&lsaquo;", "&rsaquo;", "&nbsp;", "&middot;", "&times;"):
        s = s.replace(ent, htmlmod.unescape(ent))
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def convert(tpl):
    pos = 0
    scope = []
    out = []  # stack of lists of strings
    out.append([])
    stack = []  # (kind, list_expr or cond_expr, var)
    for m in TOKEN.finditer(tpl):
        out[-1].append(esc_static(tpl[pos:m.start()]))
        pos = m.end()
        open_kind, open_attrs, close_kind, hole = m.groups()
        if hole is not None:
            out[-1].append("${" + js_ref(hole, scope) + "}")
        elif open_kind == "for":
            lst = js_ref(hole_path(attr(open_attrs, "list")), scope)
            var = attr(open_attrs, "as")
            stack.append(("for", lst, var))
            scope.append(var)
            out.append([])
        elif open_kind == "if":
            cond = js_ref(hole_path(attr(open_attrs, "value")), scope)
            stack.append(("if", cond, None))
            out.append([])
        else:
            kind, expr, var = stack.pop()
            if kind != close_kind:
                raise ValueError("Mismatched </sc-%s>" % close_kind)
            body = "".join(out.pop())
            if kind == "for":
                scope.pop()
                out[-1].append("${(%s || []).map((%s) => html`%s`)}" % (expr, var, body))
            else:
                out[-1].append("${(%s) ? html`%s` : null}" % (expr, body))
    out[-1].append(esc_static(tpl[pos:]))
    if stack:
        raise ValueError("Unclosed sc-%s" % stack[-1][0])
    return "".join(out[-1])


def js_escape(ch):
    cp = ord(ch)
    if cp <= 0xFFFF:
        return "\\u%04x" % cp
    cp -= 0x10000
    return "\\u%04x\\u%04x" % (0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF))


def to_ascii(page):
    # Non-ASCII characters become \uXXXX inside <script> and &#xXXXX; in HTML/CSS.
    parts = re.split(r"(<script>.*?</script>)", page, flags=re.S)
    res = []
    for k, part in enumerate(parts):
        if k % 2:
            res.append("".join(c if ord(c) < 128 else js_escape(c) for c in part))
        else:
            res.append("".join(c if ord(c) < 128 else "&#x%x;" % ord(c) for c in part))
    return "".join(res)


def main():
    src = open(SRC, encoding="utf-8").read()
    helmet = re.search(r"<helmet>(.*?)</helmet>", src, re.S).group(1)
    body = re.search(r"<x-dc>(.*?)</x-dc>", src, re.S).group(1)
    body = re.sub(r"<helmet>.*?</helmet>", "", body, flags=re.S)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    body = body.replace("onDoubleClick=", "onDblClick=")
    props = re.search(r"data-props='([^']*)'", src).group(1)
    logic = re.search(r"<script type=\"text/x-dc\"[^>]*>(.*?)</script>", src, re.S).group(1)

    tpl_js = convert(body.strip())
    preact = open(os.path.join(VENDOR, "preact.min.umd.js"), encoding="utf-8").read()
    htm = open(os.path.join(VENDOR, "htm.umd.js"), encoding="utf-8").read()
    bridge = open(BRIDGE, encoding="utf-8").read()

    page = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deathknell Requiem</title>
%(helmet)s
<style>html,body{margin:0;overflow:hidden;background:#1a1d20}</style>
</head>
<body>
<div id="app"></div>
<script>%(preact)s</script>
<script>%(htm)s</script>
<script>
(function () {
  const html = htm.bind(preact.h);
  const DC_PROPS = %(props)s;
  class DCLogic extends preact.Component {
    render() { return template(this.renderVals() || {}); }
  }
  function template(v) {
    return html`%(tpl)s`;
  }
  %(logic)s
  %(bridge)s
  const props = {};
  for (const k in DC_PROPS) if (k[0] !== '$' && 'default' in DC_PROPS[k]) props[k] = DC_PROPS[k].default;
  preact.render(preact.h(DK.wrap(Component), props), document.getElementById('app'));
})();
</script>
</body>
</html>
""" % {"helmet": helmet.strip(), "preact": preact, "htm": htm, "props": props, "tpl": tpl_js, "logic": logic, "bridge": bridge}

    os.makedirs(os.path.dirname(OUT_HTML), exist_ok=True)
    open(OUT_HTML, "w", encoding="utf-8").write(page)

    # Keep the embedded copy pure ASCII so every compiler reads it the same way.
    data = to_ascii(page).encode("ascii")
    chunks, i = [], 0
    while i < len(data):
        j = min(i + 12000, len(data))
        chunks.append(data[i:j].decode("ascii"))
        i = j
    delim = "DKUI"
    for c in chunks:
        assert (")" + delim + '"') not in c
    lines = ["// Generated by tools/build_ui.py from ui/Main.dc.html. Do not edit by hand.", "#pragma once", "#include <string>", "",
             "inline const std::string& DKRequiemUIHTML()", "{", "  static const char* const kChunks[] = {"]
    for c in chunks:
        lines.append('    R"%s(%s)%s",' % (delim, c, delim))
    lines += ["  };", "  static const std::string s = [] {", "    std::string r;",
              "    for (const char* c : kChunks) r += c;", "    return r;", "  }();",
              "  return s;", "}", ""]
    open(OUT_HDR, "w", encoding="utf-8").write("\n".join(lines))
    print("Wrote %s (%d bytes) and %s (%d chunks)" % (OUT_HTML, len(data), OUT_HDR, len(chunks)))


if __name__ == "__main__":
    sys.exit(main())
