/* ============================================================
   Cortafuegos
   ============================================================ */
function puertos(){
  const p = [], ssh = String(+S.sshPuerto || 22);
  p.push({ n: "SSH", proto: "tcp", port: has("ssh") ? ssh : "22", admin: true, soloLin: !has("ssh"), nota: has("ssh") ? "" : "abierto para no quedarte fuera del servidor" });
  p.push({ n: "RDP", proto: "tcp", port: "3389", admin: true, soloWin: true, nota: "Escritorio remoto" });
  if (has("dns") || has("ad")) p.push({ n: "DNS-TCP", proto: "tcp", port: "53" }, { n: "DNS-UDP", proto: "udp", port: "53" });
  if (has("dhcp")) p.push({ n: "DHCP", proto: "udp", port: "67", todos: true, nota: "los clientes aún no tienen IP: no se puede filtrar por origen" });
  if (has("dhcp") && PRO() && S.dhcpFailover) p.push({ n: "DHCP-Failover", proto: "tcp", port: "647", soloWin: true }, { n: "DHCP-HA", proto: "tcp", port: S.linuxDhcp === "kea" ? "8000" : "647", soloLin: true, desde: S.srv2Ip });
  if (has("ficheros")) p.push({ n: "SMB", proto: "tcp", port: "445" });
  if (has("web")) { p.push({ n: "HTTP", proto: "tcp", port: "80", todos: true }); if (PRO()) p.push({ n: "HTTPS", proto: "tcp", port: "443", todos: true }); }
  if (has("ftp")) { p.push({ n: "FTP", proto: "tcp", port: "21" }); if (PRO()) p.push({ n: "FTP-Pasivo", proto: "tcp", port: `${S.pasvMin}-${S.pasvMax}` }); else p.push({ n: "FTP-Datos", proto: "tcp", port: "20", soloLin: true }); }
  return p;
}
function firewallWindows(f){
  const lan = derivar().cidr || "LocalSubnet";
  const reglas = puertos().filter(x => !x.soloLin).map(x => {
    const origen = !PRO() || x.todos ? "Any" : x.admin ? S.adminNet : (x.desde || lan);
    return `Regla "${x.n}" ${x.proto.toUpperCase()} "${x.port}" "${origen}"${x.nota ? `   # ${x.nota}` : ""}`;
  });
  return L(cabeceraPS("Cortafuegos de Windows: solo los puertos de los servicios elegidos", f),
    "# Cortafuegos activado en los tres perfiles",
    PRO() ? ["# ── PRO · Todo lo que entra se bloquea salvo lo permitido, y lo bloqueado queda registrado",
      "$perfil = @{",
      "    Profile               = @(\"Domain\", \"Private\", \"Public\")",
      "    Enabled               = \"True\"",
      "    DefaultInboundAction  = \"Block\"",
      "    DefaultOutboundAction = \"Allow\"",
      "    LogBlocked            = \"True\"",
      "    LogMaxSizeKilobytes   = 16384",
      "    LogFileName           = \"%systemroot%\\system32\\LogFiles\\Firewall\\pfirewall.log\"",
      "}",
      "Set-NetFirewallProfile @perfil"] : "Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True",
    "",
    "# Permite el ping (la regla tiene el mismo nombre interno en cualquier idioma)",
    'Enable-NetFirewallRule -Name "FPS-ICMP4-ERQ-In"',
    "",
    "# Crea (o recrea) una regla de entrada con nombre ASIRkit-*",
    "function Regla([string]$Nombre, [string]$Protocolo, [string]$Puertos, [string]$Origen) {",
    '    Remove-NetFirewallRule -Name "ASIRkit-$Nombre" -ErrorAction SilentlyContinue',
    '    New-NetFirewallRule -Name "ASIRkit-$Nombre" -DisplayName "ASIRkit · $Nombre" -Direction Inbound -Protocol $Protocolo -LocalPort $Puertos -RemoteAddress $Origen -Action Allow | Out-Null',
    '    Write-Host "Regla: $Nombre $Protocolo/$Puertos desde $Origen" -ForegroundColor Green',
    "}",
    "",
    PRO() ? `# Administración (RDP, SSH) solo desde ${S.adminNet}; servicios internos solo desde ${lan}` : "# Reglas de los servicios del proyecto",
    ...reglas,
    has("ad") ? ["", "# Active Directory crea sus propias reglas al instalarse (88, 135, 389, 445, 464, 636, 3268 y RPC dinámicos)"] : [],
    "",
    'Get-NetFirewallRule -Name "ASIRkit-*" | Format-Table DisplayName, Enabled, Direction, Action'
  );
}
function firewallLinux(f){
  const lan = derivar().cidr || S.red;
  const reglas = puertos().filter(x => !x.soloWin).map(x => {
    const pr = x.port.replace("-", ":");
    if (!PRO() || x.todos) return `ufw allow ${pr}/${x.proto}${x.nota ? `   # ${x.nota}` : ""}`;
    const desde = x.admin ? S.adminNet : (x.desde || lan);
    return `ufw ${x.admin ? "limit" : "allow"} from ${desde} to any port ${pr} proto ${x.proto}${x.admin ? "   # limit: bloquea si hay 6 intentos en 30 s" : ""}`;
  });
  return L(cabeceraSH("Cortafuegos de Ubuntu (UFW): solo los puertos de los servicios elegidos", f),
    "DEBIAN_FRONTEND=noninteractive apt-get install -y ufw",
    "",
    "# Política: se bloquea todo lo que entra y se permite todo lo que sale",
    "ufw default deny incoming",
    "ufw default allow outgoing",
    "",
    "# Primero SSH, para no cortar tu propia conexión al activar el cortafuegos",
    ...reglas,
    PRO() ? [...PROsec("Registro de lo bloqueado en /var/log/ufw.log"), "ufw logging medium"] : [],
    "",
    "# Activa el cortafuegos sin preguntar",
    "ufw --force enable",
    "ufw status verbose"
  );
}

/* ============================================================
   Copias de seguridad
   ============================================================ */
function backupWindows(f){
  const origen = lista(S.bkOrigenWin.replace(/\s+(?=[A-Za-z]:\\)/g, ",")).map(ruta), dest = ruta(S.bkDestinoWin);
  if (!PRO()) return L(cabeceraPS("Copia de seguridad con Windows Server Backup", f),
    "Install-WindowsFeature Windows-Server-Backup -IncludeManagementTools",
    "",
    `# Copia ahora de ${origen.join(", ")} al disco ${dest}`,
    `wbadmin start backup -backupTarget:${dest} -include:${origen.join(",")} -quiet`,
    has("ad") ? ["", "# En un controlador de dominio, copia también el estado del sistema (AD, registro, SYSVOL)", `wbadmin start systemstatebackup -backupTarget:${dest} -quiet`] : [],
    "",
    "# Lista de copias disponibles",
    `wbadmin get versions -backupTarget:${dest}`,
    "",
    "# Para programarla cada día, cambia al nivel profesional o usa: wbadmin enable backup"
  );
  return L(cabeceraPS("Copias programadas con Windows Server Backup", f),
    "Install-WindowsFeature Windows-Server-Backup -IncludeManagementTools",
    "",
    "# Se borra la política anterior y se crea una nueva",
    "if (Get-WBPolicy) { Remove-WBPolicy -All -Force }",
    "$politica = New-WBPolicy",
    "",
    "# Carpetas a copiar",
    `foreach ($p in @(${origen.map(x => `"${x}"`).join(", ")})) {`,
    "    Add-WBFileSpec -Policy $politica -FileSpec (New-WBFileSpec -FileSpec $p)",
    "}",
    "",
    "# ── PRO · Recuperación completa: estado del sistema y arranque (bare metal)",
    "Add-WBSystemState -Policy $politica",
    "Add-WBBareMetalRecovery -Policy $politica",
    "",
    `# Destino: el volumen ${dest} (mejor un disco dedicado solo a copias)`,
    `$destino = New-WBBackupTarget -VolumePath "${dest}"`,
    "Add-WBBackupTarget -Policy $politica -Target $destino",
    "",
    `# Todos los días a las ${S.bkHora}. Las copias son incrementales y Windows rota las antiguas solo`,
    `Set-WBSchedule -Policy $politica -Schedule ${S.bkHora}`,
    "Set-WBPolicy -Policy $politica -Force",
    "",
    "# ── PRO · Regla 3-2-1: 3 copias, en 2 soportes, 1 fuera del edificio.",
    "# Replica el disco de copias a un NAS o a la nube con una tarea programada (robocopy /MIR o Azure Backup).",
    "",
    "Get-WBPolicy",
    "Get-WBSummary | Format-List LastSuccessfulBackupTime, LastBackupResultHR, NextBackupTime"
  );
}
function backupLinux(f){
  const origen = String(S.bkOrigenLin).split(/[\s,]+/).filter(Boolean).map(ruta), dest = ruta(S.bkDestinoLin).replace(/\/$/, "");
  const [hh, mm] = String(S.bkHora).split(":").map(n => +n || 0), dias = +S.bkDias || 14;
  const script = PRO() ? [
    "#!/usr/bin/env bash",
    "# Copia incremental con rsync: cada día es una carpeta completa, pero los ficheros",
    "# que no cambian son enlaces duros al día anterior y no ocupan espacio de nuevo.",
    "set -euo pipefail",
    `DESTINO="${dest}"`,
    `DIAS=${dias}`,
    `REMOTO="${limpio(S.bkRemoto)}"`,
    'LOG="/var/log/copia-asirkit.log"',
    'HOY=$(date +%F_%H%M)',
    'exec >>"$LOG" 2>&1',
    'echo "== $(date) · inicio"',
    `for p in ${origen.join(" ")}; do`,
    '  [ -e "$p" ] && rsync -aAXHR --delete --link-dest="$DESTINO/ultima" "$p" "$DESTINO/$HOY/"',
    "done",
    'ln -sfn "$DESTINO/$HOY" "$DESTINO/ultima"',
    "# Borra las copias más antiguas que la retención",
    'find "$DESTINO" -mindepth 1 -maxdepth 1 -type d -mtime +"$DIAS" -exec rm -rf {} +',
    "# Regla 3-2-1: una copia fuera del servidor (necesita clave SSH sin contraseña para root)",
    '[ -n "$REMOTO" ] && rsync -aH --delete -e ssh "$DESTINO/" "$REMOTO/"',
    'echo "== $(date) · fin correcto"'
  ] : [
    "#!/usr/bin/env bash",
    "# Copia completa comprimida con la fecha en el nombre",
    "set -uo pipefail",
    `DESTINO="${dest}"`,
    'FECHA=$(date +%F)',
    "RUTAS=()",
    `for p in ${origen.join(" ")}; do [ -e "$p" ] && RUTAS+=("$p"); done`,
    "# tar devuelve 1 si un fichero cambia mientras se copia: no es un error grave",
    'tar -czf "$DESTINO/copia-$FECHA.tar.gz" "${RUTAS[@]}" 2>/dev/null || [ $? -eq 1 ]',
    `# Borra las copias de más de ${dias} días`,
    `find "$DESTINO" -name 'copia-*.tar.gz' -mtime +${dias} -delete`
  ];
  return L(cabeceraSH(PRO() ? "Copias incrementales con rsync y réplica remota" : "Copia diaria comprimida con tar y cron", f),
    PRO() ? ["apt-get update", "DEBIAN_FRONTEND=noninteractive apt-get install -y rsync", ""] : [],
    `mkdir -p ${dest}`,
    `chmod 700 ${dest}`,
    "",
    "# Script de copia (lo ejecuta cron cada día)",
    "cat > /usr/local/sbin/copia-asirkit.sh <<'EOF'",
    ...script,
    "EOF",
    "chmod 700 /usr/local/sbin/copia-asirkit.sh",
    "",
    "# Comprueba que el script no tiene errores de sintaxis",
    "bash -n /usr/local/sbin/copia-asirkit.sh",
    "",
    `# Programación: todos los días a las ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    `echo "${mm} ${hh} * * * root /usr/local/sbin/copia-asirkit.sh" > /etc/cron.d/copia-asirkit`,
    "",
    "# Primera copia ahora",
    "/usr/local/sbin/copia-asirkit.sh",
    `ls -lh ${dest}`,
    "",
    PRO() ? ["# Restaurar un fichero: cp -a " + dest + "/ultima/etc/hosts /etc/hosts"]
          : ["# Restaurar: tar -xzf " + dest + "/copia-FECHA.tar.gz -C / etc/hosts"]
  );
}

/* ============================================================
   Verificación (script que repasa todo)
   ============================================================ */
function verifWindows(d, f){
  const z = zonaInversa(d), c = [];
  const C = (t, b) => c.push(`Comprobar "${t}" { ${b} }`);
  const H = t => c.push("", `# --- ${t} ---`);
  c.push("# --- Red ---");
  C(`IP ${S.srvIp} asignada`, `Get-NetIPAddress -IPAddress ${S.srvIp} -ErrorAction Stop`);
  C(`Puerta de enlace ${S.gw} responde`, `Test-Connection ${S.gw} -Count 1 -Quiet`);
  C(`Nombre del equipo: ${S.srvNombre}`, `$env:COMPUTERNAME -eq "${limpio(S.srvNombre)}"`);
  if (PRO() && has("ip")) C("Zona horaria de Madrid", `(Get-TimeZone).Id -eq "Romance Standard Time"`);
  if (has("ad")){
    H("Active Directory");
    C("Servicio de Active Directory (NTDS)", `(Get-Service NTDS).Status -eq "Running"`);
    C(`Dominio ${S.dominio} accesible`, `Get-ADDomain -Identity "${S.dominio}" -ErrorAction Stop`);
    C("Registro SRV de LDAP publicado en el DNS", `Resolve-DnsName "_ldap._tcp.dc._msdcs.${S.dominio}" -Type SRV -Server 127.0.0.1 -ErrorAction Stop`);
    C(`OU ${raizOU()} creada`, `Get-ADOrganizationalUnit -Identity "OU=${raizOU()},${dn()}" -ErrorAction Stop`);
    C(`${parseCSV().usuarios.length} usuarios del CSV creados`, `@(Get-ADUser -Filter * -SearchBase "OU=${raizOU()},${dn()}").Count -ge ${parseCSV().usuarios.length}`);
    if (PRO()){
      C("Papelera de AD activada", `(Get-ADOptionalFeature -Filter "Name -eq 'Recycle Bin Feature'").EnabledScopes`);
      C(`Segundo controlador ${S.srv2Nombre}`, `Get-ADDomainController -Identity "${S.srv2Nombre}" -ErrorAction Stop`);
    }
  }
  if (has("dns") || has("ad")){
    H("DNS");
    C("Servicio DNS en marcha", `(Get-Service DNS).Status -eq "Running"`);
    C(`Zona directa ${S.dominio}`, `Get-DnsServerZone -Name "${S.dominio}" -ErrorAction Stop`);
    if (has("dns")) C(`Zona inversa ${z.nombre}`, `Get-DnsServerZone -Name "${z.nombre}" -ErrorAction Stop`);
    C(`Resuelve ${fqdn()}`, `(Resolve-DnsName "${fqdn()}" -Server 127.0.0.1 -Type A -DnsOnly -ErrorAction Stop).IPAddress -contains "${S.srvIp}"`);
    if (has("dns")){
      C(`Resolución inversa de ${S.srvIp}`, `Resolve-DnsName ${S.srvIp} -Server 127.0.0.1 -DnsOnly -ErrorAction Stop`);
      registrosDNS().filter(r => r.tipo === "A").forEach(r => C(`Resuelve ${r.nombre}.${S.dominio}`, `(Resolve-DnsName "${r.nombre}.${S.dominio}" -Server 127.0.0.1 -Type A -DnsOnly -ErrorAction Stop).IPAddress -contains "${r.valor}"`));
    }
    C("Reenviadores (resuelve google.com)", `Resolve-DnsName google.com -Server 127.0.0.1 -DnsOnly -ErrorAction Stop`);
    if (PRO() && has("dns")) C("Limpieza de registros activada", `(Get-DnsServerScavenging).ScavengingState`);
  }
  if (has("dhcp")){
    H("DHCP");
    C("Servicio DHCP en marcha", `(Get-Service DHCPServer).Status -eq "Running"`);
    C(`Ámbito ${d.redTxt} activo`, `(Get-DhcpServerv4Scope -ScopeId ${d.redTxt} -ErrorAction Stop).State -eq "Active"`);
    if (has("ad")) C("DHCP autorizado en Active Directory", `Get-DhcpServerInDC | Where-Object IPAddress -eq "${S.srvIp}"`);
    S.reservas.forEach(r => C(`Reserva ${r.ip} (${limpio(r.nombre)})`, `Get-DhcpServerv4Reservation -IPAddress ${r.ip} -ErrorAction Stop`));
    if (PRO() && S.dhcpFailover) C(`Conmutación por error con ${S.srv2Nombre}`, `Get-DhcpServerv4Failover -Name "failover-lan" -ErrorAction Stop`);
  }
  if (has("gpo")){
    H("Directivas de grupo");
    if (S.gpoPanel || S.gpoCmd || S.gpoFondo || S.gpoBloqueo) C("GPO de usuario creada y vinculada", `(Get-GPInheritance -Target "${ouUsuarios()}").GpoLinks.DisplayName -contains "ASIRkit - Restricciones de usuario"`);
    if (S.gpoUsb || PRO()) C("GPO de equipo creada y vinculada", `(Get-GPInheritance -Target "${ouEquipos()}").GpoLinks.DisplayName -contains "ASIRkit - Seguridad de equipos"`);
    C(`Contraseñas de ${PRO() ? 12 : 8}+ caracteres`, `(Get-ADDefaultDomainPasswordPolicy).MinPasswordLength -ge ${PRO() ? 12 : 8}`);
  }
  if (has("ficheros")){
    H("Ficheros");
    carpetas().forEach(x => C(`Recurso \\\\${S.srvNombre}\\${x.nombre}`, `Get-SmbShare -Name "${x.nombre}" -ErrorAction Stop`));
    C("SMBv1 desactivado", "-not (Get-SmbServerConfiguration).EnableSMB1Protocol");
  }
  if (has("web")){
    H("Web");
    C(`Sitio ${S.webHost} iniciado`, `(Get-Website -Name "${limpio(S.webHost)}").State -eq "Started"`);
    C(`http://${webFqdn()} responde`, `(Invoke-WebRequest "http://${webFqdn()}" -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue).StatusCode -in 200, 301, 302`);
    if (PRO()) C("Enlace HTTPS en el puerto 443", `Get-WebBinding -Name "${limpio(S.webHost)}" -Protocol https`);
  }
  if (has("ftp")){
    H("FTP");
    C("Servicio FTP en marcha", `(Get-Service ftpsvc).Status -eq "Running"`);
    C("Escuchando en el puerto 21", "Get-NetTCPConnection -LocalPort 21 -State Listen -ErrorAction Stop");
  }
  if (has("ssh")){
    H("SSH");
    C("Servicio sshd en marcha", `(Get-Service sshd).Status -eq "Running"`);
    C(`Escuchando en el puerto ${+S.sshPuerto || 22}`, `Get-NetTCPConnection -LocalPort ${+S.sshPuerto || 22} -State Listen -ErrorAction Stop`);
  }
  if (has("firewall")){
    H("Cortafuegos");
    C("Cortafuegos activo en todos los perfiles", "-not (Get-NetFirewallProfile | Where-Object Enabled -eq $false)");
    C("Reglas de ASIRkit creadas", 'Get-NetFirewallRule -Name "ASIRkit-*" -ErrorAction Stop');
  }
  if (has("backup")){
    H("Copias");
    if (PRO()) C("Copia programada configurada", "Get-WBPolicy");
    C("Hay al menos una copia en los últimos 2 días", "(Get-WBSummary).LastSuccessfulBackupTime -gt (Get-Date).AddDays(-2)");
  }
  return L(cabeceraPS("Verificación del servidor: dice qué funciona y qué no", f),
    "$script:ok = 0; $script:fallos = 0",
    "",
    "# Ejecuta una prueba y pinta [ OK ] o [FALLO]",
    "function Comprobar([string]$Texto, [scriptblock]$Prueba) {",
    "    try { $r = & $Prueba } catch { $r = $false }",
    '    if ($r) { Write-Host "[ OK  ] $Texto" -ForegroundColor Green; $script:ok++ }',
    '    else    { Write-Host "[FALLO] $Texto" -ForegroundColor Red;   $script:fallos++ }',
    "}",
    "",
    ...c,
    "",
    'Write-Host ""',
    'Write-Host "Resultado: $script:ok correctas, $script:fallos fallos"',
    'if ($script:fallos -gt 0) { Write-Host "Mira la pestaña Comprobar de cada módulo o el Diagnóstico de errores de ASIRkit" -ForegroundColor Yellow; exit 1 }'
  );
}
function verifLinux(d, f){
  const c = [];
  const C = (t, cmd) => c.push(`comprobar "${t}" "${cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`);
  const H = t => c.push("", `# --- ${t} ---`);
  c.push("# --- Red ---");
  C(`IP ${S.srvIp}/${d.p} asignada`, `ip -4 -o addr show | grep -q ' ${S.srvIp}/${d.p} '`);
  C(`Puerta de enlace ${S.gw} responde`, `ping -c1 -W2 ${S.gw}`);
  C(`Nombre del equipo: ${host()}`, `hostname | grep -qx ${host()}`);
  if (PRO() && has("ip")) { C("Hora sincronizada (chrony)", "chronyc tracking | grep -q 'Leap status *: Normal'"); C("Zona horaria Europe/Madrid", "timedatectl show -p Timezone --value | grep -qx Europe/Madrid"); }
  if (has("dns")){
    const z = zonaInversa(d);
    H("DNS (BIND9)");
    C("Servicio named en marcha", "systemctl is-active --quiet named");
    C("named.conf sin errores", "named-checkconf");
    C(`Zona ${S.dominio} sin errores`, `named-checkzone ${S.dominio} /etc/bind/db.${S.dominio}`);
    C(`Zona ${z.nombre} sin errores`, `named-checkzone ${z.nombre} ${z.fichero}`);
    C("Escuchando en el puerto 53", "ss -tulpn | grep -q ':53 '");
    C(`Resuelve ${fqdn()}`, `dig +short @127.0.0.1 ${fqdn()} | grep -qx ${S.srvIp}`);
    C(`Resolución inversa de ${S.srvIp}`, `dig +short @127.0.0.1 -x ${S.srvIp} | grep -qx ${fqdn()}.`);
    registrosDNS().filter(r => r.tipo === "A").forEach(r => C(`Resuelve ${r.nombre}.${S.dominio}`, `dig +short @127.0.0.1 ${r.nombre}.${S.dominio} | grep -qx ${r.valor}`));
    C("Reenviadores (resuelve google.com)", "dig +short @127.0.0.1 google.com | grep -q .");
    if (PRO()) C(`El secundario ${S.srv2Ip} responde con la zona`, `dig +short @${S.srv2Ip} ${fqdn()} | grep -qx ${S.srvIp}`);
  }
  if (has("dhcp")){
    const kea = S.linuxDhcp === "kea";
    H(`DHCP (${kea ? "Kea" : "isc-dhcp-server"})`);
    C("Servicio DHCP en marcha", `systemctl is-active --quiet ${kea ? "kea-dhcp4-server" : "isc-dhcp-server"}`);
    C("Configuración DHCP válida", kea ? "kea-dhcp4 -t /etc/kea/kea-dhcp4.conf" : "dhcpd -t -cf /etc/dhcp/dhcpd.conf");
    C("Escuchando en el puerto 67/udp", "ss -ulpn | grep -q ':67 '");
  }
  if (has("ficheros")){
    H("Ficheros (Samba)");
    C("smb.conf sin errores", "testparm -s");
    C("Servicio smbd en marcha", "systemctl is-active --quiet smbd");
    carpetas().forEach(x => C(`Recurso ${x.nombre} publicado`, `smbclient -L localhost -N 2>/dev/null | grep -q '${x.nombre} '`));
  }
  if (has("web")){
    H("Web (Apache)");
    C("Configuración de Apache válida", "apache2ctl configtest");
    C("Servicio apache2 en marcha", "systemctl is-active --quiet apache2");
    C(`http://${webFqdn()} responde`, `curl -s -o /dev/null -w '%{http_code}' --resolve ${webFqdn()}:80:127.0.0.1 http://${webFqdn()}/ | grep -qE '200|301'`);
    if (PRO()) C("HTTPS responde", `curl -sk -o /dev/null -w '%{http_code}' --resolve ${webFqdn()}:443:127.0.0.1 https://${webFqdn()}/ | grep -q 200`);
  }
  if (has("ftp")){
    H("FTP (vsftpd)");
    C("Servicio vsftpd en marcha", "systemctl is-active --quiet vsftpd");
    C("vsftpd.conf sin espacios alrededor del =", "! grep -nE '^[^#]*( =|= )' /etc/vsftpd.conf");
    C("Escuchando en el puerto 21", "ss -tlpn | grep -q ':21 '");
  }
  if (has("ssh")){
    H("SSH");
    C("sshd_config sin errores", "sshd -t");
    C(`Escuchando en el puerto ${+S.sshPuerto || 22}`, `ss -tlpn | grep -q ':${+S.sshPuerto || 22} '`);
    C("Root no puede entrar", "sshd -T | grep -qx 'permitrootlogin no'");
    if (PRO()) { C("Contraseñas desactivadas", "sshd -T | grep -qx 'passwordauthentication no'"); C("Fail2ban vigilando sshd", "fail2ban-client status sshd"); }
  }
  if (has("firewall")){
    H("Cortafuegos (UFW)");
    C("UFW activo", "ufw status | grep -q 'Status: active'");
    C("Entrada denegada por defecto", "ufw status verbose | grep -q 'deny (incoming)'");
  }
  if (has("backup")){
    H("Copias");
    C("Script de copia sin errores de sintaxis", "bash -n /usr/local/sbin/copia-asirkit.sh");
    C("Copia programada en cron", "test -f /etc/cron.d/copia-asirkit");
    C("Hay una copia de los últimos 2 días", `find ${ruta(S.bkDestinoLin)} -mindepth 1 -maxdepth 1 -mtime -2 | grep -q .`);
  }
  return L(cabeceraSH("Verificación del servidor: dice qué funciona y qué no", f, false),
    "OK=0; FALLOS=0",
    "",
    "# Ejecuta una prueba y pinta [ OK ] o [FALLO]",
    "comprobar() {",
    '  if bash -c "$2" >/dev/null 2>&1; then',
    "    printf '\\033[32m[ OK  ]\\033[0m %s\\n' \"$1\"; OK=$((OK+1))",
    "  else",
    "    printf '\\033[31m[FALLO]\\033[0m %s\\n' \"$1\"; FALLOS=$((FALLOS+1))",
    "  fi",
    "}",
    "",
    ...c,
    "",
    "echo",
    'echo "Resultado: $OK correctas, $FALLOS fallos"',
    '[ "$FALLOS" -eq 0 ] || { echo "Mira la pestaña Comprobar de cada módulo o el Diagnóstico de errores de ASIRkit"; exit 1; }'
  );
}
