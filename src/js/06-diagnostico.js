/* ============================================================
   Diagnóstico 1: explicar un mensaje de error
   Cada entrada: patrón, qué significa, por qué pasa, cómo arreglarlo y cómo comprobarlo
   ============================================================ */
const ERRORES = [
  // --- Ficheros editados en Windows y llevados a Linux
  { re: /\$'\\r'|\\r: command not found|\r$|bad interpreter: .*\^M/im, t: "Saltos de línea de Windows (CRLF) en un fichero de Linux", s: "Ubuntu",
    q: "El fichero se guardó en Windows: cada línea acaba en \\r\\n y bash ve el \\r como parte del comando.", a: "Conviértelo a formato Linux con: sed -i 's/\\r$//' fichero (o dos2unix fichero). En VS Code, abajo a la derecha, cambia CRLF por LF.", c: "grep -c $'\\r' fichero (debe salir 0)" },
  // --- PowerShell
  { re: /running scripts is disabled|ejecución de scripts está deshabilitada|cannot be loaded because running scripts/i, t: "PowerShell no deja ejecutar scripts", s: "Windows",
    q: "La directiva de ejecución (ExecutionPolicy) de Windows bloquea los .ps1 por seguridad.", a: "Ejecuta el script con: powershell -ExecutionPolicy Bypass -File .\\script.ps1 (solo para esa vez), o pega el contenido directamente en la consola.", c: "Get-ExecutionPolicy -List" },
  { re: /is not recognized as (the name of )?a cmdlet|no se reconoce como nombre de un cmdlet|CommandNotFoundException/i, t: "Comando de PowerShell desconocido", s: "Windows",
    q: "PowerShell no encuentra ese comando: está mal escrito o su módulo no está instalado (por ejemplo, los cmdlets de DHCP solo existen después de instalar el rol con -IncludeManagementTools).", a: "Revisa la ortografía y que el rol esté instalado: Install-WindowsFeature NOMBRE -IncludeManagementTools. Para AD importa el módulo: Import-Module ActiveDirectory.", c: "Get-Command *Dhcp* | Select -First 5 ; Get-WindowsFeature | Where Installed" },
  { re: /Access is denied|Acceso denegado|UnauthorizedAccessException|requires elevation|requiere elevación/i, t: "Acceso denegado", s: "Windows",
    q: "La consola no se abrió como administrador o el usuario no tiene permisos sobre ese objeto (por ejemplo, autorizar el DHCP en AD exige ser Admin. de empresa).", a: "Abre PowerShell con clic derecho > Ejecutar como administrador. En el dominio, entra como DOMINIO\\Administrador.", c: "whoami /groups | findstr /i admin" },
  { re: /Missing closing '\}'|Falta la llave de cierre|Unexpected token|Token '.*' inesperado|Missing argument in parameter list|The string is missing the terminator|falta el terminador/i, t: "Error de sintaxis en el script de PowerShell", s: "Windows",
    q: "Falta o sobra una llave, un paréntesis o unas comillas. También pasa al copiar comillas «tipográficas» (“ ”) desde Word o una web.", a: "Busca la línea que indica el error y revisa que cada { tenga su } y cada \" su pareja. Sustituye las comillas tipográficas por comillas rectas. En Diagnóstico > Revisar un fichero puedes pegar el script.", c: "La pestaña Comprobar de cada módulo trae el comando que analiza el script con el parser de PowerShell" },
  { re: /cannot be bound to the parameter|no se puede enlazar|Cannot validate argument on parameter|No se puede validar el argumento/i, t: "Valor no válido para un parámetro", s: "Windows",
    q: "Le has dado a un parámetro un valor con el formato equivocado: una IP mal escrita, un número con letras, una ruta vacía...", a: "Mira qué parámetro nombra el error y revisa ese valor. En ASIRkit, el Plan de red marca en rojo los campos mal escritos.", c: "Get-Help NOMBRE-DEL-CMDLET -Parameter NOMBRE" },
  // --- Active Directory y dominio
  { re: /specified domain either does not exist or could not be contacted|dominio especificado no existe o no se pudo establecer contacto|DNS name does not exist/i, t: "No encuentra el dominio", s: "Windows",
    q: "El cliente no usa como DNS al controlador de dominio, así que no puede encontrar los registros SRV del dominio (_ldap._tcp.dc._msdcs).", a: `Pon como DNS del cliente la IP del servidor (${S.srvIp}) y nada más. Comprueba también que el cliente llega al servidor con ping.`, c: `Resolve-DnsName _ldap._tcp.dc._msdcs.${S.dominio} -Type SRV` },
  { re: /Clock skew too great|desfase del reloj|KRB_AP_ERR_SKEW|time.*(difference|skew)/i, t: "La hora del cliente y del servidor no coinciden", s: "Kerberos",
    q: "Kerberos rechaza la autenticación si hay más de 5 minutos de diferencia entre equipos.", a: "Sincroniza la hora con el controlador de dominio. Windows: w32tm /resync. Ubuntu: instala chrony y apúntalo al servidor.", c: "w32tm /query /status   ·   timedatectl" },
  { re: /Couldn'?t join realm|Insufficient permissions to join|realm: No such realm found|Necessary packages are not installed/i, t: "realm join no puede unir el Ubuntu al dominio", s: "Ubuntu",
    q: "Las causas más habituales son: el DNS del Ubuntu no es el controlador, faltan paquetes, la hora no coincide o el usuario no puede unir equipos.", a: "Comprueba en este orden: realm discover DOMINIO (debe listar el dominio), resolvectl status (DNS = servidor), timedatectl, y usa la cuenta Administrador del dominio.", c: `realm discover ${S.dominio}` },
  { re: /Verification of prerequisites|Fallo en la comprobación de requisitos|Install-ADDSForest.*(fail|error)|The local Administrator account becomes the domain Administrator/i, t: "Fallan los requisitos para crear el dominio", s: "Windows",
    q: "Install-ADDSForest comprueba antes: contraseña de Administrador local, IP estática, nombre del equipo y DNS.", a: "Pon contraseña segura al Administrador local (net user Administrador *), IP fija y reinicia tras cambiar el nombre. Prueba antes con Test-ADDSForestInstallation.", c: "Pestaña Comprobar del módulo Active Directory" },
  { re: /password does not meet the length, complexity|no cumple los requisitos de longitud, complejidad|PasswordComplexity/i, t: "La contraseña no cumple la directiva", s: "Windows",
    q: "El dominio exige longitud y complejidad (mayúsculas, minúsculas, números o símbolos) y que no contenga el nombre del usuario.", a: "Usa una contraseña más larga y variada, por ejemplo de 12 caracteres con los cuatro tipos.", c: "Get-ADDefaultDomainPasswordPolicy" },
  { re: /already exists|ya existe|specified account already exists|ADIdentityAlreadyExists/i, t: "Ese objeto ya existe", s: "Windows",
    q: "Estás creando algo (usuario, OU, grupo, regla, zona) que ya está creado, normalmente al ejecutar un script dos veces.", a: "Si es un script de ASIRkit, no pasa nada: comprueban si existe antes de crear. Si es tuyo, añade un if (-not (Get-...)) antes de crear.", c: "Get-ADUser / Get-ADOrganizationalUnit / Get-DnsServerZone con el nombre" },
  // --- DNS / BIND
  { re: /missing ';' before|expected ';'|unexpected end of input/i, t: "Falta un punto y coma en la configuración de BIND", s: "BIND9",
    q: "En named.conf cada opción termina en ; y cada bloque se cierra con };. El error indica fichero:línea; a veces el ; que falta está en la línea anterior.", a: "Ve a esa línea y la anterior y revisa: forwarders { 8.8.8.8; }; → dentro de las llaves cada IP lleva ; y tras la llave de cierre también.", c: "named-checkconf (silencio = correcto)" },
  { re: /unknown option '?([\w-]+)/i, t: "Opción desconocida en named.conf", s: "BIND9",
    q: "BIND no reconoce esa palabra: está mal escrita, va en el bloque que no es (zone en vez de options) o es de otra versión.", a: "Revisa la ortografía (allow-transfer, not allow_transfer) y que esté dentro del bloque correcto.", c: "named-checkconf" },
  { re: /not at top of zone|ignoring out-of-zone data/i, t: "Registro fuera de la zona", s: "BIND9",
    q: "Un nombre completo no termina en punto, así que BIND le añade el dominio otra vez (srv01.empresa.local.empresa.local) o el $ORIGIN no es el esperado.", a: "Los nombres completos en un fichero de zona siempre terminan en punto: srv01.empresa.local. Los relativos (srv01) van sin punto.", c: "named-checkzone ZONA FICHERO" },
  { re: /CNAME and other data/i, t: "Un CNAME no puede convivir con otros registros", s: "BIND9",
    q: "Un nombre que es alias (CNAME) no puede tener además un A, MX u otro registro.", a: "Deja solo el CNAME o solo el A para ese nombre. En la raíz de la zona (@) nunca se puede poner CNAME.", c: "named-checkzone ZONA FICHERO" },
  { re: /has no NS records|no NS records|NS '.*' has no address records/i, t: "Falta el NS o su registro A", s: "BIND9",
    q: "Toda zona necesita al menos un registro NS, y el servidor que nombra necesita su registro A en la zona.", a: "Añade: @ IN NS srv01.empresa.local. y srv01 IN A IP_DEL_SERVIDOR.", c: "named-checkzone ZONA FICHERO" },
  { re: /zone .* (not loaded due to errors|loading from master file .* failed)|file not found/i, t: "Una zona no se ha cargado", s: "BIND9",
    q: "El fichero de zona tiene errores o la ruta del file en named.conf.local no coincide con el fichero real. Con una zona sin cargar, las consultas dan SERVFAIL.", a: "Comprueba que la ruta existe (ls -l) y valida la zona. Revisa también los permisos: bind debe poder leerlo.", c: "named-checkconf -z" },
  { re: /status: SERVFAIL|SERVFAIL/i, t: "SERVFAIL: el servidor no pudo responder", s: "DNS",
    q: "La zona no está cargada (error en el fichero) o, si es un nombre de Internet, los reenviadores no responden o falla DNSSEC.", a: "Para tus zonas: named-checkconf -z y journalctl -u named. Para nombres externos: prueba dig @8.8.8.8 google.com desde el servidor.", c: "journalctl -u named -n 40 --no-pager" },
  { re: /status: NXDOMAIN|NXDOMAIN|Non-existent domain|DNS name does not exist|No existe el nombre DNS/i, t: "NXDOMAIN: ese nombre no existe en la zona", s: "DNS",
    q: "La zona sí carga, pero no tiene ese nombre: falta el registro, está mal escrito o estás preguntando a otro servidor DNS.", a: "Revisa el registro en la zona y que preguntas a tu servidor (dig @IP o Resolve-DnsName -Server IP). Si cambiaste la zona en BIND, ¿subiste el número de serie y recargaste?", c: "dig @127.0.0.1 nombre.dominio" },
  { re: /connection timed out; no servers could be reached|timed out.*DNS|Temporary failure in name resolution/i, t: "No se llega al servidor DNS", s: "DNS",
    q: "El servicio DNS está parado, el cortafuegos bloquea el puerto 53 o el equipo usa otra IP como DNS.", a: "Comprueba que el servicio está en marcha, que escucha en el 53 (ss -tulpn) y que el cortafuegos lo permite.", c: "systemctl status named · ss -tulpn | grep :53 · ufw status" },
  // --- DHCP
  { re: /semicolon expected/i, t: "Falta un punto y coma en dhcpd.conf", s: "ISC DHCP",
    q: "Cada opción de dhcpd.conf termina en ;. El error indica la línea, aunque a veces el fallo está en la anterior.", a: "Revisa la línea y la anterior: option routers 192.168.10.1; range 192.168.10.100 192.168.10.200;", c: "dhcpd -t -cf /etc/dhcp/dhcpd.conf" },
  { re: /No subnet declaration for (\S+)/i, t: "La tarjeta no tiene una red declarada", s: "ISC DHCP",
    q: "La IP de la tarjeta por la que escucha no pertenece a ningún subnet de dhcpd.conf (o la tarjeta no tiene IP).", a: "Comprueba que la red del bloque subnet coincide con la IP del servidor y que INTERFACESv4 es la tarjeta correcta.", c: "ip -br addr · grep INTERFACESv4 /etc/default/isc-dhcp-server" },
  { re: /Not configured to listen on any interfaces/i, t: "El DHCP no sabe por qué tarjeta escuchar", s: "ISC DHCP",
    q: "INTERFACESv4 está vacío en /etc/default/isc-dhcp-server.", a: `Pon INTERFACESv4="${S.ifLin}" (el nombre que da ip -br link).`, c: "grep INTERFACESv4 /etc/default/isc-dhcp-server" },
  { re: /DHCP4_CONFIG_LOAD_FAIL|syntax error, unexpected|Kea.*(error|fail)|expected ',' or '}'|Unexpected token .* in JSON/i, t: "Error en el JSON de Kea", s: "Kea",
    q: "El JSON tiene una coma de más (después del último elemento de una lista), una coma de menos entre elementos, o una comilla o llave sin cerrar.", a: "Mira la línea y columna que indica el error. Quita la coma tras el último elemento de cada [ ] o { }. Pega el fichero en Diagnóstico > Revisar un fichero para localizarlo.", c: "kea-dhcp4 -t /etc/kea/kea-dhcp4.conf" },
  { re: /scope.*already exists|El ámbito ya existe|DHCP 20113|is not authorized|no está autorizado/i, t: "Problema con el ámbito o la autorización del DHCP", s: "Windows",
    q: "El ámbito ya existía, o el servidor DHCP no está autorizado en AD y por eso no reparte IPs.", a: "Autoriza el servidor: Add-DhcpServerInDC -DnsName FQDN -IPAddress IP (como administrador del dominio).", c: "Get-DhcpServerInDC" },
  // --- netplan / red
  { re: /found character that cannot start any token|found a tab character|tabs are not allowed/i, t: "Tabuladores en el YAML de netplan", s: "netplan",
    q: "YAML solo admite espacios para sangrar; un tabulador rompe el fichero.", a: "Sustituye los tabuladores por 2 espacios por nivel: sed -i 's/\\t/  /g' /etc/netplan/FICHERO.yaml", c: "netplan generate" },
  { re: /mapping values are not allowed|did not find expected key|bad indentation|expected <block end>/i, t: "Sangría incorrecta en el YAML", s: "netplan",
    q: "Una clave no está alineada con sus hermanas o falta el espacio después de los dos puntos (dhcp4:false en vez de dhcp4: false).", a: "Cada nivel lleva 2 espacios más que el anterior, siempre espacio después de : y después del guion de las listas (- 192.168.10.10/24).", c: "netplan generate" },
  { re: /Permissions for .* are too open/i, t: "Permisos del fichero de netplan demasiado abiertos", s: "netplan",
    q: "Es solo un aviso: el fichero tiene datos de red y netplan quiere que solo lo lea root.", a: "chmod 600 /etc/netplan/*.yaml", c: "ls -l /etc/netplan" },
  { re: /Network is unreachable|Destination Host Unreachable|Host de destino inaccesible|General failure|Error general/i, t: "No hay ruta hasta el destino", s: "Red",
    q: "Falta la puerta de enlace, la IP o la máscara están mal, o el adaptador de la máquina virtual está en otra red.", a: "Revisa la IP y la máscara, la ruta por defecto (ip route / route print) y la red del adaptador en VirtualBox o VMware.", c: "ip route · Get-NetRoute -DestinationPrefix 0.0.0.0/0" },
  // --- Servicios systemd / apt
  { re: /Job for (\S+) failed|Failed to start|failed with result/i, t: "Un servicio no arranca", s: "Ubuntu",
    q: "systemd no da el motivo en este mensaje: casi siempre es un error en el fichero de configuración del servicio.", a: "Mira el motivo real con journalctl y valida la configuración con su comando (named-checkconf, apache2ctl configtest, sshd -t, testparm...).", c: "journalctl -xeu NOMBRE-DEL-SERVICIO --no-pager | tail -n 30" },
  { re: /Address already in use|could not bind|Only one usage of each socket address|Solo se permite un uso de cada dirección/i, t: "El puerto ya está ocupado", s: "Red",
    q: "Otro programa usa ese puerto (por ejemplo, dos servidores web o systemd-resolved en el 53).", a: "Mira qué proceso lo tiene y páralo, o cambia el puerto.", c: "ss -tulpn | grep :PUERTO · Get-NetTCPConnection -LocalPort PUERTO" },
  { re: /Could not get lock|Unable to acquire the dpkg frontend lock/i, t: "apt está ocupado", s: "Ubuntu",
    q: "Otra instalación (a menudo las actualizaciones automáticas) está usando apt en ese momento.", a: "Espera un par de minutos y repite. No borres los ficheros de bloqueo.", c: "ps aux | grep -E 'apt|dpkg'" },
  { re: /Unable to locate package|No se ha podido localizar el paquete|has no installation candidate/i, t: "Paquete no encontrado", s: "Ubuntu",
    q: "No has hecho apt update, el nombre está mal escrito o el paquete no existe en tu versión de Ubuntu.", a: "Ejecuta apt update y búscalo con apt search NOMBRE.", c: "apt update && apt search NOMBRE" },
  { re: /Permission denied(?! \(publickey)/i, t: "Permiso denegado", s: "Ubuntu",
    q: "Falta sudo o el usuario no tiene permiso sobre ese fichero o carpeta.", a: "Repite con sudo. Si es una carpeta compartida, revisa propietario, grupo y permisos con ls -l.", c: "ls -l RUTA · id USUARIO" },
  // --- Apache / IIS
  { re: /AH00526|Syntax error on line (\d+)/i, t: "Error de sintaxis en la configuración de Apache", s: "Apache",
    q: "Una directiva está mal escrita, le falta un argumento o su módulo no está activado (por ejemplo, Header sin a2enmod headers, SSLEngine sin a2enmod ssl).", a: "Ve a la línea indicada. Si la directiva es correcta, activa su módulo con a2enmod MÓDULO.", c: "apache2ctl configtest" },
  { re: /AH00558|Could not reliably determine the server's fully qualified domain name/i, t: "Aviso: Apache no sabe su nombre", s: "Apache",
    q: "No es un error: falta la directiva ServerName global.", a: "echo 'ServerName localhost' > /etc/apache2/conf-available/servername.conf && a2enconf servername", c: "apache2ctl configtest" },
  { re: /Invalid command '([^']+)'/i, t: "Directiva de Apache desconocida", s: "Apache",
    q: "Apache no conoce esa directiva: está mal escrita o su módulo no está cargado.", a: "Revisa la ortografía y activa el módulo (por ejemplo: a2enmod headers ssl rewrite).", c: "apache2ctl -M" },
  { re: /HTTP Error 500\.19|0x8007000d|config(uration)? file is invalid/i, t: "web.config de IIS no válido", s: "IIS",
    q: "El web.config tiene XML mal formado o usa una sección de un módulo que no está instalado (por ejemplo, URL Rewrite).", a: "Revisa el XML (etiquetas cerradas, comillas) e instala el módulo que falta.", c: "appcmd list config SITIO" },
  { re: /HTTP Error 404|404 Not Found/i, t: "404: la página no existe", s: "Web",
    q: "El servidor responde, pero no encuentra ese fichero: la carpeta raíz del sitio no es la que crees o falta el index.html.", a: "Comprueba DocumentRoot / PhysicalPath y que el fichero existe allí.", c: "apache2ctl -S · Get-Website" },
  // --- SSH
  { re: /Bad configuration option|Unsupported option|missing argument/i, t: "Opción de SSH mal escrita", s: "SSH",
    q: "sshd no reconoce esa palabra o le falta el valor. Las opciones distinguen mayúsculas (PermitRootLogin, no permitrootlogin=no).", a: "Formato correcto: Opción valor, separado por un espacio y sin =. Revisa la línea que indica.", c: "sshd -t" },
  { re: /Permission denied \(publickey/i, t: "El servidor solo acepta claves y la tuya no está", s: "SSH",
    q: "Has desactivado las contraseñas, pero tu clave pública no está en ~/.ssh/authorized_keys del servidor (o sus permisos están mal).", a: "Entra por consola y añade tu clave. Permisos: chmod 700 ~/.ssh y chmod 600 ~/.ssh/authorized_keys. Desde tu equipo: ssh-copy-id usuario@servidor (antes de desactivar contraseñas).", c: "ssh -v usuario@servidor (muestra qué clave prueba)" },
  { re: /REMOTE HOST IDENTIFICATION HAS CHANGED/i, t: "La huella del servidor ha cambiado", s: "SSH",
    q: "Has reinstalado el servidor (o la máquina virtual) con la misma IP y tu equipo recuerda la huella antigua. En una red real podría ser un ataque.", a: "Si sabes que reinstalaste: ssh-keygen -R IP_O_NOMBRE y vuelve a conectar.", c: "ssh-keygen -F IP_O_NOMBRE" },
  { re: /Connection refused|No se puede establecer una conexión ya que el equipo de destino denegó/i, t: "Conexión rechazada", s: "Red",
    q: "El equipo responde, pero nada escucha en ese puerto: el servicio está parado o escucha en otro puerto.", a: "Arranca el servicio y comprueba en qué puerto escucha. Si cambiaste el puerto de SSH, conecta con -p PUERTO.", c: "ss -tlpn · Get-NetTCPConnection -State Listen" },
  // --- Samba / SMB
  { re: /Unknown parameter encountered: "?([^"\n]+)/i, t: "Parámetro de Samba desconocido", s: "Samba",
    q: "testparm no reconoce esa opción: está mal escrita o es de otra versión.", a: "Revisa la ortografía (valid users, read only...). Formato: parámetro = valor.", c: "testparm -s" },
  { re: /NT_STATUS_LOGON_FAILURE|NT_STATUS_WRONG_PASSWORD/i, t: "Usuario o contraseña de Samba incorrectos", s: "Samba",
    q: "Samba tiene su propia contraseña: que el usuario exista en Linux no basta.", a: "Dale contraseña de Samba: smbpasswd -a USUARIO", c: "pdbedit -L" },
  { re: /NT_STATUS_ACCESS_DENIED/i, t: "Samba deniega el acceso", s: "Samba",
    q: "El usuario no está en valid users / el grupo, o los permisos de la carpeta en Linux no le dejan.", a: "Comprueba que el usuario es del grupo (id USUARIO) y que la carpeta es root:GRUPO con 2770.", c: "id USUARIO · ls -ld CARPETA" },
  { re: /NT_STATUS_BAD_NETWORK_NAME|network name cannot be found|No se encuentra el nombre de red/i, t: "Ese recurso compartido no existe", s: "SMB",
    q: "El nombre entre corchetes en smb.conf (o el de New-SmbShare) no coincide con el que escribes, o la ruta de la carpeta no existe.", a: "Lista los recursos y copia el nombre exacto.", c: "smbclient -L SERVIDOR -N · Get-SmbShare" },
  { re: /System error 53|error de sistema 53|network path was not found|No se ha encontrado la ruta de acceso de la red/i, t: "No encuentra el servidor de ficheros", s: "SMB",
    q: "El nombre del servidor no se resuelve, el cortafuegos bloquea el 445 o el servicio está parado.", a: "Prueba con la IP en vez del nombre. Si funciona, el problema es el DNS; si no, revisa el puerto 445.", c: "Test-NetConnection SERVIDOR -Port 445" },
  // --- FTP
  { re: /500 OOPS: vsftpd: refusing to run with writable root inside chroot/i, t: "vsftpd no quiere una carpeta raíz con escritura", s: "vsftpd",
    q: "Por seguridad, vsftpd no deja enjaular a un usuario en una carpeta en la que puede escribir.", a: "Añade allow_writeable_chroot=YES en /etc/vsftpd.conf (o quita la escritura de la carpeta raíz y usa una subcarpeta).", c: "grep chroot /etc/vsftpd.conf" },
  { re: /500 OOPS: (bad bool value|unrecognised variable|missing value)/i, t: "Línea mal escrita en vsftpd.conf", s: "vsftpd",
    q: "vsftpd es muy estricto: nada de espacios alrededor del = y los valores son YES o NO.", a: "Formato correcto: opcion=VALOR (anonymous_enable=NO). Busca espacios con: grep -nE '( =|= )' /etc/vsftpd.conf", c: "systemctl restart vsftpd && systemctl status vsftpd" },
  { re: /530 Login incorrect/i, t: "FTP: usuario o contraseña incorrectos", s: "FTP",
    q: "Usuario o contraseña mal; en vsftpd también pasa si el usuario no está en la lista permitida o su shell no está en /etc/shells.", a: "Comprueba la contraseña, la userlist (modo profesional) y la shell del usuario.", c: "getent passwd USUARIO · cat /etc/vsftpd.userlist" },
  { re: /425 |Failed to establish connection|Can't open data connection/i, t: "FTP: falla la conexión de datos", s: "FTP",
    q: "El control (puerto 21) funciona, pero el cortafuegos bloquea los puertos pasivos.", a: "Fija el rango pasivo en el servidor y ábrelo en el cortafuegos (en ASIRkit, modo profesional).", c: "ufw status · Get-NetFirewallRule -Name ASIRkit-FTP-Pasivo" },
  // --- GPO
  { re: /gpupdate.*(fail|error)|The processing of Group Policy failed|El procesamiento de la directiva de grupo ha fallado/i, t: "Las directivas no se aplican", s: "GPO",
    q: "El cliente no encuentra el controlador o no puede leer SYSVOL (DNS mal configurado, hora desfasada o red caída).", a: "Comprueba el DNS del cliente, la hora y que \\\\DOMINIO\\SYSVOL se abre. Después gpupdate /force.", c: "gpresult /r · nltest /dsgetdc:DOMINIO" }
];
function explicarError(texto){
  const t = String(texto || "");
  const res = [];
  ERRORES.forEach(e => { const m = t.match(e.re); if (m) res.push({ ...e, m }); });
  const lineas = [...t.matchAll(/(?:\b(?:line|l[ií]nea)\s*|\.(?:conf|yaml|yml|local|ps1|sh|json|options|arpa|\d+)[\w.-]*:)(\d{1,5})/gi)].map(m => +m[1]).filter(n => n > 0 && n < 100000);
  const fich = (t.match(/\/(?:etc|var|srv|usr)\/[\w./-]+/) || [])[0] || (t.match(/[A-Z]:\\[^\s:"']+/) || [])[0] || "";
  return { res, linea: lineas[0], fich };
}

/* ============================================================
   Diagnóstico 2: revisar un fichero (sintaxis + comparación)
   ============================================================ */
const TIPOS = {
  yaml: "YAML de netplan", namedconf: "named.conf (BIND)", zona: "Fichero de zona (BIND)", dhcpd: "dhcpd.conf (ISC)", json: "JSON (Kea)",
  smb: "smb.conf (Samba)", apache: "Host virtual de Apache", sshd: "sshd_config", vsftpd: "vsftpd.conf", ps: "Script de PowerShell", bash: "Script de bash"
};
function tipoDe(nombre){
  const n = String(nombre).toLowerCase();
  if (n.endsWith(".yaml") || n.endsWith(".yml")) return "yaml";
  if (n.includes("named.conf")) return "namedconf";
  if (/\/db\./.test(n)) return "zona";
  if (n.includes("dhcpd.conf")) return "dhcpd";
  if (n.includes("kea") || n.endsWith(".json")) return "json";
  if (n.includes("smb.conf")) return "smb";
  if (n.includes("apache2/sites") || n.endsWith(".conf") && n.includes("apache")) return "apache";
  if (n.includes("sshd_config") || n.includes("/ssh/")) return "sshd";
  if (n.includes("vsftpd")) return "vsftpd";
  if (n.endsWith(".ps1")) return "ps";
  if (n.endsWith(".sh")) return "bash";
  return "bash";
}
function adivinarTipo(t){
  if (/^\s*network:\s*$/m.test(t)) return "yaml";
  if (/^\s*\{\s*$/m.test(t.split("\n")[0]) && /"Dhcp4"/.test(t)) return "json";
  if (/\bIN\s+(SOA|NS|A|PTR|CNAME|MX)\b/.test(t)) return "zona";
  if (/^\s*(options|zone)\s+("[^"]*"\s*)?\{/m.test(t)) return "namedconf";
  if (/^\s*subnet\s+[\d.]+\s+netmask/m.test(t)) return "dhcpd";
  if (/^\s*\[global\]/im.test(t)) return "smb";
  if (/<VirtualHost/i.test(t)) return "apache";
  if (/^\s*(PermitRootLogin|PasswordAuthentication|Port)\s/m.test(t)) return "sshd";
  if (/^\s*(anonymous_enable|local_enable|listen)\s*=/m.test(t)) return "vsftpd";
  if (/^\s*(\$\w+\s*=|function\s+[\w-]+\s*\(|[A-Z][a-z]+-[A-Z]\w+)/m.test(t)) return "ps";
  return "bash";
}
const SSHD_OPC = "Port AddressFamily ListenAddress HostKey PermitRootLogin PasswordAuthentication PubkeyAuthentication KbdInteractiveAuthentication ChallengeResponseAuthentication UsePAM X11Forwarding PrintMotd AcceptEnv Subsystem AllowGroups AllowUsers DenyUsers DenyGroups MaxAuthTries MaxSessions LoginGraceTime ClientAliveInterval ClientAliveCountMax PermitEmptyPasswords AuthorizedKeysFile Match Include SyslogFacility LogLevel Banner TCPKeepAlive Compression UseDNS AllowTcpForwarding GatewayPorts PermitTunnel StrictModes PermitUserEnvironment".split(" ");
const VSFTPD_OPC = "listen listen_ipv6 anonymous_enable local_enable write_enable local_umask anon_upload_enable anon_mkdir_write_enable dirmessage_enable use_localtime xferlog_enable xferlog_file xferlog_std_format connect_from_port_20 chown_uploads idle_session_timeout data_connection_timeout ftpd_banner chroot_local_user chroot_list_enable chroot_list_file allow_writeable_chroot secure_chroot_dir pam_service_name rsa_cert_file rsa_private_key_file ssl_enable pasv_enable pasv_min_port pasv_max_port pasv_address userlist_enable userlist_file userlist_deny force_local_logins_ssl force_local_data_ssl ssl_ciphers require_ssl_reuse ssl_tlsv1 ssl_sslv2 ssl_sslv3 local_root user_sub_token listen_port max_clients max_per_ip hide_ids ls_recurse_enable".split(" ");

function revisar(texto, tipo){
  const out = [];
  const add = (n, nivel, msg, porque) => out.push({ n, nivel, msg, porque });
  const lineas = String(texto).split("\n");
  // Comprobaciones comunes
  if (/\r/.test(texto) && tipo !== "ps") add(0, "err", "El fichero tiene saltos de línea de Windows (CRLF).", "En Linux provocan errores raros como $'\\r': command not found. Arréglalo con sed -i 's/\\r$//' fichero.");
  lineas.forEach((l, i) => {
    if (/[“”‘’]/.test(l)) add(i + 1, "err", "Comillas tipográficas (“ ” ‘ ’).", "Vienen de copiar desde Word o una web. Los programas solo entienden comillas rectas \" y '.");
    if (/ /.test(l)) add(i + 1, "warn", "Espacio no separable (invisible).", "Se cuela al copiar de webs y algunos programas no lo reconocen como espacio. Bórralo y escribe un espacio normal.");
  });
  const llaves = (abre, cierra, nombre) => {
    let pila = [];
    lineas.forEach((l, i) => {
      const s = l.replace(/(["'])(?:\\.|(?!\1).)*\1/g, "").replace(/(^|\s)(#|\/\/).*$/, "");
      for (const ch of s){ if (ch === abre) pila.push(i + 1); else if (ch === cierra){ if (!pila.length) add(i + 1, "err", `Sobra un «${cierra}».`, `Hay un ${nombre} de cierre sin su apertura.`); else pila.pop(); } }
    });
    pila.forEach(n => add(n, "err", `Este «${abre}» no se cierra.`, `Cada ${nombre} que se abre tiene que cerrarse con «${cierra}».`));
  };
  switch (tipo){
    case "yaml":
      lineas.forEach((l, i) => {
        const n = i + 1;
        if (/^\s*#/.test(l) || !l.trim()) return;
        if (/\t/.test(l)) add(n, "err", "Tabulador en la sangría.", "YAML solo admite espacios para sangrar.");
        const sang = l.match(/^ */)[0].length;
        if (sang % 2) add(n, "warn", `Sangría de ${sang} espacios.`, "netplan usa múltiplos de 2. Una sangría impar suele descolocar la clave en otro nivel.");
        if (/^\s*[\w-]+:\S/.test(l) && !/^\s*[\w-]+:\/\//.test(l)) add(n, "err", "Falta el espacio después de los dos puntos.", "En YAML es «clave: valor», con espacio. Sin él no se entiende como clave.");
        if (/^\s*-\S/.test(l)) add(n, "err", "Falta el espacio después del guion.", "Los elementos de una lista son «- valor».");
        const ip = l.match(/-\s*(\d+\.\d+\.\d+\.\d+)\s*$/);
        if (ip && /addresses/.test(lineas.slice(Math.max(0, i - 3), i).join(" "))) add(n, "err", `La dirección ${ip[1]} no lleva máscara.`, "En addresses hay que poner la máscara en formato CIDR: 192.168.10.10/24.");
        if (/gateway4\s*:/.test(l)) add(n, "warn", "gateway4 está obsoleto.", "En netplan moderno se usa routes: - to: default  via: IP.");
      });
      break;
    case "json": {
      const limpioJ = texto.replace(/^\s*(#|\/\/).*$/gm, "");
      try { const j = JSON.parse(limpioJ);
        if (j.Dhcp4){
          (j.Dhcp4.subnet4 || []).forEach((s, k) => { if (!s.subnet) add(0, "err", `El subnet número ${k + 1} no tiene "subnet".`, "Cada elemento de subnet4 necesita la red en formato CIDR."); });
          if (!j.Dhcp4["interfaces-config"]) add(0, "warn", "Falta interfaces-config.", "Sin él, Kea no sabe por qué tarjeta escuchar.");
        }
      } catch(e){
        const m = String(e.message).match(/position (\d+)/) || String(e.message).match(/line (\d+)/);
        let n = 0;
        if (m && /position/.test(m[0])) n = limpioJ.slice(0, +m[1]).split("\n").length;
        else if (m) n = +m[1];
        add(n, "err", "El JSON no es válido: " + e.message, "Lo más habitual: una coma después del último elemento de una lista o un objeto, una coma que falta entre dos elementos, o comillas sin cerrar.");
      }
      lineas.forEach((l, i) => { if (/,\s*$/.test(l) && /^\s*[\]}]/.test(lineas[i + 1] || "")) add(i + 1, "err", "Coma antes de cerrar.", "En JSON no puede haber coma después del último elemento."); });
      break; }
    case "namedconf":
      llaves("{", "}", "bloque { }");
      lineas.forEach((l, i) => {
        const s = l.replace(/(\/\/|#).*$/, "").trim();
        if (!s) return;
        if (/^};?$/.test(s) && s !== "};") add(i + 1, "err", "El bloque se cierra sin punto y coma.", "En named.conf los bloques se cierran con «};».");
        if (!/[;{]$/.test(s) && !/^}/.test(s)) add(i + 1, "err", "La línea no termina en «;».", "Cada opción de named.conf termina en punto y coma.");
        const ips = s.match(/\{([^}]*)\}/);
        if (ips && ips[1].trim() && !/;\s*$/.test(ips[1].trim())) add(i + 1, "err", "Falta «;» dentro de las llaves.", "Dentro de { } cada elemento lleva punto y coma: { 8.8.8.8; 1.1.1.1; };");
        if (/file\s+"[^"]*"/.test(s) && !/file\s+"\//.test(s)) add(i + 1, "warn", "Ruta de fichero relativa.", "Se buscará en /var/cache/bind. Si tu zona está en /etc/bind, pon la ruta completa.");
      });
      break;
    case "zona": {
      if (!/^\$TTL/m.test(texto)) add(1, "warn", "Falta $TTL.", "Sin $TTL, BIND usa el del SOA y avisa. Ponlo en la primera línea: $TTL 86400");
      if (!/\bSOA\b/.test(texto)) add(1, "err", "Falta el registro SOA.", "Toda zona empieza con un SOA (servidor principal, correo del responsable y tiempos).");
      if (!/\bNS\b/.test(texto)) add(1, "err", "Falta el registro NS.", "La zona necesita al menos un servidor de nombres: @ IN NS srv01.dominio.");
      llaves("(", ")", "paréntesis");
      const nombres = {};
      lineas.forEach((l, i) => {
        const s = l.replace(/;.*$/, "").trim(), n = i + 1;
        if (!s || s.startsWith("$")) return;
        const m = s.match(/^(\S+)?\s*(?:\d+\s+)?IN\s+(SOA|NS|A|AAAA|PTR|CNAME|MX|TXT|SRV)\s+(.+)$/i) || l.match(/^()\s+(?:\d+\s+)?IN\s+(SOA|NS|A|AAAA|PTR|CNAME|MX|TXT|SRV)\s+(.+)$/i);
        if (!m){ if (/\bIN\b/i.test(s)) add(n, "warn", "No entiendo este registro.", "Formato: nombre IN TIPO valor. Revisa el orden y que no falte el tipo."); return; }
        const [, nom, tipoR, val] = m, T = tipoR.toUpperCase(), v = val.trim().split(/\s+/);
        if (nom){ nombres[nom.toLowerCase()] = nombres[nom.toLowerCase()] || []; nombres[nom.toLowerCase()].push({ T, n }); }
        const fq = x => x && x.includes(".") && !/^\d+(\.\d+){3}$/.test(x) && !x.endsWith(".");
        if (T === "SOA" && (fq(v[0]) || fq(v[1]))) add(n, "err", "Nombre del SOA sin punto final.", "En el SOA el servidor y el correo van completos y acabados en punto: srv01.empresa.local. admin.empresa.local.");
        if (["NS", "CNAME", "PTR"].includes(T) && fq(v[0])) add(n, "err", `«${v[0]}» no termina en punto.`, `Sin el punto final, BIND le añade el dominio: quedaría ${v[0]}.${S.dominio}. Escribe ${v[0]}.`);
        if (T === "MX"){ if (!/^\d+$/.test(v[0])) add(n, "err", "Al MX le falta la prioridad.", "Formato: @ IN MX 10 mail"); else if (fq(v[1])) add(n, "err", `«${v[1]}» no termina en punto.`, "Los nombres completos en una zona acaban en punto."); }
        if (T === "A" && (!/^\d+(\.\d+){3}$/.test(v[0]) || ipToInt(v[0]) === null)) add(n, "err", `«${v[0]}» no es una IPv4 válida.`, "Un registro A apunta siempre a una IP.");
        if (T === "PTR" && /^\d+(\.\d+){3}$/.test(v[0])) add(n, "err", "Un PTR apunta a un nombre, no a una IP.", "Formato en la zona inversa: 10 IN PTR srv01.empresa.local.");
      });
      Object.entries(nombres).forEach(([k, arr]) => { if (arr.some(x => x.T === "CNAME") && arr.length > 1) add(arr[0].n, "err", `«${k}» tiene un CNAME y otros registros.`, "Un alias (CNAME) no puede tener ningún otro registro con el mismo nombre."); });
      const serie = texto.match(/\(\s*(\d+)/);
      if (serie && serie[1].length !== 10) add(0, "tip", `El número de serie ${serie[1]} no sigue el formato AAAAMMDDNN.`, "No es obligatorio, pero ese formato ayuda a acordarse de subirlo cada vez que cambias la zona.");
      break; }
    case "dhcpd":
      llaves("{", "}", "bloque { }");
      lineas.forEach((l, i) => {
        const s = l.replace(/#.*$/, "").trim();
        if (!s) return;
        if (!/[;{}]$/.test(s)) add(i + 1, "err", "La línea no termina en «;».", "En dhcpd.conf cada opción termina en punto y coma (semicolon expected).");
        if (/^range\s/.test(s) && !/^range\s+[\d.]+\s+[\d.]+\s*;/.test(s)) add(i + 1, "err", "El range no tiene el formato correcto.", "Formato: range 192.168.10.100 192.168.10.200;  (dos IPs separadas por un espacio)");
        if (/hardware ethernet\s+([\w:-]+)/.test(s) && !/hardware ethernet\s+([0-9a-f]{2}:){5}[0-9a-f]{2};/i.test(s)) add(i + 1, "err", "MAC con formato incorrecto.", "En dhcpd.conf la MAC va con dos puntos: 00:15:5d:0a:01:32");
        if (/option routers\s+[\d.]+\s*,/.test(s) === false && /option domain-name-servers\s+[\d.]+\s+[\d.]+/.test(s)) add(i + 1, "err", "Varios DNS sin coma.", "Separa varias IPs con comas: option domain-name-servers 192.168.10.10, 8.8.8.8;");
      });
      break;
    case "smb": {
      let enSeccion = false;
      lineas.forEach((l, i) => {
        const s = l.replace(/^\s*[#;].*$/, "").trim(), n = i + 1;
        if (!s) return;
        if (/^\[.*\]$/.test(s)) { enSeccion = true; return; }
        if (!enSeccion) add(n, "err", "Opción fuera de una sección.", "Todo en smb.conf va debajo de una sección: [global] o [NombreDelRecurso].");
        if (!/^[a-z0-9: ]+\s*=\s*.+$/i.test(s)) add(n, "err", "Formato incorrecto.", "Cada línea es «parámetro = valor». Revisa el = y que el valor no esté vacío.");
        if (/valid users\s*=\s*[^@]*\b(ventas|informatica|rrhh|comun)\b/i.test(s)) add(n, "warn", "¿Es un grupo? Le falta la @.", "En valid users, los grupos se escriben con @delante: valid users = @ventas");
        if (/^(writeable|writable|read only|browseable|guest ok)\s*=\s*(si|sí|true1)\s*$/i.test(s)) add(n, "err", "Valor no válido.", "Usa yes o no.");
      });
      break; }
    case "apache": {
      const pila = [];
      lineas.forEach((l, i) => {
        const s = l.trim(), n = i + 1;
        const ab = s.match(/^<(\w+)[\s>]/), ci = s.match(/^<\/(\w+)>/);
        if (ab && !ci) pila.push({ t: ab[1], n });
        if (ci){ const top = pila.pop(); if (!top) add(n, "err", `Sobra </${ci[1]}>.`, "Cierre sin apertura."); else if (top.t.toLowerCase() !== ci[1].toLowerCase()) add(n, "err", `Se cierra </${ci[1]}> pero estaba abierto <${top.t}> (línea ${top.n}).`, "Las etiquetas se cierran en orden inverso a como se abren."); }
        if (/^Header\s/.test(s) && !/headers/.test(texto)) add(n, "tip", "Header necesita el módulo headers.", "Actívalo con a2enmod headers, o apache2ctl configtest dará Invalid command 'Header'.");
        if (/^SSLEngine\s/i.test(s)) add(n, "tip", "SSLEngine necesita el módulo ssl.", "a2enmod ssl");
        if (/^ServerName\s+\S+\s*$/.test(s) === false && /^ServerName/.test(s)) add(n, "err", "ServerName incompleto.", "Formato: ServerName intranet.empresa.local");
        if (/^(DocumentRoot|SSLCertificateFile|SSLCertificateKeyFile)\s+(?!["/$])/.test(s)) add(n, "warn", "Ruta relativa.", "Usa rutas completas que empiecen por /.");
      });
      pila.forEach(x => add(x.n, "err", `<${x.t}> no se cierra.`, `Falta </${x.t}>.`));
      if (!/ServerName/i.test(texto)) add(0, "warn", "No hay ServerName.", "Sin él, el host virtual no sabe a qué nombre responde.");
      break; }
    case "sshd":
      lineas.forEach((l, i) => {
        const s = l.replace(/#.*$/, "").trim(), n = i + 1;
        if (!s) return;
        if (/=/.test(s)) add(n, "err", "En sshd_config no se usa =.", "Formato: Opción valor (PermitRootLogin no).");
        const k = s.split(/\s+/)[0];
        const ok = SSHD_OPC.find(o => o.toLowerCase() === k.toLowerCase());
        if (!ok) add(n, "warn", `Opción «${k}» desconocida.`, "Puede estar mal escrita (Bad configuration option). Compruébalo con sshd -t.");
        if (s.split(/\s+/).length < 2) add(n, "err", "Falta el valor.", "Cada opción necesita su valor: missing argument.");
        if (/^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|X11Forwarding|UsePAM)\s+(?!yes\b|no\b|prohibit-password\b|without-password\b|forced-commands-only\b)/i.test(s)) add(n, "err", "Valor no válido.", "Usa yes o no (PermitRootLogin también admite prohibit-password).");
        if (/^Port\s+(\d+)/.test(s) && !(+s.split(/\s+/)[1] > 0 && +s.split(/\s+/)[1] < 65536)) add(n, "err", "Puerto fuera de rango.", "Entre 1 y 65535.");
      });
      break;
    case "vsftpd":
      lineas.forEach((l, i) => {
        const s = l.trim(), n = i + 1;
        if (!s || s.startsWith("#")) return;
        if (/\s=|=\s/.test(s)) add(n, "err", "Espacios alrededor del =.", "vsftpd no arranca con espacios: escribe opcion=VALOR todo junto (500 OOPS: unrecognised variable).");
        if (!/=/.test(s)) add(n, "err", "Falta el =.", "Formato: opcion=VALOR");
        const [k, v] = s.split("=").map(x => x.trim());
        if (k && !VSFTPD_OPC.includes(k)) add(n, "warn", `Opción «${k}» desconocida.`, "Puede estar mal escrita; vsftpd no arrancará.");
        if (/_(enable|ipv6)$|^listen$/.test(k) && v && !/^(YES|NO)$/.test(v)) add(n, "err", `Valor «${v}» no válido.`, "Las opciones de sí/no se escriben YES o NO en mayúsculas.");
      });
      if (/^listen=YES/m.test(texto) && /^listen_ipv6=YES/m.test(texto)) add(0, "err", "listen y listen_ipv6 activados a la vez.", "Solo uno de los dos puede ser YES: si no, vsftpd falla al arrancar (could not bind listening socket).");
      break;
    case "ps":
      llaves("{", "}", "bloque { }");
      llaves("(", ")", "paréntesis");
      lineas.forEach((l, i) => {
        const n = i + 1;
        if (/`\s+$/.test(l)) add(n, "err", "Espacio después del acento grave (`) del final.", "El ` sirve para seguir el comando en la línea siguiente, pero solo si es lo último de la línea.");
        const sinCom = l.replace(/#.*$/, "");
        if ((sinCom.match(/"/g) || []).length % 2 && !/@"|"@/.test(l)) add(n, "warn", "Número impar de comillas dobles.", "Puede faltar cerrar unas comillas (The string is missing the terminator).");
        if (/\$\w+\s*==/.test(sinCom) || /if\s*\(.*[^-]=[^=]/.test(sinCom) && !/-[a-z]+/.test(sinCom)) add(n, "warn", "¿Comparación con = o ==?", "En PowerShell se compara con -eq, -ne, -gt... El = asigna y == no existe.");
        if (/\$host\s*=/.test(sinCom)) add(n, "err", "$host es una variable reservada.", "PowerShell no te deja asignar $host. Usa otro nombre, por ejemplo $servidor.");
      });
      break;
    case "bash":
      lineas.forEach((l, i) => {
        const n = i + 1, s = l.replace(/(^|\s)#.*$/, "");
        if (/^\s*\w+\s+=\s*|^\s*\w+=\s+\S/.test(s) && !/^\s*(if|then|else|for|while|echo|test|\[)/.test(s)) add(n, "err", "Espacios alrededor del = en una variable.", "En bash es VARIABLE=valor, todo junto. Con espacios, bash intenta ejecutar VARIABLE como comando.");
        if (/\[\S|\S\]/.test(s.replace(/\[\[|\]\]|\$\{[^}]*\}|\[@\]|\w\[|\]\w|"[^"]*"|'[^']*'/g, "")) && /\bif\b|\bwhile\b/.test(s)) add(n, "warn", "¿Faltan espacios dentro de [ ]?", "Los corchetes de una condición necesitan espacios: if [ \"$A\" = 1 ]; then");
      });
      { const abiertos = [];
        lineas.forEach((l, i) => { const m = l.match(/<<-?\s*'?(\w+)'?/); if (m) abiertos.push({ tag: m[1], n: i + 1 }); else if (abiertos.length && l.trim() === abiertos[abiertos.length - 1].tag) abiertos.pop(); });
        abiertos.forEach(x => add(x.n, "err", `El bloque <<${x.tag} no se cierra.`, `Falta una línea que contenga solo ${x.tag} (sin espacios delante) para terminar el texto.`)); }
      break;
  }
  return out.sort((a, b) => a.n - b.n);
}

/* Comparación línea a línea (LCS) */
function diff(a, b){
  const A = a.split("\n").map(x => x.replace(/\s+$/, "")), B = b.split("\n").map(x => x.replace(/\s+$/, ""));
  const n = A.length, m = B.length;
  if (n * m > 400000) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m){
    if (A[i] === B[j]) { out.push({ t: "=", a: i + 1, b: j + 1, s: A[i] }); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { out.push({ t: "-", a: i + 1, s: A[i] }); i++; }
    else { out.push({ t: "+", b: j + 1, s: B[j] }); j++; }
  }
  while (i < n) { out.push({ t: "-", a: i + 1, s: A[i] }); i++; }
  while (j < m) { out.push({ t: "+", b: j + 1, s: B[j] }); j++; }
  return out;
}
/* Ficheros de referencia: cada bloque cat > RUTA <<'EOF' de los scripts de Ubuntu y cada script completo */
function ficherosGenerados(d){
  const refs = [];
  activos().forEach(id => {
    const m = MODS[id];
    if (!m || !m.salidas || !d.ok) return;
    m.salidas(d).filter(s => s.os !== "chk").forEach(s => {
      refs.push({ id: s.fichero, nombre: `${s.fichero} (script completo)`, texto: s.code, tipo: tipoDe(s.fichero) });
      const re = /cat > (\S+) <<'EOF'\n([\s\S]*?)\nEOF/g; let x;
      while ((x = re.exec(s.code))) refs.push({ id: s.fichero + ":" + x[1], nombre: `${x[1]}  ·  de ${s.fichero}`, texto: x[2], tipo: tipoDe(x[1]) });
    });
  });
  return refs;
}
