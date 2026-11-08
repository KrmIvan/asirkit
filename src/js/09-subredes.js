/* ============================================================
   Diseñador de subredes: VLSM, partes iguales y calculadora
   ============================================================ */
const VLSM_EJEMPLO = {
  modo: "vlsm", base: "192.168.0.0/22", crecimiento: 30, partes: 4, calc: "192.168.10.77/26",
  filas: [
    { nombre: "WiFi invitados", hosts: 100, vlan: 50, dhcp: true },
    { nombre: "Ventas", hosts: 50, vlan: 10, dhcp: true },
    { nombre: "Informática", hosts: 20, vlan: 20, dhcp: true },
    { nombre: "RRHH", hosts: 10, vlan: 30, dhcp: true },
    { nombre: "Dirección", hosts: 6, vlan: 40, dhcp: true },
    { nombre: "Servidores", hosts: 8, vlan: 99, dhcp: false }
  ]
};
const asegurarV = () => { if (!S.vlsm) S.vlsm = structuredClone(VLSM_EJEMPLO); };
asegurarV();
if (!S._v3){ if (!S.modulos.includes("subredes")) S.modulos.unshift("subredes"); S._v3 = true; guardar(); }
const UIV = { tab: 0 };
const COLORES = ["#3b6fd8", "#d9822b", "#2f9e5b", "#9b59b6", "#c0392b", "#16a2a2", "#b8a12a", "#6b7a8a"];

function parseCIDR(txt){
  const t = String(txt || "").trim();
  let ip, p;
  const m = t.match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/\s*(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))?$/);
  if (!m) return null;
  ip = ipToInt(m[1]); if (ip === null) return null;
  if (m[2] !== undefined) p = +m[2];
  else if (m[3]){ const mk = ipToInt(m[3]); if (mk === null) return null; const b = mk.toString(2).padStart(32, "0"); if (!/^1*0*$/.test(b)) return { ip, p: null, malaMascara: true }; p = b.indexOf("0") === -1 ? 32 : b.indexOf("0"); }
  else return { ip, p: null };
  if (p < 0 || p > 32) return null;
  return { ip, p };
}
function infoRed(ip, p){
  const mask = maskInt(p), net = (ip & mask) >>> 0, size = 2 ** (32 - p), bc = net + size - 1;
  const util = p >= 31 ? size : size - 2;
  return { net, bc, size, mask, p, util, primero: p >= 31 ? net : net + 1, ultimo: p >= 31 ? bc : bc - 1, wild: (~mask) >>> 0 };
}
function tipoIP(ip){
  const o = intToIp(ip).split(".").map(Number);
  if (o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168)) return ["Privada (RFC 1918)", "ok"];
  if (o[0] === 127) return ["Loopback (el propio equipo)", "warn"];
  if (o[0] === 169 && o[1] === 254) return ["APIPA: el equipo no consiguió IP por DHCP", "err"];
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return ["CGNAT (la usa tu operador)", "warn"];
  if (o[0] >= 224 && o[0] <= 239) return ["Multicast", "warn"];
  if (o[0] >= 240) return ["Reservada", "err"];
  if (o[0] === 0) return ["No válida como host", "err"];
  return ["Pública (de Internet)", "warn"];
}
const claseIP = ip => { const a = ip >>> 24; return a < 128 ? "A" : a < 192 ? "B" : a < 224 ? "C" : a < 240 ? "D" : "E"; };
const prefijoPara = n => { for (let p = 30; p >= 1; p--) if (2 ** (32 - p) - 2 >= n) return p; return null; };

/* Reparto recomendado dentro de una subred */
function planInterno(r, dhcp){
  const usable = r.util;
  const gw = r.primero;
  if (!dhcp) return { gw, fijas: [gw + 1, r.ultimo], pool: null, reserva: null };
  const nFijas = Math.min(Math.max(3, Math.round(usable * 0.1)), Math.max(0, usable - 3), 20);
  const fijas = nFijas > 0 ? [gw + 1, gw + nFijas] : null;
  const nReserva = usable >= 60 ? Math.round(usable * 0.05) : 0;
  const poolIni = gw + nFijas + 1, poolFin = r.ultimo - nReserva;
  return { gw, fijas, pool: poolFin >= poolIni ? [poolIni, poolFin] : null, reserva: nReserva ? [poolFin + 1, r.ultimo] : null };
}

function calcularVLSM(){
  asegurarV();
  const V = S.vlsm, b = parseCIDR(V.base), err = [], avisos = [];
  if (!b || b.p === null) return { err: ["Escribe la red base con su prefijo, por ejemplo 192.168.0.0/22."] };
  const base = infoRed(b.ip, b.p);
  if (b.ip !== base.net) avisos.push(`${V.base} no es una dirección de red: se usa ${intToIp(base.net)}/${b.p}.`);
  if (tipoIP(base.net)[1] !== "ok") avisos.push("La red base no es privada. En una LAN usa 10.0.0.0/8, 172.16.0.0/12 o 192.168.0.0/16.");
  const g = Math.max(0, +V.crecimiento || 0) / 100;
  const filas = V.filas.map((f, i) => {
    const hosts = Math.max(0, parseInt(f.hosts, 10) || 0);
    const conCrec = Math.ceil(hosts * (1 + g));
    const necesita = conCrec + 1;
    const p = prefijoPara(necesita);
    return { ...f, i, hosts, conCrec, necesita, p, size: p ? 2 ** (32 - p) : Infinity, color: COLORES[i % COLORES.length] };
  });
  let cursor = base.net;
  const fin = base.bc;
  [...filas].sort((a, b) => b.size - a.size || a.i - b.i).forEach(f => {
    if (!f.p){ f.noCabe = "Demasiados equipos para IPv4"; return; }
    if (f.p < b.p || cursor + f.size - 1 > fin){ f.noCabe = "No cabe en la red base"; return; }
    f.r = infoRed(cursor, f.p);
    f.plan = planInterno(f.r, f.dhcp);
    cursor += f.size;
  });
  const usado = cursor - base.net;
  const total = filas.reduce((s, f) => s + (isFinite(f.size) ? f.size : 0), 0);
  const recP = prefijoPara(total - 2) || 8;
  let recomendada;
  if (recP >= 16) recomendada = `192.168.${recP >= 24 ? 10 : 0}.0/${recP}`;
  else if (recP >= 12) recomendada = `172.16.0.0/${recP}`;
  else recomendada = `10.0.0.0/${Math.max(8, recP)}`;
  if (filas.some(f => f.noCabe)) err.push(`No caben todas las subredes: necesitas ${total.toLocaleString("es-ES")} direcciones y la red base tiene ${base.size.toLocaleString("es-ES")}. Te recomiendo ${recomendada}.`);
  const vlans = filas.map(f => +f.vlan).filter(Boolean);
  if (new Set(vlans).size !== vlans.length) avisos.push("Hay VLAN repetidas: cada subred necesita su propio número de VLAN.");
  if (vlans.some(v => v < 2 || v > 4094)) avisos.push("Los números de VLAN van del 2 al 4094 (la 1 es la nativa por defecto).");
  return { base, bp: b.p, filas, usado, total, recomendada, err, avisos, g };
}

/* Salidas de texto */
const ipR = (a, b) => a === undefined || a === null ? "—" : (a === b ? intToIp(a) : `${intToIp(a)} – ${intToIp(b)}`);
function tablaTexto(c){
  const cab = ["Subred", "VLAN", "Equipos", "Red", "Máscara", "Puerta enlace", "IP fijas", "DHCP", "Broadcast"];
  const filas = c.filas.filter(f => f.r).map(f => [f.nombre, String(f.vlan || ""), `${f.hosts}${c.g ? ` (+${f.conCrec - f.hosts})` : ""}`, `${intToIp(f.r.net)}/${f.p}`, intToIp(f.r.mask), intToIp(f.plan.gw),
    f.plan.fijas ? ipR(f.plan.fijas[0], f.plan.fijas[1]) : "—", f.plan.pool ? ipR(f.plan.pool[0], f.plan.pool[1]) : "sin DHCP", intToIp(f.r.bc)]);
  const w = cab.map((h, i) => Math.max(h.length, ...filas.map(r => r[i].length)));
  const linea = r => r.map((x, i) => x.padEnd(w[i])).join("  ");
  return L(`# Plan de direccionamiento · red base ${intToIp(c.base.net)}/${c.bp} · crecimiento previsto ${Math.round(c.g * 100)} %`,
    `# Generado con ASIRkit`, "", linea(cab), w.map(n => "-".repeat(n)).join("  "), ...filas.map(linea),
    "", `# Usadas ${c.usado.toLocaleString("es-ES")} de ${c.base.size.toLocaleString("es-ES")} direcciones (${Math.round(c.usado / c.base.size * 100)} %)`);
}
function dhcpServidor(c){
  const enAlguna = c.filas.find(f => f.r && ipToInt(S.srvIp) > f.r.net && ipToInt(S.srvIp) < f.r.bc);
  return { ip: enAlguna ? S.srvIp : null, f: enAlguna };
}
function ciscoTexto(c){
  const dh = dhcpServidor(c), fs = c.filas.filter(f => f.r);
  return L("! ==================================================",
    "! Router-on-a-stick: un router y un switch con una VLAN por subred",
    "! Generado con ASIRkit · pégalo en modo configuración (configure terminal)",
    "! ==================================================",
    "!",
    "! ---------- SWITCH ----------",
    "! Crea las VLAN",
    ...fs.flatMap(f => [`vlan ${f.vlan}`, ` name ${ascii(f.nombre).replace(/[^A-Za-z0-9_-]+/g, "_")}`]),
    "!",
    "! Puerto que va al router: troncal (lleva todas las VLAN etiquetadas)",
    "interface GigabitEthernet0/1",
    " switchport mode trunk",
    "!",
    "! Ejemplo de puerto de acceso para un equipo (cambia el número de puerto y la VLAN)",
    "interface FastEthernet0/1",
    " switchport mode access",
    ` switchport access vlan ${fs[0]?.vlan || 10}`,
    "!",
    "! ---------- ROUTER ----------",
    "interface GigabitEthernet0/0",
    " no shutdown",
    "!",
    ...fs.flatMap(f => [
      `! ${f.nombre}: ${intToIp(f.r.net)}/${f.p}`,
      `interface GigabitEthernet0/0.${f.vlan}`,
      ` description ${ascii(f.nombre)}`,
      ` encapsulation dot1Q ${f.vlan}`,
      ` ip address ${intToIp(f.plan.gw)} ${intToIp(f.r.mask)}`,
      ...(f.dhcp && dh.f !== f ? [dh.ip ? ` ip helper-address ${dh.ip}` : " ! ip helper-address IP_DEL_SERVIDOR_DHCP"] : []),
      "!"]),
    "! ip helper-address reenvía las peticiones DHCP (que son broadcast) al servidor DHCP de otra subred.",
    dh.ip ? `! El servidor DHCP (${S.srvIp}) está en la subred ${dh.f.nombre}.` : "! Pon la IP del servidor DHCP en las líneas ip helper-address.",
    "end",
    "write memory"
  );
}
function dhcpWinMulti(c){
  const fs = c.filas.filter(f => f.r && f.dhcp && f.plan.pool);
  return L(cabeceraPS("Ámbitos DHCP para todas las subredes", "subredes-dhcp.ps1"),
    "Install-WindowsFeature DHCP -IncludeManagementTools",
    "",
    "# DNS y dominio para todos los ámbitos (opciones de servidor)",
    `Set-DhcpServerv4OptionValue -DnsServer ${dnsClientes().join(",")} -DnsDomain "${S.dominio}" -Force`,
    "",
    "# Un ámbito por subred, cada uno con su puerta de enlace (opción 003)",
    "$ambitos = @(",
    fs.map(f => `    @{ Nombre = "${limpio(f.nombre)}"; Red = "${intToIp(f.r.net)}"; Inicio = "${intToIp(f.plan.pool[0])}"; Fin = "${intToIp(f.plan.pool[1])}"; Mascara = "${intToIp(f.r.mask)}"; Puerta = "${intToIp(f.plan.gw)}" }`).join("\n"),
    ")",
    "foreach ($a in $ambitos) {",
    "    if (-not (Get-DhcpServerv4Scope -ScopeId $a.Red -ErrorAction SilentlyContinue)) {",
    '        Add-DhcpServerv4Scope -Name $a.Nombre -StartRange $a.Inicio -EndRange $a.Fin -SubnetMask $a.Mascara -State Active',
    "    }",
    "    Set-DhcpServerv4OptionValue -ScopeId $a.Red -Router $a.Puerta",
    '    Write-Host "Ámbito $($a.Nombre): $($a.Inicio) - $($a.Fin)" -ForegroundColor Green',
    "}",
    "",
    "# Las subredes que no son la del servidor necesitan un agente de retransmisión DHCP",
    "# (ip helper-address en el router, ver pestaña Cisco).",
    "Get-DhcpServerv4Scope | Format-Table Name, ScopeId, StartRange, EndRange, State"
  );
}
function keaMulti(c){
  const fs = c.filas.filter(f => f.r && f.dhcp && f.plan.pool);
  const conf = { Dhcp4: {
    "interfaces-config": { interfaces: [limpio(S.ifLin)] },
    "lease-database": { type: "memfile", "lfc-interval": 3600 },
    "valid-lifetime": (+S.lease || 8) * 3600,
    "option-data": [{ name: "domain-name-servers", data: dnsClientes().join(", ") }, { name: "domain-name", data: S.dominio }],
    subnet4: fs.map((f, k) => ({ id: k + 1, subnet: `${intToIp(f.r.net)}/${f.p}`, pools: [{ pool: `${intToIp(f.plan.pool[0])} - ${intToIp(f.plan.pool[1])}` }], "option-data": [{ name: "routers", data: intToIp(f.plan.gw) }] }))
  }};
  return L(cabeceraSH("Kea DHCP con todas las subredes", "subredes-dhcp.sh"),
    "DEBIAN_FRONTEND=noninteractive apt-get install -y kea-dhcp4-server",
    "[ -f /etc/kea/kea-dhcp4.conf.orig ] || cp /etc/kea/kea-dhcp4.conf /etc/kea/kea-dhcp4.conf.orig",
    "",
    "# Kea elige la subred por la IP del agente de retransmisión (ip helper-address del router)",
    "cat > /etc/kea/kea-dhcp4.conf <<'EOF'",
    JSON.stringify(conf, null, 2),
    "EOF",
    "kea-dhcp4 -t /etc/kea/kea-dhcp4.conf",
    "systemctl restart kea-dhcp4-server"
  );
}

/* Interfaz */
function renderVLSM(){
  asegurarV();
  const V = S.vlsm, box = document.getElementById("vlsm");
  const modos = [["vlsm", "Por necesidades (VLSM)"], ["iguales", "Partes iguales"], ["calc", "Calcular una IP"]];
  let form = "";
  if (V.modo === "vlsm") form = `
      <div class="fields">
        <label class="f" for="v-base"><span>Red base</span><input id="v-base" data-v="base" value="${esc(V.base)}" spellcheck="false"><small>La red que vas a repartir, con su prefijo</small></label>
        <label class="f" for="v-crec"><span>Crecimiento previsto (%)</span><input id="v-crec" data-v="crecimiento" value="${esc(V.crecimiento)}" inputmode="numeric"><small>Margen para equipos futuros</small></label>
      </div>
      <h3>Subredes que necesitas</h3>
      <div class="rows">
        <div class="row vrow head"><span>Nombre</span><span>Equipos</span><span>VLAN</span><span title="Reparto por DHCP">DHCP</span><span></span></div>
        ${V.filas.map((f, i) => `<div class="row vrow">
          <input aria-label="Nombre de la subred ${i+1}" data-vl="${i}" data-f="nombre" value="${esc(f.nombre)}" spellcheck="false">
          <input aria-label="Equipos de ${esc(f.nombre)}" data-vl="${i}" data-f="hosts" value="${esc(f.hosts)}" inputmode="numeric">
          <input aria-label="VLAN de ${esc(f.nombre)}" data-vl="${i}" data-f="vlan" value="${esc(f.vlan)}" inputmode="numeric">
          <input type="checkbox" aria-label="DHCP en ${esc(f.nombre)}" data-vl="${i}" data-f="dhcp" ${f.dhcp ? "checked" : ""}>
          <button class="del" type="button" data-vdel="${i}" aria-label="Quitar ${esc(f.nombre)}">×</button></div>`).join("")}
      </div>
      <button class="btn small" type="button" data-vadd="1" style="margin-top:8px">+ Añadir subred</button>
      <div class="note">Cuenta en «Equipos» todo lo que lleva IP: PCs, portátiles, impresoras, móviles, puntos de acceso… La puerta de enlace se suma sola. Desmarca DHCP en las subredes de servidores o de gestión, que van con IP fija.</div>`;
  else if (V.modo === "iguales") form = `
      <div class="fields">
        <label class="f" for="v-base2"><span>Red que quieres dividir</span><input id="v-base2" data-v="base" value="${esc(V.base)}" spellcheck="false"></label>
        <label class="f" for="v-partes"><span>Número de subredes</span><input id="v-partes" data-v="partes" value="${esc(V.partes)}" inputmode="numeric"><small>Se redondea a la potencia de 2 siguiente</small></label>
      </div>
      <div class="note">Cada bit que se toma prestado de la parte de host duplica el número de subredes y divide a la mitad su tamaño.</div>`;
  else form = `
      <div class="fields">
        <label class="f wide" for="v-calc"><span>IP con máscara</span><input id="v-calc" data-v="calc" value="${esc(V.calc)}" spellcheck="false"><small>Vale 192.168.10.77/26 o 192.168.10.77 255.255.255.192</small></label>
      </div>`;
  box.innerHTML = `
    <div class="seg vmodos" role="group" aria-label="Modo">${modos.map(([k, t]) => `<button type="button" data-vmodo="${k}" aria-pressed="${V.modo === k}">${t}</button>`).join("")}</div>
    <div class="vgrid"><div class="panel vform">${form}</div><div id="vres"></div></div>`;
  pintarVLSM();
}
function pintarVLSM(){
  asegurarV();
  const V = S.vlsm, box = document.getElementById("vres"); if (!box) return;
  if (V.modo === "calc") return void (box.innerHTML = pintarCalc());
  if (V.modo === "iguales") return void (box.innerHTML = pintarIguales());
  const c = calcularVLSM();
  if (c.err && !c.filas){ box.innerHTML = `<div class="panel"><ul class="issues">${c.err.map(e => `<li><span class="pill err">Error</span><span>${esc(e)}</span></li>`).join("")}</ul></div>`; return; }
  const pct = n => ((n - c.base.net) / c.base.size * 100);
  const barra = c.filas.filter(f => f.r).map(f => `<i style="left:${pct(f.r.net).toFixed(3)}%;width:${(f.size / c.base.size * 100).toFixed(3)}%;background:${f.color}" title="${esc(f.nombre)} · ${intToIp(f.r.net)}/${f.p}"></i>`).join("");
  const salidas = [
    { nombre: "Tabla", os: "chk", code: tablaTexto(c), como: "Cópiala en la memoria de la práctica o en la documentación de la red." },
    { nombre: "Cisco · VLAN y router", os: "lin", code: ciscoTexto(c), como: "Para Packet Tracer o equipos Cisco reales: pega cada parte en el switch y en el router, en modo <code>configure terminal</code>." },
    { nombre: "DHCP Windows", os: "win", code: dhcpWinMulti(c), como: "En el servidor DHCP de Windows, como administrador." },
    { nombre: "DHCP Kea", os: "lin", code: keaMulti(c), como: "En el servidor DHCP Ubuntu: <code>sudo bash subredes-dhcp.sh</code>" }
  ];
  const t = Math.min(UIV.tab, salidas.length - 1), s = salidas[t];
  const mensajes = [...c.err.map(e => ["err", e]), ...c.avisos.map(e => ["warn", e])];
  box.innerHTML = `
    <div class="panel">
      <div class="revhead"><h3 style="margin:0">Resultado</h3>
        <span class="chip">${intToIp(c.base.net)}/${c.bp}</span>
        <span class="chip ${c.err.length ? "state-err" : "state-ok"}">● ${c.usado.toLocaleString("es-ES")} de ${c.base.size.toLocaleString("es-ES")} direcciones (${Math.round(c.usado / c.base.size * 100)} %)</span>
        ${c.err.length ? "" : `<span class="chip">Libres: ${(c.base.size - c.usado).toLocaleString("es-ES")}</span>`}</div>
      ${mensajes.length ? `<ul class="issues" style="margin-top:12px">${mensajes.map(([n, e]) => `<li><span class="pill ${n}">${etiqueta(n)}</span><span>${esc(e)}${n === "err" && c.recomendada ? ` <button type="button" class="btn small" data-vrec="${esc(c.recomendada)}">Usar ${esc(c.recomendada)}</button>` : ""}</span></li>`).join("")}</ul>` : ""}
      <div class="bar vbar">${barra}</div>
      <div class="legend">${c.filas.filter(f => f.r).map(f => `<span><i style="background:${f.color}"></i>${esc(f.nombre)}</span>`).join("")}<span><i style="background:var(--c-free)"></i>libre</span></div>
      <div class="vtable-wrap"><table class="cheat vtable">
        <thead><tr><th>Subred</th><th>Red</th><th>Puerta de enlace</th><th>IP fijas</th><th>DHCP</th><th>Broadcast</th><th></th></tr></thead>
        <tbody>${c.filas.map(f => f.r ? `<tr>
          <td class="task"><b><i class="sw" style="background:${f.color}"></i>${esc(f.nombre)}</b><span>VLAN ${esc(f.vlan)} · ${f.hosts} equipos${c.g ? ` + ${f.conCrec - f.hosts} de margen` : ""} · caben ${f.r.util}</span></td>
          <td><code>${intToIp(f.r.net)}/${f.p}</code><br><small>${intToIp(f.r.mask)}</small></td>
          <td><code>${intToIp(f.plan.gw)}</code></td>
          <td>${f.plan.fijas ? `<code>${ipR(f.plan.fijas[0], f.plan.fijas[1])}</code><br><small>${f.dhcp ? "servidores, impresoras, AP" : "todo con IP fija"}</small>` : "—"}</td>
          <td>${f.plan.pool ? `<code>${ipR(f.plan.pool[0], f.plan.pool[1])}</code><br><small>${f.plan.pool[1] - f.plan.pool[0] + 1} IPs${f.plan.reserva ? ` · reserva ${ipR(f.plan.reserva[0], f.plan.reserva[1])}` : ""}</small>` : "<small>sin DHCP</small>"}</td>
          <td><code>${intToIp(f.r.bc)}</code></td>
          <td><button type="button" class="btn small" data-usar="${f.i}" title="Copia esta subred al plan de red del proyecto">Usar</button></td>
        </tr>` : `<tr><td class="task"><b>${esc(f.nombre)}</b><span>${f.hosts} equipos</span></td><td colspan="6"><span class="pill err">${esc(f.noCabe)}</span></td></tr>`).join("")}</tbody>
      </table></div>
      <p class="hint">Las subredes se colocan de la más grande a la más pequeña: así quedan alineadas y no se desperdician direcciones. Puerta de enlace en la primera IP, un 10 % para IP fijas, y en las redes grandes un 5 % al final de reserva.</p>
    </div>
    <div class="out" style="margin-top:16px">
      <div class="tabs" role="tablist">${salidas.map((x, i) => `<button class="tab" role="tab" type="button" aria-selected="${i === t}" data-vtab="${i}"><span class="os ${x.os}">${{ win: "PS", lin: i === 1 ? "IOS" : "SH", chk: "TXT" }[x.os]}</span>${esc(x.nombre)}</button>`).join("")}</div>
      <div class="toolbar"><div class="fname">${esc(s.nombre)}</div><button class="btn primary small" type="button" data-copytxt="${esc(s.code)}">Copiar</button></div>
      <pre class="code">${resaltar(s.code)}</pre>
      <div class="howto">${s.como}</div>
    </div>`;
}
function pintarIguales(){
  const V = S.vlsm, b = parseCIDR(V.base);
  if (!b || b.p === null) return `<div class="panel"><p>Escribe la red con su prefijo, por ejemplo 192.168.0.0/24.</p></div>`;
  const n = Math.max(1, parseInt(V.partes, 10) || 1), bits = Math.ceil(Math.log2(n)), np = b.p + bits;
  if (np > 30) return `<div class="panel"><ul class="issues"><li><span class="pill err">Error</span><span>Una /${b.p} no se puede dividir en ${n} subredes útiles: cada una quedaría con menos de 2 equipos.</span></li></ul></div>`;
  const base = infoRed(b.ip, b.p), tam = 2 ** (32 - np), total = 2 ** bits;
  const filas = []; for (let k = 0; k < Math.min(total, 256); k++){ const r = infoRed(base.net + k * tam, np); filas.push(r); }
  return `<div class="panel">
    <div class="revhead"><h3 style="margin:0">${total} subredes /${np}</h3><span class="chip">Máscara ${intToIp(maskInt(np))}</span><span class="chip">${tam - 2} equipos en cada una</span><span class="chip">${bits} bit${bits !== 1 ? "s" : ""} prestado${bits !== 1 ? "s" : ""}</span></div>
    ${total !== n ? `<p class="hint">Has pedido ${n}, pero las subredes van en potencias de 2: salen ${total}. Las que sobran quedan libres para crecer.</p>` : ""}
    <div class="vtable-wrap"><table class="cheat vtable"><thead><tr><th>#</th><th>Red</th><th>Primera IP</th><th>Última IP</th><th>Broadcast</th><th></th></tr></thead>
    <tbody>${filas.map((r, k) => `<tr><td>${k + 1}</td><td><code>${intToIp(r.net)}/${np}</code></td><td><code>${intToIp(r.primero)}</code></td><td><code>${intToIp(r.ultimo)}</code></td><td><code>${intToIp(r.bc)}</code></td>
      <td><button type="button" class="btn small" data-usarred="${intToIp(r.net)}/${np}">Usar en el plan</button></td></tr>`).join("")}</tbody></table></div>
    ${total > 256 ? `<p class="hint">Se muestran las 256 primeras.</p>` : ""}
  </div>`;
}
function pintarCalc(){
  const c = parseCIDR(S.vlsm.calc);
  if (!c) return `<div class="panel"><p>Escribe una IP con su máscara: 192.168.10.77/26 o 192.168.10.77 255.255.255.192.</p></div>`;
  if (c.malaMascara) return `<div class="panel"><ul class="issues"><li><span class="pill err">Error</span><span>Esa máscara no es válida: en binario tiene que ser todo unos seguidos de todo ceros (255.255.255.192 sí, 255.255.0.255 no).</span></li></ul></div>`;
  if (c.p === null) return `<div class="panel"><p>Falta la máscara. Añade /24 o 255.255.255.0 detrás de la IP.</p></div>`;
  const r = infoRed(c.ip, c.p), [tipo, nivel] = tipoIP(c.ip);
  const bin = n => n.toString(2).padStart(32, "0").replace(/(.{8})(?!$)/g, "$1.");
  const marca = (n) => { const b = bin(n); let cnt = 0; return [...b].map(ch => { if (ch === ".") return "."; const cls = cnt++ < c.p ? "bn" : "bh"; return `<span class="${cls}">${ch}</span>`; }).join(""); };
  const esRed = c.ip === r.net, esBc = c.ip === r.bc && c.p < 31;
  return `<div class="panel">
    <div class="revhead"><h3 style="margin:0">${intToIp(c.ip)}/${c.p}</h3><span class="chip state-${nivel}">● ${esc(tipo)}</span><span class="chip">Clase ${claseIP(c.ip)}</span>
      ${esRed ? '<span class="chip state-warn">● Es la dirección de red: no se puede poner a un equipo</span>' : esBc ? '<span class="chip state-warn">● Es el broadcast: no se puede poner a un equipo</span>' : '<span class="chip state-ok">● Válida para un equipo</span>'}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><span>Red</span><b>${intToIp(r.net)}</b></div>
      <div class="stat"><span>Máscara</span><b>${intToIp(r.mask)}</b></div>
      <div class="stat"><span>Wildcard</span><b>${intToIp(r.wild)}</b></div>
      <div class="stat"><span>Broadcast</span><b>${intToIp(r.bc)}</b></div>
      <div class="stat"><span>Primera – última</span><b>${intToIp(r.primero)} – ${intToIp(r.ultimo).split(".").pop()}</b></div>
      <div class="stat"><span>Equipos</span><b>${r.util.toLocaleString("es-ES")}</b></div>
    </div>
    <h3>En binario</h3>
    <div class="binario">
      <div><span>IP</span><code>${marca(c.ip)}</code></div>
      <div><span>Máscara</span><code>${marca(r.mask)}</code></div>
      <div><span>Red</span><code>${marca(r.net)}</code></div>
    </div>
    <div class="legend"><span><i class="bnl"></i>parte de red (${c.p} bits)</span><span><i class="bhl"></i>parte de host (${32 - c.p} bits)</span></div>
    <p class="hint">La red sale de hacer un AND bit a bit entre la IP y la máscara. El wildcard (máscara invertida) es lo que piden las ACL de Cisco y OSPF.</p>
    <button type="button" class="btn small" data-usarred="${intToIp(r.net)}/${c.p}">Usar esta red en el plan</button>
  </div>`;
}
function usarEnPlan(net, p, gw, srv, pool){
  S.red = intToIp(net); S.prefijo = p; S.gw = intToIp(gw); S.srvIp = intToIp(srv);
  if (pool){ S.dhcpIni = intToIp(pool[0]); S.dhcpFin = intToIp(pool[1]); }
  guardar(); aviso(`Plan de red actualizado: ${S.red}/${p}`); location.hash = "red";
}
main.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.v !== undefined){ S.vlsm[el.dataset.v] = el.value; guardar(); pintarVLSM(); }
  else if (el.dataset.vl !== undefined){ const f = S.vlsm.filas[+el.dataset.vl]; f[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value; guardar(); pintarVLSM(); }
});
main.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.vmodo){ S.vlsm.modo = t.dataset.vmodo; guardar(); renderVLSM(); }
  else if (t.dataset.vtab !== undefined){ UIV.tab = +t.dataset.vtab; pintarVLSM(); }
  else if (t.dataset.vadd){ const v = S.vlsm.filas.reduce((m, f) => Math.max(m, +f.vlan || 0), 0); S.vlsm.filas.push({ nombre: "Nueva subred", hosts: 10, vlan: v + 10, dhcp: true }); guardar(); renderVLSM(); }
  else if (t.dataset.vdel !== undefined){ S.vlsm.filas.splice(+t.dataset.vdel, 1); guardar(); renderVLSM(); }
  else if (t.dataset.vrec){ S.vlsm.base = t.dataset.vrec; guardar(); renderVLSM(); aviso(`Red base cambiada a ${t.dataset.vrec}`); }
  else if (t.dataset.usar !== undefined){
    const f = calcularVLSM().filas.find(x => x.i === +t.dataset.usar); if (!f || !f.r) return;
    const srv = f.plan.fijas ? f.plan.fijas[0] + Math.min(8, f.plan.fijas[1] - f.plan.fijas[0]) : f.plan.gw + 1;
    usarEnPlan(f.r.net, f.p, f.plan.gw, srv, f.plan.pool || planInterno(f.r, true).pool);
  }
  else if (t.dataset.usarred){
    const c = parseCIDR(t.dataset.usarred), r = infoRed(c.ip, c.p), pl = planInterno(r, true);
    usarEnPlan(r.net, c.p, pl.gw, pl.fijas ? pl.fijas[0] + Math.min(8, pl.fijas[1] - pl.fijas[0]) : pl.gw + 1, pl.pool);
  }
});
