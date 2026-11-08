/* ============================================================
   Diagnóstico de errores (interfaz)
   ============================================================ */
const EJEMPLOS_ERR = [
  ["BIND: falta ;", "/etc/bind/named.conf.options:4: missing ';' before '}'"],
  ["Zona sin punto", "zone empresa.local/IN: intranet.empresa.local.empresa.local: CNAME and other data\nzone empresa.local/IN: NS 'srv01.empresa.local.empresa.local' has no address records (A or AAAA)"],
  ["netplan", "Error in network definition: /etc/netplan/01-asirkit.yaml line 6 column 0: found character that cannot start any token"],
  ["vsftpd", "500 OOPS: vsftpd: refusing to run with writable root inside chroot()"],
  ["PowerShell", "No se puede cargar el archivo C:\\scripts\\03-dhcp.ps1 porque la ejecución de scripts está deshabilitada en este sistema."],
  ["Unir al dominio", "Add-Computer : No se puede agregar el equipo 'PC01' al dominio 'empresa.local'. El dominio especificado no existe o no se pudo establecer contacto con él."],
  ["Script de Windows", "/home/ivan/03-dhcp.sh: line 2: $'\\r': command not found"]
];
function renderDiag(){
  const box = document.getElementById("diag");
  const d = derivar(), refs = ficherosGenerados(d);
  if (!UI.refId && refs.length) UI.refId = (refs.find(r => r.id.includes(":")) || refs[0]).id;
  box.innerHTML = `
    <div class="diaggrid">
      <section class="panel">
        <h3>1 · Explicar un error</h3>
        <label class="f wide" for="errTxt"><span>Pega el mensaje de error completo (de la terminal, PowerShell, journalctl…)</span>
          <textarea id="errTxt" spellcheck="false" placeholder="Por ejemplo: /etc/bind/named.conf.options:4: missing ';' before '}'">${esc(UI.errTxt || "")}</textarea></label>
        <div class="ejemplos"><span>Probar con:</span>${EJEMPLOS_ERR.map((e, i) => `<button type="button" class="cat" data-ejerr="${i}">${esc(e[0])}</button>`).join("")}</div>
        <div id="errRes"></div>
      </section>
      <section class="panel">
        <h3>2 · Revisar un fichero</h3>
        <div class="fields">
          <label class="f wide" for="refSel"><span>Compararlo con este fichero generado</span>
            <select id="refSel"><option value="">Ninguno (solo revisar la sintaxis)</option>${refs.map(r => `<option value="${esc(r.id)}" ${r.id === UI.refId ? "selected" : ""}>${esc(r.nombre)}</option>`).join("")}</select></label>
          <label class="f" for="tipoSel"><span>Tipo de fichero</span>
            <select id="tipoSel"><option value="auto">Detectar solo</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${UI.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <div class="f"><span>&nbsp;</span><button type="button" class="btn small" id="cargarRef">Copiar el generado aquí para editarlo</button></div>
        </div>
        <label class="f wide" for="miFich" style="margin-top:10px"><span>Pega tu fichero tal como lo tienes en el servidor (cat fichero / Get-Content fichero)</span>
          <textarea id="miFich" class="tall" spellcheck="false" placeholder="Pega aquí el contenido de tu fichero…">${esc(UI.miFichero || "")}</textarea></label>
      </section>
    </div>
    <section class="panel" id="revRes" style="margin-top:20px"></section>`;
  pintarError();
  pintarRevision();
}
function pintarError(){
  const box = document.getElementById("errRes"); if (!box) return;
  const t = UI.errTxt || "";
  if (!t.trim()){ box.innerHTML = `<p class="hint">Se reconocen ${ERRORES.length} errores habituales de Windows Server, Ubuntu, BIND, DHCP, Kea, netplan, Apache, IIS, Samba, SSH, FTP y AD, en español y en inglés.</p>`; return; }
  const { res, linea, fich } = explicarError(t);
  const pista = linea ? `<div class="note">El mensaje señala la <b>línea ${linea}</b>${fich ? ` de <code>${esc(fich)}</code>` : ""}. Pega ese fichero en «Revisar un fichero» y la verás marcada. Para verla en el servidor: <code>sed -n '${Math.max(1, linea - 2)},${linea + 2}p' ${esc(fich || "FICHERO")}</code></div>` : "";
  if (!res.length){ box.innerHTML = pista + `<div class="errcard"><b>No reconozco este error</b>
    <p>Pistas generales que suelen resolverlo:</p>
    <ul><li>Lee solo la <b>primera</b> línea de error: las siguientes suelen ser consecuencia de esa.</li>
    <li>Si un servicio no arranca: <code>journalctl -xeu SERVICIO --no-pager | tail -n 30</code> (Ubuntu) o el Visor de eventos (Windows).</li>
    <li>Valida la configuración con su comando: está en la pestaña «Comprobar» de cada módulo.</li>
    <li>Busca el código exacto del error (AH00526, 0x8007000d, NT_STATUS_…) entre comillas en un buscador.</li></ul></div>`; return; }
  box.innerHTML = pista + res.map(e => `<div class="errcard">
      <div class="et"><b>${esc(e.t)}</b><span class="chip">${esc(e.s)}</span></div>
      <dl><dt>Por qué pasa</dt><dd>${esc(e.q)}</dd><dt>Cómo arreglarlo</dt><dd>${esc(e.a)}</dd><dt>Compruébalo con</dt><dd><button type="button" class="cmd" data-copytxt="${esc(e.c)}">${esc(e.c)}</button></dd></dl>
      <small class="m">Coincide con: «${esc(String(e.m[0]).trim().slice(0, 90))}»</small>
    </div>`).join("");
}
function pintarRevision(){
  const box = document.getElementById("revRes"); if (!box) return;
  const mio = UI.miFichero || "";
  const ref = ficherosGenerados(derivar()).find(r => r.id === UI.refId);
  if (!mio.trim()){ box.innerHTML = `<h3>Resultado</h3><p class="hint">Pega tu fichero arriba. Se revisarán espacios, comas, punto y coma, llaves, sangría, comillas y los errores típicos de cada tipo de fichero${ref ? `, y se comparará línea a línea con <code>${esc(ref.nombre)}</code>` : ""}.</p>`; return; }
  const tipo = UI.tipo && UI.tipo !== "auto" ? UI.tipo : (ref ? ref.tipo : adivinarTipo(mio));
  const problemas = revisar(mio, tipo);
  const porLinea = {}; problemas.forEach(p => (porLinea[p.n] = porLinea[p.n] || []).push(p));
  const globales = porLinea[0] || [];
  const nE = problemas.filter(p => p.nivel === "err").length, nW = problemas.filter(p => p.nivel === "warn").length;
  const msg = ps => ps.map(p => `<div class="lmsg ${p.nivel}"><span class="pill ${p.nivel}">${etiqueta(p.nivel)}</span><b>${esc(p.msg)}</b> ${esc(p.porque)}</div>`).join("");
  let cuerpo, resumenDiff = "";
  const dif = ref ? diff(ref.texto, mio) : null;
  if (dif){
    const falta = dif.filter(x => x.t === "-").length, sobra = dif.filter(x => x.t === "+").length;
    resumenDiff = falta + sobra === 0 ? `<span class="chip state-ok">● Idéntico al generado</span>` : `<span class="chip state-warn">● ${falta} línea${falta !== 1 ? "s" : ""} del generado no están en el tuyo · ${sobra} línea${sobra !== 1 ? "s" : ""} tuya${sobra !== 1 ? "s" : ""} distinta${sobra !== 1 ? "s" : ""}</span>`;
    cuerpo = dif.map(x => {
      const cls = x.t === "=" ? "" : x.t === "-" ? "dm" : "dp";
      const sig = x.t === "=" ? " " : x.t === "-" ? "−" : "+";
      const fila = `<div class="dl ${cls}"><span class="na">${x.a || ""}</span><span class="nb">${x.b || ""}</span><span class="sg">${sig}</span><code>${esc(x.s) || " "}</code></div>`;
      return fila + (x.b && porLinea[x.b] ? msg(porLinea[x.b]) : "");
    }).join("");
  } else {
    cuerpo = mio.split("\n").map((l, i) => `<div class="dl ${porLinea[i + 1] ? "bad" : ""}"><span class="nb">${i + 1}</span><span class="sg"> </span><code>${esc(l) || " "}</code></div>` + (porLinea[i + 1] ? msg(porLinea[i + 1]) : "")).join("");
  }
  box.innerHTML = `
    <div class="revhead"><h3 style="margin:0">Resultado · ${esc(TIPOS[tipo] || tipo)}</h3>
      ${nE ? `<span class="chip state-err">● ${nE} error${nE > 1 ? "es" : ""} de sintaxis</span>` : `<span class="chip state-ok">● Sin errores de sintaxis detectados</span>`}
      ${nW ? `<span class="chip state-warn">● ${nW} aviso${nW > 1 ? "s" : ""}</span>` : ""}${resumenDiff}</div>
    ${globales.length ? `<div style="margin:10px 0">${msg(globales)}</div>` : ""}
    ${dif ? `<div class="legend" style="margin:8px 0"><span><i style="background:var(--del)"></i>Está en el generado y no en el tuyo (te falta o lo cambiaste)</span><span><i style="background:var(--add)"></i>Está en el tuyo y no en el generado</span><span>Columnas: línea del generado · línea tuya</span></div>` : ""}
    <div class="diffview">${cuerpo}</div>
    <p class="hint" style="margin-top:10px">Esta revisión detecta los fallos de escritura más comunes, pero la última palabra la tiene el propio programa: usa también el comando de la pestaña «Comprobar» del módulo.</p>`;
}

/* ============================================================
   Eventos
   ============================================================ */
function onInput(e){
  const el = e.target;
  if (el.id === "cheatQ"){ UI.chuletaQ = el.value; const pos = el.selectionStart; renderChuleta(); const n = document.getElementById("cheatQ"); n.focus(); n.setSelectionRange(pos, pos); return; }
  if (el.id === "swCom"){ UI.comentarios = el.checked; refrescar(); return; }
  if (el.id === "errTxt"){ UI.errTxt = el.value; pintarError(); return; }
  if (el.id === "miFich"){ UI.miFichero = el.value; pintarRevision(); return; }
  if (el.id === "refSel"){ UI.refId = el.value; pintarRevision(); return; }
  if (el.id === "tipoSel"){ UI.tipo = el.value; pintarRevision(); return; }
  if (el.dataset.key){
    const v = el.type === "checkbox" ? el.checked : el.value;
    if (S[el.dataset.key] === v) return;
    S[el.dataset.key] = v;
  } else if (el.dataset.list){
    S[el.dataset.list][+el.dataset.i][el.dataset.f] = el.value;
  } else return;
  guardar(); refrescar();
  if (el.type === "checkbox" && ["dhcpFailover", "gpoFondo"].includes(el.dataset.key)) document.getElementById("form").innerHTML = formulario(actual);
  if (actual === "ad" && el.dataset.key === "csv"){
    const note = document.getElementById("csvNote"), { usuarios } = parseCSV(), deps = departamentos();
    if (note) note.innerHTML = `<b>${usuarios.length}</b> usuarios en <b>${deps.length}</b> departamentos: ${deps.map(x => `OU ${esc(x)} → ${esc(grupoDe(x))}`).join(" · ") || "ninguno"}`;
  }
}
main.addEventListener("input", onInput);
main.addEventListener("change", e => { if (e.target.tagName === "SELECT" || e.target.type === "checkbox") onInput(e); });
main.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.tab !== undefined){ UI.tab[actual] = +t.dataset.tab; refrescar(); document.querySelector(`.tab[data-tab="${t.dataset.tab}"]`)?.focus(); }
  else if (t.id === "btnCopy") copiar(document.getElementById("salida").dataset.code, "Copiado");
  else if (t.dataset.copytxt) copiar(t.dataset.copytxt, "Comando copiado");
  else if (t.dataset.cat) { UI.chuletaCat = t.dataset.cat; renderChuleta(); }
  else if (t.dataset.mod) toggleModulo(t.dataset.mod);
  else if (t.dataset.todos !== undefined){ S.modulos = t.dataset.todos === "1" ? CATALOGO.map(m => m.id) : []; guardar(); render(); }
  else if (t.dataset.nivel){ S.nivel = t.dataset.nivel; guardar(); render(); }
  else if (t.dataset.ejerr !== undefined){ UI.errTxt = EJEMPLOS_ERR[+t.dataset.ejerr][1]; document.getElementById("errTxt").value = UI.errTxt; pintarError(); }
  else if (t.id === "cargarRef"){ const r = ficherosGenerados(derivar()).find(r => r.id === UI.refId); if (r){ UI.miFichero = r.texto; document.getElementById("miFich").value = r.texto; pintarRevision(); aviso("Copiado: ahora cámbialo y verás las diferencias"); } }
  else if (t.dataset.set){ S[t.dataset.set] = t.dataset.val; guardar(); document.getElementById("form").innerHTML = formulario(actual); refrescar(); }
  else if (t.dataset.add){
    const d = derivar();
    if (t.dataset.add === "reservas"){
      const usadas = new Set([S.gw, S.srvIp, S.srv2Ip, ...S.reservas.map(r => r.ip)]), a = ipToInt(S.dhcpIni), b = ipToInt(S.dhcpFin);
      let ip = ""; if (d.ok){ for (let n = d.netAddr + 50; n < d.bcast; n++){ const x = intToIp(n); if (!usadas.has(x) && !(n >= a && n <= b)){ ip = x; break; } } }
      S.reservas.push({ nombre: "equipo" + (S.reservas.length + 1), mac: "00:00:00:00:00:00", ip });
    } else S.registros.push({ tipo: "A", nombre: "nuevo", valor: d.ok ? d.primero : "" });
    guardar(); document.getElementById("form").innerHTML = formulario(actual); refrescar();
  }
  else if (t.dataset.del){ S[t.dataset.del].splice(+t.dataset.i, 1); guardar(); document.getElementById("form").innerHTML = formulario(actual); refrescar(); }
});
main.addEventListener("mouseover", e => { const p = e.target.closest(".port"), h = document.getElementById("hoverIp"); if (p && h) h.textContent = `${p.dataset.ip} · ${p.dataset.t}`; });
document.querySelector(".level").addEventListener("click", e => { const b = e.target.closest("[data-nivel]"); if (b){ S.nivel = b.dataset.nivel; guardar(); render(); aviso(S.nivel === "pro" ? "Nivel profesional: lo añadido sale en morado" : "Nivel clase"); } });

function copiar(txt, msg){
  const hecho = () => aviso(msg);
  const plan = () => { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); hecho(); } catch(e){ aviso("No se pudo copiar: selecciona el texto a mano"); } ta.remove(); };
  try { navigator.clipboard.writeText(txt).then(hecho, plan); } catch(e){ plan(); }
}
let tAviso;
function aviso(t){ const el = document.getElementById("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove("show"), 2200); }

function desdeHash(){
  const h = location.hash.slice(1);
  actual = h === "modulos" || h === "red" || has(h) ? h : (primeraVez ? "modulos" : "red");
  primeraVez = false;
  render();
}
window.addEventListener("hashchange", desdeHash);

/* Exportar / importar / ejemplo */
const modal = document.getElementById("modal"), mArea = document.getElementById("modalArea"), mFile = document.getElementById("modalFile");
let modoModal = "";
function abrirModal(modo){
  modoModal = modo;
  document.getElementById("modalTitle").textContent = modo === "exp" ? "Exportar proyecto" : "Importar proyecto";
  document.getElementById("modalText").textContent = modo === "exp" ? "Copia este JSON y guárdalo como proyecto.json. Con «Importar» lo puedes volver a cargar aquí o en otro navegador." : "Pega el JSON de un proyecto exportado o elige el fichero.";
  document.getElementById("modalOk").textContent = modo === "exp" ? "Copiar JSON" : "Cargar proyecto";
  mFile.style.display = modo === "exp" ? "none" : "";
  mArea.value = modo === "exp" ? JSON.stringify(S, null, 2) : "";
  mArea.readOnly = modo === "exp";
  modal.classList.add("open"); mArea.focus();
}
const cerrarModal = () => modal.classList.remove("open");
document.getElementById("btnExport").onclick = () => abrirModal("exp");
document.getElementById("btnImport").onclick = () => abrirModal("imp");
document.getElementById("modalCancel").onclick = cerrarModal;
modal.addEventListener("click", e => { if (e.target === modal) cerrarModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarModal(); });
mFile.addEventListener("change", () => { const f = mFile.files[0]; if (f) f.text().then(t => mArea.value = t); });
document.getElementById("modalOk").onclick = () => {
  if (modoModal === "exp"){ copiar(mArea.value, "Proyecto copiado"); return; }
  try {
    const nuevo = JSON.parse(mArea.value);
    if (typeof nuevo !== "object" || !nuevo.red) throw new Error();
    S = Object.assign(structuredClone(EJEMPLO), nuevo); guardar(); cerrarModal(); render(); aviso("Proyecto cargado");
  } catch(e){ document.getElementById("modalText").textContent = "Ese texto no es un proyecto válido de ASIRkit. Comprueba que has copiado el JSON completo."; }
};
document.getElementById("btnReset").onclick = () => { const n = S.nivel, m = S.modulos; S = structuredClone(EJEMPLO); S.nivel = n; S.modulos = m; guardar(); render(); aviso("Datos de ejemplo cargados (se mantienen el nivel y los módulos)"); };

desdeHash();
