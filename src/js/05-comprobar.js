/* ============================================================
   Pestaña «Comprobar» de cada módulo
   Comandos de solo lectura para validar la sintaxis y el resultado
   ============================================================ */
function sintaxisPS(ficheros){
  return ["# 0. ANTES de ejecutar: busca errores de escritura (llaves, comillas, paréntesis...)",
    "#    Guarda el script en esta carpeta. «Sin errores» = se puede ejecutar.",
    ...ficheros.flatMap(fx => [
      "$errores = $null",
      `[System.Management.Automation.Language.Parser]::ParseFile("$PWD\\${fx}", [ref]$null, [ref]$errores) | Out-Null`,
      `if ($errores) { $errores | ForEach-Object { "${fx} · línea $($_.Extent.StartLineNumber), columna $($_.Extent.StartColumnNumber): $($_.Message)" } } else { "${fx}: sin errores de sintaxis" }`]),
    ""];
}
function sintaxisSH(ficheros){
  return ["# 0. ANTES de ejecutar: busca errores de escritura en el script",
    ...ficheros.flatMap(fx => [
      `bash -n ${fx} && echo "${fx}: sin errores de sintaxis"`,
      "# Saltos de línea de Windows (CRLF): si sale un número mayor que 0, arréglalo con: sed -i 's/\\r$//' " + fx,
      `grep -c $'\\r' ${fx}`]),
    ""];
}
const Q = (comentario, ...cmds) => ["", ...[].concat(comentario).map(c => "# " + c), ...cmds.filter(c => c !== "")];

function comprobarModulo(id, d, ficherosWin, ficherosLin){
  const z = d.ok ? zonaInversa(d) : null, kea = S.linuxDhcp === "kea", w = webFqdn(), p = +S.sshPuerto || 22;
  const W = [], X = [];
  switch (id){
    case "ip":
      W.push(...Q("Configuración IP: revisa IPv4Address, IPv4DefaultGateway y DNSServer", "Get-NetIPConfiguration -InterfaceAlias \"" + limpio(S.ifWin) + "\""),
        ...Q(["Máscara: PrefixLength debe ser " + d.p], `Get-NetIPAddress -InterfaceAlias "${limpio(S.ifWin)}" -AddressFamily IPv4 | Format-Table IPAddress, PrefixLength, PrefixOrigin`),
        ...Q("¿Llega a la puerta de enlace? (TcpTestSucceeded no aplica: mira PingSucceeded)", `Test-NetConnection ${S.gw}`),
        ...Q("¿Resuelve nombres? Si falla pero el ping a 8.8.8.8 funciona, el problema es el DNS", "Resolve-DnsName google.com", "Test-Connection 8.8.8.8 -Count 2"));
      X.push(...Q(["Valida el YAML de netplan. Silencio = correcto.", "Si hay error, dice fichero, línea y columna (casi siempre tabuladores o sangría mal)"], "netplan generate"),
        ...Q("Busca tabuladores en el YAML (netplan solo admite espacios). No debe salir nada", "grep -nP '\\t' /etc/netplan/*.yaml"),
        ...Q("Prueba la red con vuelta atrás automática a los 120 s si no confirmas (ideal por SSH)", "netplan try"),
        ...Q("Resultado: IP con /" + d.p + ", ruta por defecto y DNS", 'ip -br addr', "ip route", "resolvectl status | grep -E 'DNS Servers|DNS Domain'"),
        ...Q("¿Llega a la puerta de enlace y a Internet?", `ping -c2 ${S.gw}`, "ping -c2 8.8.8.8"));
      break;
    case "ad":
      W.push(...Q(["ANTES de crear el dominio: prueba los requisitos sin instalar nada.", "Al final debe decir Status: Success"],
          `Test-ADDSForestInstallation -DomainName "${S.dominio}" -DomainNetbiosName "${NB()}" -InstallDns -SafeModeAdministratorPassword (Read-Host -AsSecureString "DSRM")`),
        ...Q("Después: diagnóstico del controlador. Con /q solo muestra lo que falla (si no sale nada, todo bien)", "dcdiag /q"),
        ...Q("¿Se encuentra el controlador de dominio?", `nltest /dsgetdc:${S.dominio}`, `Resolve-DnsName _ldap._tcp.dc._msdcs.${S.dominio} -Type SRV`),
        ...Q("Revisa el CSV cargado: usuarios por departamento", `Get-ADUser -Filter * -SearchBase "OU=${raizOU()},${dn()}" -Properties Department | Group-Object Department | Format-Table Name, Count`),
        ...Q("¿Algún usuario desactivado o bloqueado?", `Search-ADAccount -LockedOut -SearchBase "OU=${raizOU()},${dn()}"`, `Search-ADAccount -AccountDisabled -SearchBase "OU=${raizOU()},${dn()}"`),
        PRO() ? Q("Replicación entre los dos controladores: Fails debe ser 0", "repadmin /replsummary") : []);
      X.push(...Q("En el cliente Ubuntu: ¿ve el dominio y está unido?", `realm discover ${S.dominio}`, "realm list"),
        ...Q("Estado de SSSD con el dominio (Online status: Online)", `sssctl domain-status ${S.dominio}`),
        ...Q("¿Reconoce a un usuario del dominio? Si no sale nada, revisa DNS y hora", `id ${parseCSV().usuarios[0]?.usuario || "usuario"}`),
        ...Q("Kerberos falla con más de 5 minutos de diferencia con el servidor", "timedatectl", `chronyc tracking 2>/dev/null | grep 'System time' || true`),
        ...Q("Sintaxis de sssd.conf (no debe dar errores)", "sssctl config-check"));
      break;
    case "dns":
      W.push(...Q("Zonas creadas y su tipo (Primary / Secondary, integrada en AD o no)", "Get-DnsServerZone | Format-Table ZoneName, ZoneType, IsDsIntegrated, IsReverseLookupZone"),
        ...Q("Registros de la zona: busca nombres mal escritos o IPs equivocadas", `Get-DnsServerResourceRecord -ZoneName "${S.dominio}" | Format-Table HostName, RecordType, RecordData -AutoSize`),
        ...Q("Prueba completa del servidor sobre la zona", `Test-DnsServer -IPAddress 127.0.0.1 -ZoneName "${S.dominio}"`),
        ...Q("Directa e inversa contra este servidor", `Resolve-DnsName ${fqdn()} -Server 127.0.0.1 -DnsOnly`, `Resolve-DnsName ${S.srvIp} -Server 127.0.0.1 -DnsOnly`),
        ...Q("Reenviadores y prueba hacia fuera", "Get-DnsServerForwarder", "Resolve-DnsName google.com -Server 127.0.0.1 -DnsOnly"),
        ...Q("Últimos errores del servicio DNS", 'Get-WinEvent -LogName "DNS Server" -MaxEvents 20 | Where-Object LevelDisplayName -ne "Información" | Format-List TimeCreated, Message'));
      X.push(...Q(["Sintaxis de named.conf y de sus include. Silencio = correcto.", "Si falla dice fichero:línea, por ejemplo: missing ';' before '}'"], "named-checkconf"),
        ...Q("Lo mismo, pero además carga todas las zonas (detecta errores de los ficheros db.*)", "named-checkconf -z"),
        ...Q(["Cada zona por separado. Debe terminar en: loaded serial ... OK", "Errores típicos: falta el punto final en un nombre completo, CNAME junto a otro registro"],
          `named-checkzone ${S.dominio} /etc/bind/db.${S.dominio}`, z ? `named-checkzone ${z.nombre} ${z.fichero}` : ""),
        ...Q("Pruebas reales: status: NOERROR = bien, NXDOMAIN = no existe ese nombre, SERVFAIL = la zona no cargó",
          `dig @127.0.0.1 ${fqdn()}`, `dig @127.0.0.1 -x ${S.srvIp} +short`, "dig @127.0.0.1 google.com +short"),
        ...Q("Mensajes de BIND al cargar (aquí sale por qué una zona no se carga)", "journalctl -u named -n 40 --no-pager"));
      break;
    case "dhcp":
      W.push(...Q("Ámbito: comprueba rango, máscara y que State sea Active", "Get-DhcpServerv4Scope | Format-List"),
        ...Q("Opciones que se entregan: 3 = puerta de enlace, 6 = DNS, 15 = dominio", `Get-DhcpServerv4OptionValue -ScopeId ${d.redTxt}`),
        has("ad") ? Q("¿Autorizado en AD? Si no aparece, no reparte IPs en el dominio", "Get-DhcpServerInDC") : [],
        ...Q("Uso del ámbito y concesiones entregadas", `Get-DhcpServerv4ScopeStatistics -ScopeId ${d.redTxt}`, `Get-DhcpServerv4Lease -ScopeId ${d.redTxt}`),
        ...Q("Errores recientes del servicio DHCP", 'Get-WinEvent -LogName "Microsoft-Windows-Dhcp-Server/Admin" -MaxEvents 20 -ErrorAction SilentlyContinue | Format-List TimeCreated, Message'),
        ...Q("En un CLIENTE Windows: pide IP de nuevo y mira qué recibe", "ipconfig /release", "ipconfig /renew", "ipconfig /all"));
      X.push(kea ? [
          ...Q(["Valida kea-dhcp4.conf. Si falla dice línea y columna:", "casi siempre una coma de más al final de una lista o una comilla sin cerrar"], "kea-dhcp4 -t /etc/kea/kea-dhcp4.conf"),
          ...Q("Valida solo el JSON (el error señala la línea exacta)", "python3 -m json.tool /etc/kea/kea-dhcp4.conf > /dev/null && echo 'JSON correcto'"),
          ...Q("Concesiones entregadas", "cat /var/lib/kea/kea-leases4.csv"),
          ...Q("Mensajes del servicio", "journalctl -u kea-dhcp4-server -n 40 --no-pager")]
        : [
          ...Q(["Valida dhcpd.conf. Si falla dice: line N: semicolon expected (falta un ;)", "o: No subnet declaration for enp0s3 (la red del subnet no coincide con la IP de la tarjeta)"], "dhcpd -t -cf /etc/dhcp/dhcpd.conf"),
          ...Q("Interfaz configurada", "grep INTERFACESv4 /etc/default/isc-dhcp-server"),
          ...Q("Concesiones entregadas", "cat /var/lib/dhcp/dhcpd.leases"),
          ...Q("Mensajes del servicio (DHCPDISCOVER / DHCPOFFER / DHCPACK)", "journalctl -u isc-dhcp-server -n 40 --no-pager")],
        ...Q("¿Escucha en el puerto 67/udp?", "ss -ulpn | grep ':67 '"),
        ...Q("En un CLIENTE Ubuntu: pide IP de nuevo", "sudo networkctl renew " + limpio(S.ifLin), "ip -br addr"));
      break;
    case "gpo":
      W.push(...Q("GPO creadas", "Get-GPO -All | Format-Table DisplayName, GpoStatus, ModificationTime"),
        ...Q("¿Están vinculadas donde toca? (si no aparecen aquí, no se aplican)", `Get-GPInheritance -Target "${ouUsuarios()}"`, `Get-GPInheritance -Target "${ouEquipos()}"`),
        ...Q("Política de contraseñas del dominio", "Get-ADDefaultDomainPasswordPolicy"),
        PRO() ? Q("Qué política de contraseñas se aplica de verdad a un usuario", `Get-ADUserResultantPasswordPolicy -Identity Administrador`) : [],
        ...Q(["En un CLIENTE, con un usuario del dominio:", "fuerza la aplicación y mira qué GPO le llegan (y cuáles se filtran y por qué)"], "gpupdate /force", "gpresult /r /scope:user", "gpresult /r /scope:computer"),
        ...Q("Informe detallado en HTML en el cliente", 'gpresult /h "$env:USERPROFILE\\Desktop\\gpresult.html" /f'));
      break;
    case "ficheros":
      W.push(...Q("Recursos compartidos", "Get-SmbShare | Format-Table Name, Path, FolderEnumerationMode, EncryptData"),
        ...Q("Permisos de recurso (deben ser amplios: quien manda es NTFS)", `Get-SmbShareAccess -Name "${carpetas()[0]?.nombre || "Comun"}"`),
        ...Q("Permisos NTFS: (OI)(CI)M = modificar en carpeta, subcarpetas y archivos", `icacls "${ruta(S.rutaWin)}\\${carpetas()[0]?.nombre || "Comun"}"`),
        PRO() ? Q("Cuotas y uso", "Get-FsrmQuota | Format-Table Path, Size, Usage") : [],
        ...Q("SMBv1 debe salir False", "Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol, EncryptData"),
        ...Q("Desde un CLIENTE: ¿puede abrir el recurso?", `Test-Path "\\\\${S.srvNombre}\\${carpetas()[0]?.nombre || "Comun"}"`, `net use Z: \\\\${S.srvNombre}\\${carpetas()[0]?.nombre || "Comun"}`));
      X.push(...Q(["Valida smb.conf y muestra la configuración que se aplica.", "Errores típicos: Unknown parameter encountered (parámetro mal escrito)"], "testparm -s"),
        ...Q("Usuarios dados de alta en Samba (no basta con existir en Linux)", "pdbedit -L"),
        ...Q("Permisos de las carpetas: deben ser drwxrws--- root GRUPO", `ls -ld ${ruta(S.rutaLin)}/*`),
        ...Q("Recursos que ofrece el servidor", "smbclient -L localhost -N"),
        ...Q("Prueba de acceso con un usuario (pide su contraseña de Samba)", `smbclient //localhost/${carpetas()[0]?.nombre || "Comun"} -U ${parseCSV().usuarios[0]?.usuario || "usuario"} -c 'ls'`),
        ...Q("Errores del servicio", "journalctl -u smbd -n 30 --no-pager"));
      break;
    case "web":
      W.push(...Q("Sitios y su estado", "Get-Website | Format-Table Name, State, PhysicalPath, Bindings"),
        ...Q("Enlaces (protocolo, puerto y nombre)", `Get-WebBinding -Name "${limpio(S.webHost)}"`),
        ...Q("Valida la configuración de IIS (si hay un error en web.config, sale aquí)", '& "$env:windir\\system32\\inetsrv\\appcmd.exe" list config "' + limpio(S.webHost) + '" /section:system.webServer/defaultDocument'),
        ...Q("Respuesta del sitio y cabeceras", `(Invoke-WebRequest "http://${w}" -UseBasicParsing).Headers`),
        ...Q("Registros de acceso (los errores 500 indican fallo del servidor; 404, página que no existe)", 'Get-ChildItem C:\\inetpub\\logs\\LogFiles -Recurse -Filter *.log | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content -Tail 20'));
      X.push(...Q(["Valida la sintaxis de Apache. Debe decir: Syntax OK", "Si falla: AH00526 Syntax error on line N of FICHERO"], "apache2ctl configtest"),
        ...Q("Qué host virtual responde a cada nombre (busca el tuyo y el default)", "apache2ctl -S"),
        ...Q("Módulos cargados" + (PRO() ? " (deben salir ssl_module y headers_module)" : ""), "apache2ctl -M | grep -E 'ssl|headers|rewrite' || true"),
        ...Q("Respuesta y cabeceras", `curl -I http://${w}/`, PRO() ? `curl -kI https://${w}/` : ""),
        PRO() ? Q("Certificado que entrega el servidor (CN, fechas)", `echo | openssl s_client -connect ${w}:443 -servername ${w} 2>/dev/null | openssl x509 -noout -subject -dates`) : [],
        ...Q("Últimos errores", "tail -n 20 /var/log/apache2/error.log"));
      break;
    case "ftp":
      W.push(...Q("Sitio FTP y su estado", 'Get-Website -Name "FTP" | Format-List Name, State, PhysicalPath'),
        ...Q("Reglas de autorización", 'Get-WebConfiguration "/system.ftpServer/security/authorization" -PSPath IIS:\\ -Location "FTP" | Select-Object -ExpandProperty Collection'),
        ...Q("¿Escucha en el 21?", "Test-NetConnection localhost -Port 21"),
        ...Q("Registro del FTP (530 = usuario o contraseña mal; 550 = sin permiso en la carpeta)", 'Get-ChildItem C:\\inetpub\\logs\\LogFiles -Recurse -Filter "u_ex*.log" | Where-Object FullName -like "*FTPSVC*" | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content -Tail 20'));
      X.push(...Q(["vsftpd no tiene comando de prueba y no arranca si hay espacios alrededor del =.", "Esto los busca: no debe salir nada"], "grep -nE '^[^#]*( =|= )' /etc/vsftpd.conf"),
        ...Q("Opciones con valores raros (deben ser YES, NO, números o rutas)", "grep -vE '^(#|$)' /etc/vsftpd.conf"),
        ...Q("Estado y motivo si no arranca (500 OOPS: ... explica el problema)", "systemctl status vsftpd --no-pager", "journalctl -u vsftpd -n 20 --no-pager"),
        ...Q("¿Escucha en el 21?", "ss -tlpn | grep ':21 '"),
        ...Q("Prueba de conexión" + (PRO() ? " cifrada" : ""), PRO() ? `curl -v --ssl-reqd -k ftp://localhost/ --user ${parseCSV().usuarios[0]?.usuario || "usuario"}` : `curl -v ftp://localhost/ --user ${parseCSV().usuarios[0]?.usuario || "usuario"}`));
      break;
    case "ssh":
      W.push(...Q("Valida sshd_config. Silencio = correcto", '& "$env:windir\\System32\\OpenSSH\\sshd.exe" -t'),
        ...Q("Servicio y puerto", "Get-Service sshd", `Get-NetTCPConnection -LocalPort ${p} -State Listen`),
        ...Q("Errores de OpenSSH", 'Get-WinEvent -LogName "OpenSSH/Operational" -MaxEvents 20 | Format-List TimeCreated, Message'));
      X.push(...Q(["Valida la configuración de SSH. Silencio = correcto.", "Si falla: Bad configuration option (opción mal escrita) o line N: missing argument"], "sshd -t"),
        ...Q("Configuración que se aplica de verdad (después de juntar todos los ficheros)", "sshd -T | grep -E '^(port|permitrootlogin|passwordauthentication|allowgroups|maxauthtries) '"),
        ...Q("¿Escucha en el puerto " + p + "?", `ss -tlpn | grep ':${p} '`),
        PRO() ? Q("IPs bloqueadas por Fail2ban", "fail2ban-client status sshd") : [],
        ...Q("Intentos de acceso (Accepted / Failed password / Invalid user)", "journalctl -u ssh -n 30 --no-pager"),
        ...Q("Desde tu equipo: conexión con detalle (-v muestra qué método de autenticación falla)", `ssh -v -p ${p} usuario@${fqdn()}`));
      break;
    case "firewall":
      W.push(...Q("Perfiles: Enabled True" + (PRO() ? " y DefaultInboundAction Block" : ""), "Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, LogBlocked"),
        ...Q("Reglas de ASIRkit con su puerto y origen", 'Get-NetFirewallRule -Name "ASIRkit-*" | ForEach-Object { [pscustomobject]@{ Regla = $_.DisplayName; Puerto = ($_ | Get-NetFirewallPortFilter).LocalPort; Origen = ($_ | Get-NetFirewallAddressFilter).RemoteAddress } }'),
        ...Q("Desde otro equipo: ¿llega a cada puerto?", ...puertos().filter(x => !x.soloLin && x.proto === "tcp").map(x => `Test-NetConnection ${S.srvIp} -Port ${x.port.split("-")[0]}`)),
        PRO() ? Q("Lo bloqueado (DROP) queda aquí", 'Get-Content "$env:systemroot\\system32\\LogFiles\\Firewall\\pfirewall.log" -Tail 20') : []);
      X.push(...Q("Reglas numeradas (para borrar una: ufw delete NÚMERO)", "ufw status numbered"),
        ...Q("Políticas por defecto y registro", "ufw status verbose"),
        ...Q("Reglas añadidas aunque UFW esté apagado", "ufw show added"),
        ...Q("Desde otro equipo: ¿llega a cada puerto? (succeeded = abierto)", ...puertos().filter(x => !x.soloWin && x.proto === "tcp").map(x => `nc -zv ${S.srvIp} ${x.port.split("-")[0]}`)),
        PRO() ? Q("Lo bloqueado queda en el registro como [UFW BLOCK]", "grep 'UFW BLOCK' /var/log/ufw.log | tail -n 20") : []);
      break;
    case "backup":
      W.push(...Q("Copias disponibles en el destino", `wbadmin get versions -backupTarget:${ruta(S.bkDestinoWin)}`),
        ...Q("Resultado de la última copia: LastBackupResultHR 0 = correcta", "Get-WBSummary | Format-List"),
        PRO() ? Q("Programación y qué se copia", "Get-WBPolicy | Format-List Schedule, FilesSpecsToBackup, SystemState, BMR") : [],
        ...Q("Errores de las copias", 'Get-WinEvent -LogName "Microsoft-Windows-Backup" -MaxEvents 20 | Format-List TimeCreated, Message'));
      X.push(...Q("Sintaxis del script de copia", "bash -n /usr/local/sbin/copia-asirkit.sh && echo 'Sin errores'"),
        ...Q("Línea de cron: minuto hora día mes día-semana usuario comando", "cat /etc/cron.d/copia-asirkit"),
        ...Q("Copias guardadas", `ls -lh ${ruta(S.bkDestinoLin)}`),
        PRO() ? Q("Registro de la última ejecución", "tail -n 20 /var/log/copia-asirkit.log")
              : Q("¿Se puede leer la última copia? (una copia que no se puede restaurar no sirve)", `tar -tzf "$(ls -t ${ruta(S.bkDestinoLin)}/copia-*.tar.gz | head -n 1)" | head`),
        ...Q("¿Se ejecutó cron a su hora?", "journalctl -u cron --since yesterday --no-pager | grep copia-asirkit"));
      break;
    case "verificar":
      W.push(...Q("Si una prueba sale en rojo, abre la pestaña Comprobar de ese módulo para ver el detalle."));
      X.push(...Q("Si una prueba sale en rojo, abre la pestaña Comprobar de ese módulo para ver el detalle."));
      break;
  }
  const out = [];
  if (ficherosWin.length) out.push({ os: "chk", nombre: "Comprobar · Windows", fichero: "Comandos para pegar en PowerShell", code: L(
    `# Comprobaciones del módulo ${modNombre(id)} en Windows`, "# Son comandos de solo lectura: no cambian nada. Ejecútalos uno a uno y compara con lo que dice el comentario.", "",
    ...sintaxisPS(ficherosWin), ...W), como: "Pega los comandos de uno en uno en PowerShell como administrador. Si algo no cuadra, copia el error en <b>Diagnóstico de errores</b>." });
  if (ficherosLin.length) out.push({ os: "chk", nombre: "Comprobar · Ubuntu", fichero: "Comandos para pegar en la terminal", code: L(
    `# Comprobaciones del módulo ${modNombre(id)} en Ubuntu (usa sudo si te lo pide)`, "# Son comandos de solo lectura: no cambian nada. Ejecútalos uno a uno y compara con lo que dice el comentario.", "",
    ...sintaxisSH(ficherosLin), ...X), como: "Pega los comandos de uno en uno en la terminal. Si algo no cuadra, copia el error en <b>Diagnóstico de errores</b>." });
  return out;
}
