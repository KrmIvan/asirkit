/* ============================================================
   Registro de módulos: qué scripts genera cada uno
   ============================================================ */
const comoWin = fx => `Pégalo en PowerShell como administrador, o guárdalo y ejecuta <code>powershell -ExecutionPolicy Bypass -File .\\${fx}</code>`;
const comoLin = fx => `Guárdalo y ejecuta <code>sudo bash ${fx}</code>`;
const W = (id, nombre, base, gen, como, suf = "") => { const fx = fich(id, base, "ps1", suf); return { os: "win", nombre, fichero: fx, code: gen(fx), como: como || comoWin(fx) }; };
const X = (id, nombre, base, gen, como, suf = "") => { const fx = fich(id, base, "sh", suf); return { os: "lin", nombre, fichero: fx, code: gen(fx), como: como || comoLin(fx) }; };
const conChecks = (id, d, lista) => [...lista, ...comprobarModulo(id, d, lista.filter(s => s.os === "win").map(s => s.fichero), lista.filter(s => s.os === "lin").map(s => s.fichero))];

const MODS = {
  ip: { salidas: d => conChecks("ip", d, [
    W("ip", "Windows Server", "ip-estatica", f => ipWindows(d, f)),
    X("ip", "Ubuntu Server", "ip-estatica", f => ipLinux(d, f))]) },
  ad: { salidas: d => conChecks("ad", d, [
    W("ad", "Crear dominio", "crear-dominio", f => adForest(f), "En el servidor, como administrador. Reinicia solo al terminar.", "a"),
    W("ad", "Usuarios CSV", "usuarios", f => adUsuarios(f), "En el servidor, después del reinicio, con la cuenta de administrador del dominio.", "b"),
    W("ad", "Cliente Windows", "unir-cliente", f => adClienteWin(f), "En cada equipo cliente con Windows 10/11 Pro, en PowerShell como administrador.", "c"),
    X("ad", "Cliente Ubuntu", "unir-ubuntu", f => adClienteLinux(f), null, "d"),
    ...(PRO() ? [W("ad", `2.º DC (${S.srv2Nombre})`, "segundo-dc", f => adSegundoDC(f), `En ${S.srv2Nombre}, como administrador local, con su IP fija y el DNS apuntando a ${S.srvIp}.`, "e")] : [])]) },
  dns: { salidas: d => conChecks("dns", d, [
    W("dns", "Windows Server", "dns", f => dnsWindows(d, f), has("ad") ? "Con Active Directory, ejecútalo después de crear el dominio: las zonas quedarán integradas en AD." : null),
    X("dns", "Ubuntu · BIND9", "dns", f => dnsLinux(d, f)),
    ...(PRO() && !has("ad") ? [
      W("dns", `Secundario Win (${S.srv2Nombre})`, "dns-secundario", f => dnsWindowsSecundario(d, f), `En ${S.srv2Nombre}, después de configurar el principal.`),
      X("dns", `Secundario Ubuntu (${host2()})`, "dns-secundario", f => dnsLinuxSecundario(d, f), `En ${host2()}: <code>sudo bash ${fich("dns", "dns-secundario", "sh")}</code>`)] : [])]) },
  dhcp: { salidas: d => conChecks("dhcp", d, [
    W("dhcp", "Windows Server", "dhcp", f => dhcpWindows(d, f), has("ad") ? "Ejecútalo después de crear el dominio, con una cuenta de administrador del dominio." : null),
    X("dhcp", S.linuxDhcp === "kea" ? "Ubuntu · Kea" : "Ubuntu · ISC", "dhcp", f => S.linuxDhcp === "kea" ? dhcpLinuxKea(d, f) : dhcpLinuxIsc(d, f))]) },
  gpo: { salidas: d => conChecks("gpo", d, [W("gpo", "Windows Server", "gpo", f => gpoWindows(f), "En el controlador de dominio, como administrador del dominio.")]) },
  ficheros: { salidas: d => conChecks("ficheros", d, [
    W("ficheros", "Windows · SMB", "ficheros", f => ficherosWindows(f)),
    X("ficheros", "Ubuntu · Samba", "ficheros", f => ficherosLinux(f))]) },
  web: { salidas: d => conChecks("web", d, [
    W("web", "Windows · IIS", "web", f => webWindows(f)),
    X("web", "Ubuntu · Apache", "web", f => webLinux(f))]) },
  ftp: { salidas: d => conChecks("ftp", d, [
    W("ftp", "Windows · IIS FTP", "ftp", f => ftpWindows(f)),
    X("ftp", "Ubuntu · vsftpd", "ftp", f => ftpLinux(f))]) },
  ssh: { salidas: d => conChecks("ssh", d, [
    W("ssh", "Windows · OpenSSH", "ssh", f => sshWindows(f)),
    X("ssh", "Ubuntu · OpenSSH", "ssh", f => sshLinux(f), PRO() ? `Ejecútalo con sudo desde tu usuario (no como root) y con tu clave ya copiada: <code>sudo bash ${fich("ssh", "ssh", "sh")}</code>` : null)]) },
  firewall: { salidas: d => conChecks("firewall", d, [
    W("firewall", "Windows Defender", "cortafuegos", f => firewallWindows(f)),
    X("firewall", "Ubuntu · UFW", "cortafuegos", f => firewallLinux(f), `Ejecútalo después de instalar todos los servicios: <code>sudo bash ${fich("firewall", "cortafuegos", "sh")}</code>`)]) },
  backup: { salidas: d => conChecks("backup", d, [
    W("backup", "Windows Server Backup", "copias", f => backupWindows(f)),
    X("backup", PRO() ? "Ubuntu · rsync" : "Ubuntu · tar + cron", "copias", f => backupLinux(f))]) },
  verificar: { salidas: d => [
    W("verificar", "Windows Server", "verificar", f => verifWindows(d, f), "Ejecútalo al terminar, o cuando algo deje de funcionar. Devuelve código 1 si hay fallos."),
    X("verificar", "Ubuntu Server", "verificar", f => verifLinux(d, f), `<code>sudo bash ${fich("verificar", "verificar", "sh")}</code>. Devuelve código 1 si hay fallos.`)] }
};
const LEDES = {
  subredes: "Antes de montar nada: decide cuántas subredes hacen falta y de qué tamaño según los equipos de cada zona, y qué IP va en cada sitio.",
  red: "La base de todo. Lo que pongas aquí lo usan el resto de módulos: si cambias la red o el dominio, todos los scripts se actualizan.",
  ip: "Lo primero en cualquier servidor: IP fija, puerta de enlace, DNS y nombre del equipo.",
  ad: "Crea el dominio, carga los usuarios desde un CSV (con su OU y su grupo por departamento) y une clientes Windows y Ubuntu.",
  dns: "Zona directa (nombre → IP), zona inversa (IP → nombre), registros y reenviadores para salir a Internet.",
  dhcp: "Reparte IPs a los clientes con la puerta de enlace, el DNS y el dominio ya puestos. Las reservas fijan una IP a una MAC.",
  gpo: "Directivas de grupo para controlar los equipos y usuarios del dominio desde el servidor. Solo existe en Windows.",
  ficheros: "Una carpeta compartida por departamento, y que cada uno solo pueda entrar en la suya.",
  web: "Un sitio de intranet con su propio nombre en el DNS.",
  ftp: "Subir y bajar ficheros con un cliente FTP como FileZilla.",
  ssh: "Administrar el servidor desde otro equipo por terminal.",
  firewall: "Se genera a partir de los módulos que has elegido: solo abre los puertos de esos servicios.",
  backup: "Copia automática de lo importante. Una copia que nunca se ha probado a restaurar no es una copia.",
  verificar: "Un script que repasa todo lo que has montado y te dice qué funciona y qué no. Solo incluye los módulos que has elegido.",
  errores: "Cuando algo falla: pega el mensaje de error y te explica qué pasa, o pega tu fichero de configuración para revisar su sintaxis y compararlo con el generado.",
  chuleta: "El mismo trabajo en los dos sistemas. Pulsa un comando para copiarlo.",
  modulos: "Elige el nivel y los módulos que quieres. Solo aparecerán en el menú los que añadas, en el orden en que se montan."
};
const modNombre = id => id === "red" ? "Plan de red" : id === "modulos" ? "Elegir módulos" : (CATALOGO.find(m => m.id === id) || {}).nombre || id;

/* ============================================================
   Formularios
   ============================================================ */
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const campo = (k, label, hint = "", extra = "") =>
  `<label class="f ${extra}" for="f-${k}"><span>${label}</span><input id="f-${k}" data-key="${k}" value="${esc(S[k])}" autocomplete="off" spellcheck="false">${hint ? `<small>${hint}</small>` : ""}</label>`;
const check = (k, label) => `<label class="check" for="f-${k}"><input type="checkbox" id="f-${k}" data-key="${k}" ${S[k] ? "checked" : ""}><span>${label}</span></label>`;
const pro = (titulo, html) => PRO() ? `<div class="profields"><h3><span class="badge-pro">PRO</span>${titulo}</h3>${html}</div>` : "";
const nota = html => `<div class="note">${html}</div>`;
const srv2Campos = () => `<div class="fields">${campo("srv2Nombre", "Segundo servidor")}${campo("srv2Ip", "IP del segundo servidor")}</div>`;

function formulario(id){
  if (id === "red") return `
    <div class="panel">
      <h3>Red</h3>
      <div class="fields">
        ${campo("red", "Dirección de red")}
        <label class="f" for="f-prefijo"><span>Prefijo</span><select id="f-prefijo" data-key="prefijo">
          ${Array.from({length: 23}, (_, i) => i + 8).map(p => `<option value="${p}" ${+S.prefijo === p ? "selected" : ""}>/${p}</option>`).join("")}
        </select></label>
        ${campo("gw", "Puerta de enlace")}
        ${campo("forwarders", "DNS externos", "Reenviadores, separados por comas")}
      </div>
      <h3>Servidor</h3>
      <div class="fields">
        ${campo("srvNombre", "Nombre", "Máximo 15 caracteres")}
        ${campo("srvIp", "IP del servidor")}
        ${campo("ifWin", "Tarjeta en Windows", "Get-NetAdapter")}
        ${campo("ifLin", "Tarjeta en Ubuntu", "ip -br link")}
      </div>
      <h3>Dominio</h3>
      <div class="fields">
        ${campo("dominio", "Nombre DNS")}
        ${campo("netbios", "Nombre NetBIOS", "Corto, en mayúsculas")}
      </div>
      ${pro("Redundancia y administración", `${srv2Campos()}<div class="fields" style="margin-top:10px">${campo("adminNet", "Red de administración", "Solo desde aquí se podrá entrar por SSH o RDP", "wide")}</div>`)}
      <h3>Módulos del proyecto</h3>
      <p style="margin:0 0 8px;font-size:14px">${S.modulos.map(m => esc(modNombre(m))).join(" · ") || "Ninguno"}</p>
      <a class="btn small" href="#modulos">Cambiar módulos</a>
    </div>`;
  if (id === "ip") return `
    <div class="panel">
      <h3>Servidor</h3>
      <div class="fields">
        ${campo("srvNombre", "Nombre del equipo")}
        ${campo("srvIp", "IP fija")}
        ${campo("ifWin", "Tarjeta en Windows", "Get-NetAdapter")}
        ${campo("ifLin", "Tarjeta en Ubuntu", "ip -br link")}
        ${campo("gw", "Puerta de enlace", "", "wide")}
      </div>
      ${nota("La máscara y los DNS salen del plan de red. Como DNS se pone el propio servidor y, de reserva, el primer reenviador.")}
      ${pro("Puesta a punto", "<p style='margin:0;font-size:13.5px'>Se añade zona horaria, hora del ROA por NTP, parches automáticos (Ubuntu), escritorio remoto con NLA y SMBv1 desactivado (Windows).</p>")}
    </div>`;
  if (id === "dhcp") return `
    <div class="panel">
      <h3>Rango dinámico</h3>
      <div class="fields">
        ${campo("dhcpIni", "Primera IP")}
        ${campo("dhcpFin", "Última IP")}
        ${campo("lease", "Concesión (horas)")}
        <div class="f"><span>En Ubuntu usar</span>
          <div class="seg" role="group" aria-label="Servidor DHCP en Ubuntu">
            <button type="button" data-set="linuxDhcp" data-val="kea" aria-pressed="${S.linuxDhcp === "kea"}">Kea</button>
            <button type="button" data-set="linuxDhcp" data-val="isc" aria-pressed="${S.linuxDhcp === "isc"}">ISC (clase)</button>
          </div>
        </div>
      </div>
      <h3>Reservas</h3>
      <div class="rows">
        ${S.reservas.map((r, i) => `<div class="row res">
          <input class="rn" aria-label="Nombre de la reserva ${i+1}" placeholder="Nombre" data-list="reservas" data-i="${i}" data-f="nombre" value="${esc(r.nombre)}" spellcheck="false">
          <button class="del" type="button" data-del="reservas" data-i="${i}" aria-label="Quitar reserva ${i+1}">×</button>
          <input aria-label="MAC de la reserva ${i+1}" placeholder="MAC" data-list="reservas" data-i="${i}" data-f="mac" value="${esc(r.mac)}" spellcheck="false">
          <input aria-label="IP de la reserva ${i+1}" placeholder="IP" data-list="reservas" data-i="${i}" data-f="ip" value="${esc(r.ip)}" spellcheck="false"></div>`).join("") || `<p class="lede" style="margin:0">Sin reservas.</p>`}
      </div>
      <button class="btn small" type="button" data-add="reservas" style="margin-top:8px">+ Añadir reserva</button>
      ${nota(`Los clientes recibirán como DNS ${esc(dnsClientes().join(", "))}, la puerta de enlace ${esc(S.gw)} y el dominio ${esc(S.dominio)}.`)}
      ${pro("Alta disponibilidad", `${check("dhcpFailover", "Conmutación por error con un segundo servidor DHCP")}${S.dhcpFailover ? srv2Campos() : ""}`)}
    </div>`;
  if (id === "dns") return `
    <div class="panel">
      <h3>Zona</h3>
      <div class="fields">${campo("dominio", "Zona directa")}${campo("forwarders", "Reenviadores")}</div>
      <h3>Registros</h3>
      <div class="rows">
        <div class="row rec head"><span>Tipo</span><span>Nombre</span><span>Valor</span><span></span></div>
        <div class="row rec" style="opacity:.7"><input value="A" disabled aria-label="Tipo"><input value="${esc(host())}" disabled aria-label="Nombre"><input value="${esc(S.srvIp)}" disabled aria-label="Valor"><span></span></div>
        ${S.registros.map((r, i) => `<div class="row rec">
          <select aria-label="Tipo del registro ${i+1}" data-list="registros" data-i="${i}" data-f="tipo">${["A","CNAME","MX"].map(t => `<option ${r.tipo === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          <input aria-label="Nombre del registro ${i+1}" data-list="registros" data-i="${i}" data-f="nombre" value="${esc(r.nombre)}" spellcheck="false">
          <input aria-label="Valor del registro ${i+1}" data-list="registros" data-i="${i}" data-f="valor" value="${esc(r.valor)}" spellcheck="false" placeholder="${r.tipo === "A" ? "IP" : "nombre del equipo"}">
          <button class="del" type="button" data-del="registros" data-i="${i}" aria-label="Quitar registro ${i+1}">×</button></div>`).join("")}
      </div>
      <button class="btn small" type="button" data-add="registros" style="margin-top:8px">+ Añadir registro</button>
      ${nota("El registro del servidor (gris) se crea siempre. Los registros A dentro de la red también generan su PTR en la zona inversa. Para MX usa «@» como nombre.")}
      ${pro("Servidor secundario", has("ad") ? "<p style='margin:0;font-size:13.5px'>Con Active Directory, el secundario es el segundo controlador de dominio (módulo AD): replica las zonas solo.</p>" : srv2Campos())}
    </div>`;
  if (id === "ad"){
    const { usuarios } = parseCSV(), deps = departamentos();
    return `
    <div class="panel">
      <h3>Dominio</h3>
      <div class="fields">${campo("dominio", "Dominio")}${campo("netbios", "NetBIOS")}${campo("ouRaiz", "OU raíz", "", "wide")}</div>
      <h3>Usuarios (CSV)</h3>
      <label class="f wide" for="f-csv"><span>Pega aquí el CSV (separado por ; o ,)</span>
        <textarea id="f-csv" data-key="csv" spellcheck="false">${esc(S.csv)}</textarea>
        <small>Columnas: nombre, apellidos, departamento y usuario (opcional; si falta, se genera con la inicial y el primer apellido).</small>
      </label>
      <div class="note" id="csvNote"><b>${usuarios.length}</b> usuarios en <b>${deps.length}</b> departamentos: ${deps.map(x => `OU ${esc(x)} → ${esc(grupoDe(x))}`).join(" · ") || "ninguno"}</div>
      ${pro("Segundo controlador de dominio", srv2Campos() + "<p style='margin:10px 0 0;font-size:13.5px'>OUs separadas (Usuarios, Grupos, Equipos, Servidores, Administracion), papelera de AD y hora oficial.</p>")}
    </div>`;
  }
  if (id === "gpo") return `
    <div class="panel">
      <h3>Directivas</h3>
      <p style="margin:0 0 8px;font-size:14px">La política de contraseñas del dominio siempre se incluye${PRO() ? " (12 caracteres, historial de 24 y bloqueo tras 5 intentos)" : " (8 caracteres y complejidad)"}.</p>
      <div class="checks">
        ${check("gpoPanel", "Bloquear el Panel de control y Configuración")}
        ${check("gpoCmd", "Bloquear el símbolo del sistema (CMD)")}
        ${check("gpoUsb", "Bloquear memorias USB")}
        ${check("gpoBloqueo", "Bloquear la pantalla a los 10 minutos")}
        ${check("gpoFondo", "Fondo de escritorio corporativo")}
      </div>
      ${S.gpoFondo ? `<div class="fields" style="margin-top:8px">${campo("fondoRuta", "Ruta de la imagen", "Ruta de red que puedan leer todos", "wide")}</div>` : ""}
      ${nota(`Se vinculan a: usuarios → <code>${esc(ouUsuarios())}</code>; equipos → <code>${esc(ouEquipos())}</code>.`)}
      ${pro("Endurecimiento", "<p style='margin:0;font-size:13.5px'>Política más dura para los administradores (PSO), firma SMB obligatoria y LLMNR desactivado.</p>")}
    </div>`;
  if (id === "ficheros") return `
    <div class="panel">
      <h3>Carpetas</h3>
      <div class="fields">${campo("rutaWin", "Carpeta base en Windows")}${campo("rutaLin", "Carpeta base en Ubuntu")}</div>
      ${has("ad") ? nota(`Las carpetas salen de los departamentos del CSV de Active Directory: <b>${esc(departamentos().join(", "))}</b>, cada una con permiso para su grupo G_.`)
                 : `<div class="fields" style="margin-top:10px">${campo("carpetas", "Carpetas", "Separadas por comas. Se crea un grupo por carpeta", "wide")}</div>`}
      <div style="margin-top:8px">${check("comun", "Carpeta Común para todos los usuarios")}</div>
      ${pro("Cuotas", `<div class="fields">${campo("cuotaGB", "Cuota por carpeta (GB)")}</div>`)}
    </div>`;
  if (id === "web") return `
    <div class="panel">
      <h3>Sitio</h3>
      <div class="fields">${campo("webHost", "Nombre", `Responderá en ${esc(webFqdn())}`, "wide")}${campo("webRaizWin", "Carpeta en Windows")}${campo("webRaizLin", "Carpeta en Ubuntu")}</div>
      ${pro("HTTPS", "<p style='margin:0;font-size:13.5px'>Certificado autofirmado (para la intranet), redirección de HTTP a HTTPS y cabeceras de seguridad.</p>")}
    </div>`;
  if (id === "ftp") return `
    <div class="panel">
      <h3>FTP</h3>
      <div class="fields">${campo("ftpRutaWin", "Carpeta en Windows", "", "wide")}</div>
      ${nota("En Ubuntu cada usuario entra en su carpeta personal y no puede salir de ella (chroot).")}
      ${pro("Puertos pasivos", `<div class="fields">${campo("pasvMin", "Desde")}${campo("pasvMax", "Hasta")}</div>`)}
    </div>`;
  if (id === "ssh") return `
    <div class="panel">
      <h3>SSH</h3>
      <div class="fields">${campo("sshPuerto", "Puerto", "22 por defecto")}</div>
      ${pro("Acceso restringido", `<div class="fields">${campo("sshGrupo", "Grupo permitido (Ubuntu)")}${campo("adminNet", "Red de administración")}</div><p style="margin:10px 0 0;font-size:13.5px">El script se detiene si tu usuario no tiene clave pública, para que no te quedes fuera.</p>`)}
    </div>`;
  if (id === "firewall") return `
    <div class="panel">
      <h3>Puertos que se abren</h3>
      <div class="rows">${puertos().map(x => `<div class="row" style="grid-template-columns:1fr auto;font-size:13.5px;border-bottom:1px dashed var(--line);padding:4px 0"><span><b>${esc(x.n)}</b>${x.soloWin ? " · solo Windows" : x.soloLin ? " · solo Ubuntu" : ""}${x.nota ? `<br><small style="color:var(--muted)">${esc(x.nota)}</small>` : ""}</span><code>${esc(x.port)}/${x.proto}</code></div>`).join("")}</div>
      ${nota("Si añades o quitas módulos, esta lista cambia sola.")}
      ${pro("Origen permitido", `<div class="fields">${campo("adminNet", "Red de administración", "SSH y RDP solo desde aquí", "wide")}</div>`)}
    </div>`;
  if (id === "backup") return `
    <div class="panel">
      <h3>Qué y dónde</h3>
      <div class="fields">
        ${campo("bkOrigenWin", "Windows: carpetas", "Separadas por comas")}${campo("bkDestinoWin", "Windows: disco destino")}
        ${campo("bkOrigenLin", "Ubuntu: carpetas", "Separadas por espacios")}${campo("bkDestinoLin", "Ubuntu: carpeta destino")}
        ${campo("bkHora", "Hora")}${campo("bkDias", "Días que se guardan")}
      </div>
      ${pro("Copia fuera del servidor", `<div class="fields">${campo("bkRemoto", "Destino remoto (rsync por SSH)", "usuario@servidor:/ruta", "wide")}</div>`)}
    </div>`;
  if (id === "verificar") return `
    <div class="panel">
      <h3>Qué se comprueba</h3>
      <p style="margin:0;font-size:14px">${activos().filter(x => !["red","subredes","verificar","errores","chuleta"].includes(x)).map(x => esc(modNombre(x))).join(" · ") || "Solo la red"}</p>
      ${nota("Cada prueba se pinta en verde o rojo y al final sale el total. Si algo sale en rojo, la pestaña «Comprobar» de ese módulo te dice cómo mirarlo en detalle.")}
    </div>`;
  return "";
}

/* ============================================================
   Render general
   ============================================================ */
let actual = "red";
const main = document.getElementById("main");
function render(){
  document.body.classList.toggle("is-pro", PRO());
  renderNav();
  document.querySelectorAll(".level [data-nivel]").forEach(b => b.setAttribute("aria-pressed", S.nivel === b.dataset.nivel));
  if (actual !== "red" && actual !== "modulos" && !has(actual)) actual = "red";
  const n = actual === "modulos" ? "" : num(actual);
  const cab = `<div class="modhead">${n ? `<span class="num">${n}</span>` : ""}<h1><span class="tape">${modNombre(actual)}</span></h1>${PRO() && actual !== "modulos" ? '<span class="badge-pro">PRO</span>' : ""}</div><p class="lede">${LEDES[actual] || ""}</p>`;
  if (actual === "modulos") main.innerHTML = cab + `<div id="catalogo"></div>`;
  else if (actual === "chuleta") main.innerHTML = cab + `<div id="chuleta"></div>`;
  else if (actual === "errores") main.innerHTML = cab + `<div id="diag"></div>`;
  else if (actual === "subredes") main.innerHTML = cab + `<div id="vlsm"></div>`;
  else main.innerHTML = cab + `<div class="grid2"><div id="form">${formulario(actual)}</div><div id="salida"></div></div>`;
  if (actual === "modulos") renderCatalogo();
  if (actual === "chuleta") renderChuleta();
  if (actual === "errores") renderDiag();
  if (actual === "subredes") renderVLSM();
  refrescar();
}
function refrescar(){
  const issues = validar();
  renderProyecto(issues);
  renderNavDots(issues);
  document.querySelectorAll("[data-key]").forEach(el => el.classList.toggle("bad", issues.some(i => i.campo === el.dataset.key && i.nivel === "err")));
  const sal = document.getElementById("salida");
  if (!sal) return;
  const d = derivar();
  if (actual === "red"){ sal.innerHTML = panelRed(d, issues); return; }
  if (!d.ok){ sal.innerHTML = `<div class="panel"><p>Corrige primero la red y el prefijo en el plan de red para poder generar los scripts.</p></div>`; return; }
  const salidas = MODS[actual].salidas(d);
  const t = Math.min(UI.tab[actual] || 0, salidas.length - 1), s = salidas[t];
  const propios = issues.filter(i => (i.modulo === actual || (i.modulo === "red" && i.nivel === "err")) && i.nivel !== "tip");
  const etq = { win: "PS", lin: "SH", chk: "✓" };
  sal.innerHTML = `
    ${propios.length ? `<ul class="issues" style="margin-bottom:12px">${propios.map(i => `<li><span class="pill ${i.nivel}">${etiqueta(i.nivel)}</span><span>${esc(i.texto)}</span></li>`).join("")}</ul>` : ""}
    <div class="out">
      <div class="tabs" role="tablist">${salidas.map((x, i) => `<button class="tab" role="tab" type="button" aria-selected="${i === t}" data-tab="${i}"><span class="os ${x.os}">${etq[x.os]}</span>${esc(x.nombre)}</button>`).join("")}</div>
      <div class="toolbar">
        <div class="fname">${esc(s.fichero)} <small>· ${contarLineas(s.code)} líneas</small></div>
        <label class="switch" for="swCom"><input type="checkbox" id="swCom" ${UI.comentarios ? "checked" : ""}> Comentarios</label>
        <button class="btn primary small" type="button" id="btnCopy">${s.os === "chk" ? "Copiar comandos" : "Copiar script"}</button>
      </div>
      <pre class="code" id="code" tabindex="0">${resaltar(sinComentarios(s.code))}</pre>
      <div class="howto">${s.como}</div>
    </div>`;
  sal.dataset.code = sinComentarios(s.code);
}
const sinComentarios = code => UI.comentarios ? code :
  code.split("\n").filter(l => !((/^\s*#/.test(l) && !/^#!/.test(l)) || /^\s*!/.test(l))).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
const contarLineas = code => sinComentarios(code).split("\n").length;
function resaltar(code){
  return code.split("\n").map(l => {
    const e = esc(l);
    if (/^#!/.test(l)) return `<span class="cm">${e}</span>`;
    if (/^\s*# ── PRO/.test(l)) return `<span class="pro">${e}</span>`;
    if (/^\s*[#!] ?(=====|Proyecto:|Generado|Guárdalo|Comprobaciones del|Plan de direcc|-{5,})/.test(l)) return `<span class="hd">${e}</span>`;
    if (/^\s*#/.test(l) || /^\s*;/.test(l) || /^\s*\/\//.test(l) || /^\s*!/.test(l)) return `<span class="cm">${e}</span>`;
    return e.replace(/\b([A-Z][a-z]+-[A-Z][A-Za-z0-9]+)\b/g, '<span class="kw">$1</span>').replace(/(&lt;&lt;'EOF'|^EOF$)/g, '<span class="hd">$1</span>');
  }).join("\n");
}
const etiqueta = n => ({ err: "Error", warn: "Aviso", tip: "Consejo", ok: "OK" }[n]);

function panelRed(d, issues){
  if (!d.ok) return `<div class="panel"><ul class="issues">${issues.map(i => `<li><span class="pill ${i.nivel}">${etiqueta(i.nivel)}</span><span>${esc(i.texto)}</span></li>`).join("")}</ul></div>`;
  const a = ipToInt(S.dhcpIni), b = ipToInt(S.dhcpFin), dh = has("dhcp");
  const pool = dh && a !== null && b !== null && a <= b ? Math.max(0, Math.min(b, d.bcast - 1) - Math.max(a, d.netAddr + 1) + 1) : 0;
  const res = new Map(dh ? S.reservas.map(r => [ipToInt(r.ip), r.nombre]) : []);
  const fijas = new Map(has("dns") ? S.registros.filter(r => r.tipo === "A").map(r => [ipToInt(r.valor), r.nombre]) : []);
  const s2 = usaSrv2() ? ipToInt(S.srv2Ip) : null;
  const rol = n => {
    const inPool = dh && a !== null && b !== null && n >= a && n <= b;
    if (n === d.netAddr) return ["net", "dirección de red"];
    if (n === d.bcast) return ["bc", "broadcast"];
    if (n === ipToInt(S.gw)) return ["gw", "puerta de enlace"];
    if (n === ipToInt(S.srvIp)) return ["srv", `servidor ${S.srvNombre}`];
    if (n === s2) return ["srv2", `segundo servidor ${S.srv2Nombre}`];
    if (res.has(n)) return ["res" + (inPool ? " inpool" : ""), `reserva DHCP · ${res.get(n)}`];
    if (fijas.has(n)) return ["fija" + (inPool ? " inpool" : ""), `IP fija (DNS) · ${fijas.get(n)}`];
    if (inPool) return ["pool", "rango DHCP"];
    return ["", "libre"];
  };
  let mapa;
  if (d.size <= 256){
    let cells = "";
    for (let i = 0; i < d.size; i++){ const n = d.netAddr + i; const [c, t] = rol(n); cells += `<i class="port ${c}" data-ip="${intToIp(n)}" data-t="${esc(t)}"></i>`; }
    mapa = `<div class="ports" style="grid-template-columns:repeat(${Math.min(32, d.size)},1fr)">${cells}</div>`;
  } else {
    const pct = n => ((n - d.netAddr) / d.size * 100).toFixed(3) + "%";
    const seg = (n1, n2, color, t) => `<i style="left:${pct(n1)};width:${((n2 - n1 + 1) / d.size * 100).toFixed(3)}%;background:var(${color})" title="${esc(t)}"></i>`;
    let bars = "";
    if (pool) bars += seg(Math.max(a, d.netAddr), Math.min(b, d.bcast), "--c-pool", `rango DHCP ${S.dhcpIni} – ${S.dhcpFin}`);
    res.forEach((t, n) => { if (n !== null) bars += seg(n, n, "--c-res", `reserva · ${t}`); });
    [[ipToInt(S.gw), "--c-gw", "puerta de enlace"], [ipToInt(S.srvIp), "--c-srv", "servidor"], [s2, "--c-srv2", "segundo servidor"]].forEach(([n, c, t]) => { if (n !== null) bars += seg(n, n, c, t); });
    mapa = `<div class="bar">${bars}</div><p class="lede" style="margin:8px 0 0;font-size:13px">Con /${d.p} hay ${d.size.toLocaleString("es-ES")} direcciones: se dibujan a escala en una barra.</p>`;
  }
  const ley = [["--c-net","red / broadcast"],["--c-gw","puerta de enlace"],["--c-srv","servidor"], ...(s2 !== null ? [["--c-srv2","segundo servidor"]] : []), ...(dh ? [["--c-pool","rango DHCP"],["--c-res","reserva"]] : []), ...(has("dns") ? [["--c-fija","IP fija (DNS)"]] : []), ["--c-free","libre"]]
    .map(([c, t]) => `<span><i style="background:var(${c})"></i>${t}</span>`).join("");
  return `
    <div class="panel">
      <h3>Resumen</h3>
      <div class="stats">
        <div class="stat"><span>Red</span><b>${d.cidr}</b></div>
        <div class="stat"><span>Máscara</span><b>${d.maskTxt}</b></div>
        <div class="stat"><span>Broadcast</span><b>${d.bcastTxt}</b></div>
        <div class="stat"><span>Hosts útiles</span><b>${d.hosts.toLocaleString("es-ES")}</b></div>
        <div class="stat"><span>Rango útil</span><b>${d.primero} – ${d.ultimo}</b></div>
        <div class="stat"><span>IPs en el DHCP</span><b>${dh ? pool.toLocaleString("es-ES") : "—"}</b></div>
      </div>
      <h3>Mapa de direcciones</h3>
      ${mapa}
      <div class="hover-ip" id="hoverIp">${d.size <= 256 ? "Pasa el ratón por una casilla para ver la IP." : ""}</div>
      <div class="legend">${ley}</div>
      <h3>Comprobaciones</h3>
      ${issues.length ? `<ul class="issues">${issues.map(i => `<li><span class="pill ${i.nivel}">${etiqueta(i.nivel)}</span><span>${esc(i.texto)} <span class="mod">· ${esc(modNombre(i.modulo))}</span></span></li>`).join("")}</ul>`
        : `<ul class="issues"><li><span class="pill ok">OK</span><span>Todo es coherente: IPs dentro de la red, sin solapes con el DHCP y nombres válidos.</span></li></ul>`}
    </div>`;
}
function renderProyecto(issues){
  const d = derivar();
  const errs = issues.filter(i => i.nivel === "err").length, avis = issues.filter(i => i.nivel === "warn").length;
  const estado = errs ? `<span class="chip state-err">● ${errs} error${errs > 1 ? "es" : ""}</span>` : avis ? `<span class="chip state-warn">● ${avis} aviso${avis > 1 ? "s" : ""}</span>` : `<span class="chip state-ok">● Proyecto coherente</span>`;
  document.getElementById("proj").innerHTML = `
    <span class="chip"><b>${esc(S.dominio)}</b></span>
    <span class="chip">${d.ok ? d.cidr : esc(S.red)}</span>
    <span class="chip">${esc(S.srvNombre)} · ${esc(S.srvIp)}</span>
    ${estado}`;
}
function renderNav(){
  const nav = document.getElementById("nav");
  nav.innerHTML = `<a class="navadd" href="#modulos" aria-current="${actual === "modulos" ? "page" : "false"}"><span>＋ Elegir módulos</span><span class="cnt">${S.modulos.length}</span></a>
    <div class="navlabel">Orden de montaje</div>` +
    activos().map(id => `<a class="navitem" href="#${id}" data-id="${id}" aria-current="${id === actual ? "page" : "false"}"><span class="n">${num(id)}</span><span>${esc(modNombre(id))}</span><span class="dot"></span></a>`).join("") +
    `<div class="navfoot">Los datos se guardan en este navegador. Usa «Exportar proyecto» para guardarlos en un fichero o pasárselos a un compañero.</div>`;
}
function renderNavDots(issues){
  activos().forEach(id => {
    const dot = document.querySelector(`.navitem[data-id="${id}"] .dot`);
    if (!dot) return;
    const mine = issues.filter(i => i.modulo === id);
    dot.className = "dot " + (mine.some(i => i.nivel === "err") ? "err" : mine.some(i => i.nivel === "warn") ? "warn" : "");
  });
}

/* Catálogo */
function renderCatalogo(){
  const box = document.getElementById("catalogo");
  const osb = os => os.map(o => `<span class="os ${o}">${o === "win" ? "Windows" : "Ubuntu"}</span>`).join("");
  box.innerHTML = `
    <div class="levels" role="group" aria-label="Nivel">
      <button type="button" class="lvl" data-nivel="clase" aria-pressed="${S.nivel === "clase"}"><b>Clase</b><span>Lo que se hace en las prácticas: cada servicio funcionando, con la configuración mínima y explicada línea a línea.</span></button>
      <button type="button" class="lvl pro" data-nivel="pro" aria-pressed="${S.nivel === "pro"}"><b>Profesional</b><span>Lo que harías en una empresa: un segundo servidor por si cae el primero, HTTPS, acceso solo con claves, cortafuegos restrictivo, registros, copias programadas y buenas prácticas de AD. Lo añadido va marcado en morado en los scripts.</span></button>
    </div>
    ${CATS.map(cat => {
      const mods = CATALOGO.filter(m => m.cat === cat);
      const fijo = cat === "Base" ? `<div class="card on"><div class="ct"><b>Plan de red</b><span class="fixed">Siempre incluido</span></div><p>Red, servidor y dominio. Todos los módulos salen de aquí.</p></div>` : "";
      return `<section class="catgroup"><h2>${cat}</h2><div class="cards">${fijo}${mods.map(m => {
        const on = has(m.id);
        return `<div class="card ${on ? "on" : ""}">
          <div class="ct"><b>${esc(m.nombre)}</b><div class="oss">${osb(m.os)}</div></div>
          <p>${esc(m.desc)}</p>
          ${m.pro ? `<div class="prol">${esc(m.pro)}</div>` : ""}
          <div class="foot">${m.requiere ? `<span class="req">Necesita ${esc(modNombre(m.requiere))}</span>` : "<span></span>"}
            <button type="button" class="btn small ${on ? "on" : ""}" data-mod="${m.id}" aria-pressed="${on}">${on ? "✓ Añadido" : "+ Añadir"}</button></div>
        </div>`; }).join("")}</div></section>`;
    }).join("")}
    <div class="row-end" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" type="button" data-todos="1">Añadir todos</button>
      <button class="btn" type="button" data-todos="0">Quitar todos</button>
      <a class="btn primary" href="#red">Ir al plan de red →</a>
    </div>`;
}
function toggleModulo(id){
  if (has(id)){
    S.modulos = S.modulos.filter(x => x !== id);
    const dep = CATALOGO.filter(m => m.requiere === id && has(m.id));
    if (dep.length){ S.modulos = S.modulos.filter(x => !dep.some(m => m.id === x)); aviso(`También he quitado ${dep.map(m => m.nombre).join(", ")}, que necesita ${modNombre(id)}`); }
  } else {
    S.modulos.push(id);
    const req = CATALOGO.find(m => m.id === id).requiere;
    if (req && !has(req)){ S.modulos.push(req); aviso(`También he añadido ${modNombre(req)}, que ${modNombre(id)} necesita`); }
  }
  guardar(); render();
}

/* Chuleta */
function renderChuleta(){
  const box = document.getElementById("chuleta");
  const cats = ["Todas", ...new Set(CHULETA.map(c => c[0]))];
  const q = ascii(UI.chuletaQ).toLowerCase();
  const filas = CHULETA.filter(c => (UI.chuletaCat === "Todas" || c[0] === UI.chuletaCat) && (!q || ascii(c.join(" ")).toLowerCase().includes(q)));
  const cmd = txt => txt === "—" ? `<span class="cmd na">No hay equivalente directo</span>` :
    txt.split("\n").map(l => `<button class="cmd" type="button" data-copytxt="${esc(l.replace(/\s+#.*$/, ""))}" title="Copiar">${esc(l)}</button>`).join("");
  box.innerHTML = `
    <div class="cheat-tools">
      <input type="search" id="cheatQ" placeholder="Busca: dns, puerto, usuario, logs…" value="${esc(UI.chuletaQ)}" aria-label="Buscar en la chuleta">
      <div class="cats">${cats.map(c => `<button class="cat" type="button" data-cat="${esc(c)}" aria-pressed="${UI.chuletaCat === c}">${esc(c)}</button>`).join("")}</div>
    </div>
    <div class="cheat-wrap"><table class="cheat">
      <thead><tr><th style="width:24%">Tarea</th><th>Windows (PowerShell / cmd)</th><th>Ubuntu (bash)</th></tr></thead>
      <tbody>${filas.map(c => `<tr><td class="task"><b>${esc(c[1])}</b><span>${esc(c[0])}</span></td><td>${cmd(c[2])}</td><td>${cmd(c[3])}</td></tr>`).join("") ||
        `<tr><td colspan="3">No hay nada con «${esc(UI.chuletaQ)}». Prueba con otra palabra.</td></tr>`}</tbody>
    </table></div>`;
}
