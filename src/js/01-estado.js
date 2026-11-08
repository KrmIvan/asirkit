/* ============================================================
   ASIRkit v2 · estado del proyecto
   ============================================================ */
const EJEMPLO = {
  nivel: "clase",
  modulos: ["subredes", "ip", "ad", "dns", "dhcp", "verificar", "errores", "chuleta"],
  red: "192.168.10.0", prefijo: 24, gw: "192.168.10.1",
  srvIp: "192.168.10.10", srvNombre: "SRV01", dominio: "empresa.local", netbios: "EMPRESA",
  srv2Ip: "192.168.10.11", srv2Nombre: "SRV02", adminNet: "192.168.10.0/24",
  forwarders: "8.8.8.8, 1.1.1.1", ifWin: "Ethernet", ifLin: "enp0s3",
  dhcpIni: "192.168.10.100", dhcpFin: "192.168.10.200", lease: 8, linuxDhcp: "kea", dhcpFailover: true,
  reservas: [
    { nombre: "impresora01", mac: "00:15:5D:0A:01:32", ip: "192.168.10.50" },
    { nombre: "pc-direccion", mac: "08:00:27:3C:9E:11", ip: "192.168.10.51" }
  ],
  registros: [
    { tipo: "A", nombre: "impresora01", valor: "192.168.10.50" },
    { tipo: "A", nombre: "mail", valor: "192.168.10.20" },
    { tipo: "CNAME", nombre: "intranet", valor: "srv01" },
    { tipo: "MX", nombre: "@", valor: "mail" }
  ],
  ouRaiz: "Empresa",
  csv: "nombre;apellidos;departamento;usuario\nAna;García López;Ventas;\nLuis;Martín Pérez;Ventas;\nMarta;Sánchez Ruiz;Informática;\nJorge;Fernández Gil;Informática;jfernandez\nLucía;Romero Díaz;RRHH;",
  gpoPanel: true, gpoCmd: true, gpoUsb: true, gpoFondo: false, fondoRuta: "\\\\SRV01\\Comun\\fondo.jpg", gpoBloqueo: true,
  rutaWin: "D:\\Compartido", rutaLin: "/srv/samba", carpetas: "Ventas, Informática, RRHH", comun: true, cuotaGB: 5,
  webHost: "intranet", webRaizWin: "C:\\inetpub\\intranet", webRaizLin: "/var/www/intranet",
  ftpRutaWin: "C:\\ftp", pasvMin: 50000, pasvMax: 50100,
  sshPuerto: 22, sshGrupo: "sshusers",
  bkOrigenWin: "D:\\Compartido", bkDestinoWin: "E:", bkOrigenLin: "/etc /srv /var/www", bkDestinoLin: "/backup",
  bkHora: "21:00", bkDias: 14, bkRemoto: "backup@192.168.10.12:/backups/srv01"
};
const CLAVE = "asirkit-proyecto-v2";
let primeraVez = false;
let S = cargar();
const UI = { tab: {}, comentarios: true, chuletaQ: "", chuletaCat: "Todas" };

function cargar(){
  try { const t = localStorage.getItem(CLAVE); if (t) return Object.assign(structuredClone(EJEMPLO), JSON.parse(t)); } catch(e){}
  primeraVez = true;
  return structuredClone(EJEMPLO);
}
function guardar(){ try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch(e){} }

/* ============================================================
   Catálogo de módulos (el orden es el de montaje)
   ============================================================ */
const CATALOGO = [
  { id: "subredes", nombre: "Diseñador de subredes", cat: "Base", os: ["win","lin"], desc: "Calcula qué red necesitas según tus equipos, divide una red en subredes (VLSM o partes iguales) y te recomienda la IP de cada sitio. Genera VLAN para Cisco y los ámbitos DHCP.", pro: null },
  { id: "ip", nombre: "IP estática", cat: "Base", os: ["win","lin"], desc: "IP fija, puerta de enlace, DNS y nombre del equipo.", pro: "Zona horaria, hora por NTP, actualizaciones automáticas, RDP con NLA y SMBv1 desactivado." },
  { id: "ad", nombre: "Active Directory", cat: "Directorio", os: ["win","lin"], desc: "Crea el dominio, carga usuarios desde un CSV y une clientes Windows y Ubuntu.", pro: "OUs por niveles, papelera de AD, equipos nuevos en su OU, hora oficial del ROA y segundo controlador de dominio." },
  { id: "dns", nombre: "DNS", cat: "Red", os: ["win","lin"], desc: "Zona directa e inversa, registros A, CNAME y MX, y reenviadores.", pro: "Servidor secundario, transferencias restringidas, limpieza de registros, limitación de respuestas y log de consultas." },
  { id: "dhcp", nombre: "DHCP", cat: "Red", os: ["win","lin"], desc: "Ámbito, opciones para los clientes y reservas por MAC.", pro: "Conmutación por error con un segundo servidor, detección de conflictos y registro en el DNS." },
  { id: "gpo", nombre: "Directivas de grupo", cat: "Directorio", os: ["win"], requiere: "ad", desc: "Política de contraseñas y las GPO típicas: panel de control, CMD, USB y fondo.", pro: "Bloqueo de cuentas, política más dura para administradores, firma SMB, sin LLMNR y bloqueo de pantalla." },
  { id: "ficheros", nombre: "Servidor de ficheros", cat: "Servicios", os: ["win","lin"], desc: "Una carpeta compartida por departamento con sus permisos (SMB en Windows, Samba en Ubuntu).", pro: "Modelo AGDLP, solo ves lo que puedes abrir, cifrado SMB, cuotas, instantáneas y papelera de red." },
  { id: "web", nombre: "Servidor web", cat: "Servicios", os: ["win","lin"], desc: "Sitio de intranet con IIS o Apache y su nombre en el DNS.", pro: "HTTPS con redirección, cabeceras de seguridad y versión del servidor oculta." },
  { id: "ftp", nombre: "Servidor FTP", cat: "Servicios", os: ["win","lin"], desc: "FTP con usuarios locales encerrados en su carpeta (IIS FTP / vsftpd).", pro: "FTPS obligatorio, puertos pasivos fijos y solo los usuarios permitidos." },
  { id: "ssh", nombre: "SSH", cat: "Servicios", os: ["win","lin"], desc: "Administración remota por terminal con OpenSSH.", pro: "Solo claves, sin root, grupo permitido, Fail2ban y un seguro para no quedarte fuera." },
  { id: "firewall", nombre: "Cortafuegos", cat: "Seguridad", os: ["win","lin"], desc: "Abre solo los puertos de los servicios que has elegido.", pro: "Administración solo desde la red de gestión, límite de intentos y registro de lo bloqueado." },
  { id: "backup", nombre: "Copias de seguridad", cat: "Operación", os: ["win","lin"], desc: "Copia diaria de las carpetas importantes, con rotación.", pro: "Copias incrementales programadas, estado del sistema y réplica fuera del servidor (regla 3-2-1)." },
  { id: "verificar", nombre: "Verificación", cat: "Operación", os: ["win","lin"], desc: "Un script que comprueba todo lo montado y marca en rojo lo que falla.", pro: "Añade las comprobaciones de todo lo del modo profesional." },
  { id: "errores", nombre: "Diagnóstico de errores", cat: "Herramientas", os: ["win","lin"], desc: "Pega un error y te dice qué significa, por qué pasa y cómo arreglarlo. Revisa tus ficheros y los compara con los generados.", pro: null },
  { id: "chuleta", nombre: "Chuleta Win ↔ Linux", cat: "Herramientas", os: ["win","lin"], desc: "Los mismos comandos en los dos sistemas, con buscador.", pro: null }
];
const CATS = ["Base", "Red", "Directorio", "Servicios", "Seguridad", "Operación", "Herramientas"];
const has = id => S.modulos.includes(id);
const PRO = () => S.nivel === "pro";
const activos = () => [...(has("subredes") ? ["subredes"] : []), "red", ...CATALOGO.map(m => m.id).filter(id => id !== "subredes" && has(id))];
const num = id => String(activos().indexOf(id) + 1).padStart(2, "0");
const fich = (id, base, ext, suf = "") => `${num(id)}${suf}-${base}.${ext}`;
const usaSrv2 = () => PRO() && (has("dhcp") && S.dhcpFailover || has("dns") || has("ad"));

/* ============================================================
   Utilidades de red y texto
   ============================================================ */
function ipToInt(ip){
  const p = String(ip ?? "").trim().split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p){ if (!/^\d{1,3}$/.test(x)) return null; const v = +x; if (v > 255) return null; n = n * 256 + v; }
  return n;
}
const intToIp = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
const maskInt = p => p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const NOMBRE_RE = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
function derivar(){
  const p = parseInt(S.prefijo, 10), red = ipToInt(S.red);
  if (red === null || !(p >= 8 && p <= 30)) return { ok: false };
  const mask = maskInt(p), netAddr = (red & mask) >>> 0, size = 2 ** (32 - p), bcast = netAddr + size - 1;
  return {
    ok: true, p, mask, netAddr, size, bcast,
    redTxt: intToIp(netAddr), maskTxt: intToIp(mask), bcastTxt: intToIp(bcast),
    primero: intToIp(netAddr + 1), ultimo: intToIp(bcast - 1), hosts: size - 2, cidr: intToIp(netAddr) + "/" + p,
    dentro: ip => { const n = ipToInt(ip); return n !== null && n > netAddr && n < bcast; }
  };
}
function zonaInversa(d){
  const o = d.redTxt.split("."), n = d.p >= 24 ? 3 : d.p >= 16 ? 2 : 1, base = o.slice(0, n);
  return {
    n, nombre: base.slice().reverse().join(".") + ".in-addr.arpa",
    networkId: base.concat(Array(4 - n).fill("0")).join(".") + "/" + (n * 8),
    fichero: "/etc/bind/db." + base.join("."),
    contiene: ip => String(ip).split(".").slice(0, n).join(".") === base.join("."),
    etiqueta: ip => String(ip).split(".").slice(n).reverse().join(".")
  };
}
const lista = s => String(s ?? "").split(/[,;]+/).map(x => x.trim()).filter(Boolean);
const forwarders = () => String(S.forwarders).split(/[\s,;]+/).filter(Boolean);
const host = () => String(S.srvNombre).toLowerCase();
const host2 = () => String(S.srv2Nombre).toLowerCase();
const fqdn = () => host() + "." + S.dominio;
const fqdn2 = () => host2() + "." + S.dominio;
const webFqdn = () => String(S.webHost).toLowerCase() + "." + S.dominio;
const dn = () => "DC=" + String(S.dominio).split(".").join(",DC=");
const NB = () => limpio(S.netbios).toUpperCase();
const limpio = s => String(s ?? "").replace(/[`"$'\\]/g, "").trim();
const ruta = s => String(s ?? "").replace(/[`"$']/g, "").trim();
const ascii = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const macWin = m => String(m).toUpperCase().replace(/:/g, "-");
const macLin = m => String(m).toLowerCase().replace(/-/g, ":");
const dnsClientes = () => (has("dns") || has("ad")) ? [S.srvIp, ...(usaSrv2() && (has("dns") || has("ad")) ? [S.srv2Ip] : [])] : forwarders();
const hoySerial = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0") + "01"; };
const L = (...xs) => xs.flat(Infinity).join("\n");
const PROsec = t => ["", `# ── PRO · ${t} ──`];
const ufwSi = cmd => `if ufw status | grep -q "Status: active"; then ${cmd}; fi`;

/* CSV de usuarios (lo usan AD, ficheros y verificación) */
function parseCSV(){
  const lineas = String(S.csv || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const errores = [], usuarios = [];
  if (!lineas.length) return { usuarios, errores: ["El CSV de usuarios está vacío."] };
  const sep = lineas[0].includes(";") ? ";" : ",";
  const cab = lineas[0].split(sep).map(c => ascii(c).toLowerCase().trim());
  const tieneCab = cab.some(c => ["nombre","apellidos","apellido","departamento","usuario"].includes(c));
  const idx = k => cab.findIndex(c => k.includes(c));
  const iN = tieneCab ? idx(["nombre"]) : 0, iA = tieneCab ? idx(["apellidos","apellido"]) : 1,
        iD = tieneCab ? idx(["departamento","depto"]) : 2, iU = tieneCab ? idx(["usuario","login"]) : 3;
  const usados = new Set();
  lineas.slice(tieneCab ? 1 : 0).forEach((l, k) => {
    const c = l.split(sep).map(x => x.trim());
    const nombre = limpio(c[iN]), apellidos = limpio(c[iA]), depto = limpio(c[iD]) || "General";
    if (!nombre || !apellidos){ errores.push(`CSV, línea ${k + (tieneCab ? 2 : 1)}: falta el nombre o los apellidos.`); return; }
    let u = iU >= 0 ? ascii(limpio(c[iU])).toLowerCase().replace(/[^a-z0-9._-]/g, "") : "";
    if (!u) u = (ascii(nombre)[0] + ascii(apellidos.split(/\s+/)[0])).toLowerCase().replace(/[^a-z0-9]/g, "");
    u = u.slice(0, 20);
    const base = u; let n = 2;
    while (usados.has(u)) u = base.slice(0, 19 - String(n).length) + n++;
    usados.add(u);
    usuarios.push({ nombre, apellidos, depto, usuario: u });
  });
  return { usuarios, errores };
}
const grupoDe = dep => "G_" + ascii(dep).replace(/[^A-Za-z0-9]+/g, "_");
const departamentos = () => [...new Set(parseCSV().usuarios.map(u => u.depto))];
function carpetas(){
  const deps = has("ad") ? departamentos() : lista(S.carpetas);
  const out = deps.map(dep => ({ nombre: ascii(dep).replace(/[^A-Za-z0-9]+/g, "_"), etiqueta: dep, grupo: grupoDe(dep), linux: ascii(dep).toLowerCase().replace(/[^a-z0-9]+/g, "") || "grupo" }));
  if (S.comun) out.push({ nombre: "Comun", etiqueta: "Común", grupo: null, linux: "comun" });
  return out;
}

/* ============================================================
   Validación del proyecto
   ============================================================ */
function validar(){
  const out = [];
  const add = (nivel, modulo, texto, campo) => out.push({ nivel, modulo, texto, campo });
  const d = derivar();
  if (ipToInt(S.red) === null) add("err", "red", "La dirección de red no es una IPv4 válida.", "red");
  const p = parseInt(S.prefijo, 10);
  if (!(p >= 8 && p <= 30)) add("err", "red", "El prefijo tiene que estar entre /8 y /30.", "prefijo");
  if (!d.ok) return out;
  if (ipToInt(S.red) !== d.netAddr) add("err", "red", `${S.red} no es una dirección de red para /${d.p}. ¿Querías decir ${d.redTxt}?`, "red");
  if (!d.dentro(S.gw)) add("err", "red", `La puerta de enlace ${S.gw} no es un host válido de ${d.cidr}.`, "gw");
  if (!d.dentro(S.srvIp)) add("err", "red", `La IP del servidor ${S.srvIp} no es un host válido de ${d.cidr}.`, "srvIp");
  if (S.srvIp === S.gw) add("err", "red", "El servidor y la puerta de enlace tienen la misma IP.", "srvIp");
  if (!/^[A-Za-z0-9-]{1,15}$/.test(S.srvNombre)) add("err", "red", "El nombre del servidor debe tener de 1 a 15 caracteres (letras, números y guiones). Es el límite NetBIOS de Windows.", "srvNombre");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(S.dominio)) add("err", "red", "El dominio debe tener al menos dos partes, por ejemplo empresa.local.", "dominio");
  else if (/\.local$/i.test(S.dominio)) add("tip", "red", "En clase se usa .local, pero en una empresa se recomienda un subdominio de un dominio real (ad.empresa.com): .local choca con mDNS en Linux y macOS.", "dominio");
  if (has("ad") && !/^[A-Za-z0-9-]{1,15}$/.test(S.netbios)) add("err", "ad", "El nombre NetBIOS del dominio debe tener como máximo 15 caracteres.", "netbios");
  forwarders().forEach(f => { if (ipToInt(f) === null) add("err", "red", `El reenviador «${f}» no es una IP válida.`, "forwarders"); });
  const a = ipToInt(S.dhcpIni), b = ipToInt(S.dhcpFin);
  const enPool = ip => { const n = ipToInt(ip); return has("dhcp") && n !== null && a !== null && b !== null && n >= a && n <= b; };
  if (usaSrv2()){
    if (!d.dentro(S.srv2Ip)) add("err", "red", `La IP del segundo servidor (${S.srv2Ip}) no es un host válido de ${d.cidr}.`, "srv2Ip");
    if ([S.srvIp, S.gw].includes(S.srv2Ip)) add("err", "red", "El segundo servidor repite la IP del servidor principal o de la puerta de enlace.", "srv2Ip");
    if (enPool(S.srv2Ip)) add("err", "dhcp", "La IP del segundo servidor está dentro del rango DHCP.", "srv2Ip");
    if (!/^[A-Za-z0-9-]{1,15}$/.test(S.srv2Nombre) || S.srv2Nombre.toLowerCase() === host()) add("err", "red", "El segundo servidor necesita un nombre propio de 1 a 15 caracteres.", "srv2Nombre");
  }
  if (PRO() && (has("ssh") || has("firewall"))){
    const [ipn, pre] = String(S.adminNet).split("/");
    if (ipToInt(ipn) === null || !(+pre >= 8 && +pre <= 32)) add("err", "red", "La red de administración debe tener el formato 192.168.10.0/24.", "adminNet");
  }
  if (has("dhcp")){
    if (!d.dentro(S.dhcpIni)) add("err", "dhcp", `El inicio del rango DHCP (${S.dhcpIni}) está fuera de la red.`, "dhcpIni");
    if (!d.dentro(S.dhcpFin)) add("err", "dhcp", `El final del rango DHCP (${S.dhcpFin}) está fuera de la red.`, "dhcpFin");
    if (a !== null && b !== null && a > b) add("err", "dhcp", "El rango DHCP empieza después de donde acaba.", "dhcpIni");
    if (enPool(S.gw)) add("err", "dhcp", "La puerta de enlace está dentro del rango DHCP: se la podría dar a un cliente.", "dhcpIni");
    if (enPool(S.srvIp)) add("err", "dhcp", "La IP del servidor está dentro del rango DHCP: se la podría dar a un cliente.", "dhcpIni");
    const vistas = new Set();
    S.reservas.forEach((r, i) => {
      const n = r.nombre || `reserva ${i+1}`;
      if (!MAC_RE.test(r.mac)) add("err", "dhcp", `${n}: la MAC «${r.mac}» no tiene el formato 00:11:22:33:44:55.`);
      if (!d.dentro(r.ip)) add("err", "dhcp", `${n}: la IP ${r.ip} está fuera de la red.`);
      else if (enPool(r.ip)) add("warn", "dhcp", `${n}: la IP reservada ${r.ip} está dentro del rango dinámico. Funciona, pero es más limpio dejarla fuera.`);
      if ([S.gw, S.srvIp].includes(r.ip)) add("err", "dhcp", `${n}: la IP ${r.ip} ya la usa la puerta de enlace o el servidor.`);
      if (vistas.has(r.ip)) add("err", "dhcp", `La IP ${r.ip} está reservada dos veces.`);
      vistas.add(r.ip);
    });
  }
  if (has("dns")){
    S.registros.forEach(r => {
      if (!(r.nombre === "@" || NOMBRE_RE.test(r.nombre))) add("err", "dns", `El nombre de registro «${r.nombre}» no es válido.`);
      if (r.tipo === "A" && ipToInt(r.valor) === null) add("err", "dns", `${r.nombre}: «${r.valor}» no es una IP válida.`);
      if (r.tipo === "A" && [host(), host2()].includes(String(r.nombre).toLowerCase())) add("warn", "dns", `El registro A de ${r.nombre} ya lo crea el script automáticamente.`);
      if (r.tipo !== "A" && !String(r.valor).trim()) add("err", "dns", `${r.nombre}: falta el destino del registro ${r.tipo}.`);
    });
  }
  if (has("ad")) parseCSV().errores.forEach(e => add("warn", "ad", e));
  if (has("web")){
    if (!NOMBRE_RE.test(S.webHost)) add("err", "web", "El nombre del sitio web debe ser una sola palabra (intranet, www...).", "webHost");
    else if ((has("dns")) && !S.registros.some(r => String(r.nombre).toLowerCase() === String(S.webHost).toLowerCase()) && ![host(), host2()].includes(String(S.webHost).toLowerCase()))
      add("warn", "web", `${webFqdn()} no existe en el DNS. Añade en el módulo DNS un registro CNAME ${S.webHost} → ${host()}.`);
  }
  if (has("ssh") && !(+S.sshPuerto >= 1 && +S.sshPuerto <= 65535)) add("err", "ssh", "El puerto SSH debe estar entre 1 y 65535.", "sshPuerto");
  if (has("ftp") && PRO() && !(+S.pasvMin >= 1024 && +S.pasvMax > +S.pasvMin && +S.pasvMax <= 65535)) add("err", "ftp", "El rango de puertos pasivos no es válido (por ejemplo 50000-50100).", "pasvMin");
  if (has("ficheros") && !carpetas().length) add("err", "ficheros", "No hay ninguna carpeta que compartir.", "carpetas");
  if (has("gpo") && S.gpoFondo && !String(S.fondoRuta).startsWith("\\\\")) add("warn", "gpo", "La ruta del fondo debería ser una ruta de red (\\\\servidor\\carpeta\\fondo.jpg) para que la vean todos los equipos.", "fondoRuta");
  if (has("backup") && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(S.bkHora)) add("err", "backup", "La hora de la copia debe tener el formato 21:00.", "bkHora");
  return out;
}
