/* ============================================================
   Cabeceras comunes
   ============================================================ */
const nivelTxt = () => PRO() ? "nivel profesional" : "nivel clase";
const cabeceraPS = (titulo, fichero) => L(
  "# ==================================================",
  `# ${titulo}`,
  `# Proyecto: ${S.dominio} · ${S.red}/${S.prefijo} · ${S.srvNombre} (${S.srvIp}) · ${nivelTxt()}`,
  "# Generado con ASIRkit · ejecútalo en PowerShell como administrador",
  `# Guárdalo como ${fichero}`,
  "# ==================================================",
  ""
);
const cabeceraSH = (titulo, fichero, estricto = true) => L(
  "#!/usr/bin/env bash",
  "# ==================================================",
  `# ${titulo}`,
  `# Proyecto: ${S.dominio} · ${S.red}/${S.prefijo} · ${host()} (${S.srvIp}) · ${nivelTxt()}`,
  `# Generado con ASIRkit · ejecútalo con: sudo bash ${fichero}`,
  "# ==================================================",
  estricto ? "set -euo pipefail" : "set -uo pipefail",
  "",
  "# El script necesita permisos de administrador",
  `if [ "$EUID" -ne 0 ]; then echo "Ejecútalo con sudo: sudo bash ${fichero}"; exit 1; fi`,
  ""
);
const certPS = (nombre, variable = "$cert") => [
  `# Certificado autofirmado para ${nombre} (en Internet usa uno de una CA, por ejemplo con win-acme)`,
  `${variable} = Get-ChildItem Cert:\\LocalMachine\\My | Where-Object { $_.Subject -eq "CN=${nombre}" } | Select-Object -First 1`,
  `if (-not ${variable}) {`,
  `    ${variable} = New-SelfSignedCertificate -DnsName "${nombre}" -CertStoreLocation "Cert:\\LocalMachine\\My" -NotAfter (Get-Date).AddYears(2)`,
  "}"
];
const certSH = (nombre, crt, key) => [
  `# Certificado autofirmado para ${nombre} (en Internet usa certbot / Let's Encrypt)`,
  `if [ ! -f ${crt} ]; then`,
  `  openssl req -x509 -nodes -days 825 -newkey rsa:2048 -keyout ${key} -out ${crt} \\`,
  `    -subj "/CN=${nombre}" -addext "subjectAltName=DNS:${nombre}"`,
  `  chmod 600 ${key}`,
  "fi"
];

/* ============================================================
   IP estática
   ============================================================ */
function ipWindows(d, f){
  const dns = [S.srvIp, forwarders()[0] || "8.8.8.8"];
  return L(cabeceraPS("IP estática y nombre del servidor", f),
    "# Nombre de la tarjeta de red (míralo con: Get-NetAdapter)",
    `$tarjeta = "${limpio(S.ifWin)}"`,
    "",
    "# Desactiva el DHCP en la tarjeta y borra la IP y la ruta que tuviera",
    "Set-NetIPInterface -InterfaceAlias $tarjeta -Dhcp Disabled",
    "Get-NetIPAddress -InterfaceAlias $tarjeta -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false",
    "Remove-NetRoute -InterfaceAlias $tarjeta -DestinationPrefix 0.0.0.0/0 -Confirm:$false -ErrorAction SilentlyContinue",
    "",
    `# IP fija, máscara (/${d.p} = ${d.maskTxt}) y puerta de enlace`,
    `New-NetIPAddress -InterfaceAlias $tarjeta -IPAddress ${S.srvIp} -PrefixLength ${d.p} -DefaultGateway ${S.gw}`,
    "",
    "# DNS: el propio servidor primero y uno externo de reserva.",
    "# Cuando el DNS del servidor funcione, deja solo el primero (en un controlador de dominio es lo recomendado).",
    `Set-DnsClientServerAddress -InterfaceAlias $tarjeta -ServerAddresses ${dns.join(",")}`,
    PRO() ? [
      ...PROsec("Puesta a punto del servidor"),
      "# Zona horaria de la España peninsular",
      'Set-TimeZone -Id "Romance Standard Time"',
      "",
      "# Sufijo DNS de la conexión y registro automático en el DNS",
      `Set-DnsClient -InterfaceAlias $tarjeta -ConnectionSpecificSuffix "${S.dominio}" -RegisterThisConnectionsAddress $true`,
      "",
      "# Escritorio remoto activado, pero solo con autenticación a nivel de red (NLA)",
      'Set-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server" -Name fDenyTSConnections -Value 0',
      'Set-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" -Name UserAuthentication -Value 1',
      "# Reglas de Escritorio remoto (el nombre del grupo no depende del idioma)",
      'Enable-NetFirewallRule -Group "@FirewallAPI.dll,-28752"',
      "",
      "# SMBv1 es antiguo e inseguro (lo usó WannaCry): fuera",
      "Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force"
    ] : [],
    "",
    "# Cambia el nombre del equipo solo si hace falta (reinicia al terminar)",
    `if ($env:COMPUTERNAME -ne "${limpio(S.srvNombre)}") {`,
    `    Rename-Computer -NewName "${limpio(S.srvNombre)}" -Restart`,
    "}",
    "",
    "# Muestra cómo ha quedado",
    "Get-NetIPConfiguration -InterfaceAlias $tarjeta"
  );
}
function ipLinux(d, f){
  const dns = [S.srvIp, forwarders()[0] || "8.8.8.8"];
  return L(cabeceraSH("IP estática y nombre del servidor (Ubuntu Server · netplan)", f),
    "# Nombre de la tarjeta de red (míralo con: ip -br link)",
    `IFACE="${limpio(S.ifLin)}"`,
    "",
    "# Copia de seguridad de la configuración de red actual",
    "mkdir -p /root/netplan-backup",
    'for f in /etc/netplan/*.yaml; do [ -e "$f" ] && mv "$f" /root/netplan-backup/; done',
    "",
    "# Evita que cloud-init vuelva a poner la red por DHCP al reiniciar",
    'if [ -d /etc/cloud/cloud.cfg.d ]; then echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg; fi',
    "",
    `# Fichero de netplan con la IP fija /${d.p}, la puerta de enlace y los DNS`,
    "cat > /etc/netplan/01-asirkit.yaml <<'EOF'",
    "network:", "  version: 2", "  renderer: networkd", "  ethernets:",
    `    ${limpio(S.ifLin)}:`, "      dhcp4: false", "      addresses:", `        - ${S.srvIp}/${d.p}`,
    "      routes:", "        - to: default", `          via: ${S.gw}`,
    "      nameservers:", `        search: [${S.dominio}]`, `        addresses: [${dns.join(", ")}]`,
    "EOF",
    "",
    "# netplan exige que el fichero solo lo pueda leer root",
    "chmod 600 /etc/netplan/01-asirkit.yaml",
    "",
    "# Aplica la red (si estás conectado por SSH, prueba antes con: netplan try)",
    "netplan generate",
    "netplan apply",
    "",
    "# Nombre del equipo y entrada en /etc/hosts",
    `hostnamectl set-hostname ${host()}`,
    `grep -q "${S.srvIp} " /etc/hosts || echo "${S.srvIp} ${fqdn()} ${host()}" >> /etc/hosts`,
    PRO() ? [
      ...PROsec("Puesta a punto del servidor"),
      "# Zona horaria de la España peninsular",
      "timedatectl set-timezone Europe/Madrid",
      "",
      "# Hora exacta con chrony, usando el servidor del Real Observatorio de la Armada",
      "apt-get update",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y chrony unattended-upgrades",
      "mkdir -p /etc/chrony/sources.d",
      'echo "server hora.roa.es iburst" > /etc/chrony/sources.d/asirkit.sources',
      "systemctl enable --now chrony",
      "chronyc reload sources",
      "",
      "# Parches de seguridad automáticos cada día",
      "cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'",
      'APT::Periodic::Update-Package-Lists "1";',
      'APT::Periodic::Unattended-Upgrade "1";',
      "EOF"
    ] : [],
    "",
    "# Muestra cómo ha quedado",
    'ip -br addr show "$IFACE"',
    "ip route"
  );
}

/* ============================================================
   DHCP
   ============================================================ */
function dhcpWindows(d, f){
  const out = [cabeceraPS("Servidor DHCP en Windows Server", f),
    "# Instala el rol DHCP con sus herramientas de administración",
    "Install-WindowsFeature DHCP -IncludeManagementTools",
    "",
    "# Crea los grupos locales «Administradores de DHCP» y «Usuarios de DHCP»",
    "Add-DhcpServerSecurityGroup",
    "Restart-Service DHCPServer",
    ""];
  if (has("ad")) out.push(
    "# Autoriza el servidor DHCP en Active Directory.",
    "# Sin esto, en un dominio el servicio no reparte IPs.",
    "if (-not (Get-DhcpServerInDC | Where-Object IPAddress -eq \"" + S.srvIp + "\")) {",
    `    Add-DhcpServerInDC -DnsName "${fqdn()}" -IPAddress ${S.srvIp}`,
    "}", "");
  out.push(
    "# Quita el aviso de «configuración pendiente» del Administrador del servidor",
    "Set-ItemProperty -Path HKLM:\\SOFTWARE\\Microsoft\\ServerManager\\Roles\\12 -Name ConfigurationState -Value 2",
    "",
    `# Crea el ámbito ${d.cidr} si no existe todavía`,
    `if (-not (Get-DhcpServerv4Scope -ScopeId ${d.redTxt} -ErrorAction SilentlyContinue)) {`,
    "    $ambito = @{",
    `        Name          = "LAN ${d.redTxt}"`,
    `        StartRange    = "${S.dhcpIni}"`,
    `        EndRange      = "${S.dhcpFin}"`,
    `        SubnetMask    = "${d.maskTxt}"`,
    `        LeaseDuration = (New-TimeSpan -Hours ${+S.lease || 8})`,
    '        State         = "Active"',
    "    }",
    "    Add-DhcpServerv4Scope @ambito",
    "}",
    "",
    "# Opciones que reciben los clientes: puerta de enlace (003), DNS (006) y dominio (015).",
    "# -Force evita que falle si el DNS todavía no está instalado.",
    `Set-DhcpServerv4OptionValue -ScopeId ${d.redTxt} -Router ${S.gw} -DnsServer ${dnsClientes().join(",")} -DnsDomain "${S.dominio}" -Force`
  );
  if (S.reservas.length){
    out.push("", "# Reservas: siempre la misma IP para la misma MAC");
    S.reservas.forEach(r => out.push(
      `if (-not (Get-DhcpServerv4Reservation -IPAddress ${r.ip} -ErrorAction SilentlyContinue)) {`,
      `    Add-DhcpServerv4Reservation -ScopeId ${d.redTxt} -IPAddress ${r.ip} -ClientId "${macWin(r.mac)}" -Name "${limpio(r.nombre)}"`,
      "}"));
  }
  if (PRO()){
    out.push(...PROsec("Registro en DNS y detección de conflictos"),
      "# El DHCP da de alta y de baja en el DNS los nombres de los clientes",
      "Set-DhcpServerv4DnsSetting -DynamicUpdates Always -DeleteDnsRRonLeaseExpiry $true",
      "# Antes de entregar una IP hace ping para comprobar que nadie la usa",
      "Set-DhcpServerSetting -ConflictDetectionAttempts 1");
    if (S.dhcpFailover) out.push(...PROsec(`Conmutación por error con ${S.srv2Nombre} (reparto 50/50)`),
      `# Requisito: ${S.srv2Nombre} (${S.srv2Ip}) con el rol DHCP instalado${has("ad") ? " y autorizado en AD" : ""}.`,
      "# El ámbito, las opciones y las reservas se copian solos al compañero.",
      'if (-not (Get-DhcpServerv4Failover -Name "failover-lan" -ErrorAction SilentlyContinue)) {',
      '    $secreto = Read-Host "Secreto compartido entre los dos servidores DHCP"',
      "    $failover = @{",
      '        Name                = "failover-lan"',
      `        PartnerServer       = "${fqdn2()}"`,
      `        ScopeId             = "${d.redTxt}"`,
      "        LoadBalancePercent  = 50",
      "        MaxClientLeadTime   = (New-TimeSpan -Hours 1)",
      "        AutoStateTransition = $true",
      "        StateSwitchInterval = (New-TimeSpan -Hours 1)",
      "        SharedSecret        = $secreto",
      "    }",
      "    Add-DhcpServerv4Failover @failover",
      "}");
  }
  out.push("", "# Muestra el resultado",
    `Get-DhcpServerv4Scope -ScopeId ${d.redTxt} | Format-List Name, StartRange, EndRange, SubnetMask, State`,
    `Get-DhcpServerv4OptionValue -ScopeId ${d.redTxt}`);
  return L(out);
}
function dhcpLinuxIsc(d, f){
  const res = S.reservas.map(r => L(`host ${limpio(r.nombre).replace(/[^A-Za-z0-9-]/g, "")} {`, `  hardware ethernet ${macLin(r.mac)};`, `  fixed-address ${r.ip};`, "}"));
  const fo = PRO() && S.dhcpFailover;
  return L(cabeceraSH("Servidor DHCP en Ubuntu (isc-dhcp-server)", f),
    "# Aviso: ISC DHCP ya no tiene mantenimiento desde 2022. Sirve para clase,",
    "# pero en una instalación nueva de empresa es mejor Kea (cámbialo en el formulario).",
    "",
    "# Instala el servidor",
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y isc-dhcp-server",
    "",
    "# Interfaz por la que escucha (solo la de la red interna)",
    `sed -i 's/^INTERFACESv4=.*/INTERFACESv4="${limpio(S.ifLin)}"/' /etc/default/isc-dhcp-server`,
    "",
    "# Copia de seguridad del fichero original (solo la primera vez)",
    "[ -f /etc/dhcp/dhcpd.conf.orig ] || cp /etc/dhcp/dhcpd.conf /etc/dhcp/dhcpd.conf.orig",
    "",
    `# Configuración del ámbito ${d.cidr}`,
    "cat > /etc/dhcp/dhcpd.conf <<'EOF'",
    "# Generado con ASIRkit",
    `option domain-name "${S.dominio}";`,
    `option domain-name-servers ${dnsClientes().join(", ")};`,
    `default-lease-time ${(+S.lease || 8) * 3600};`,
    `max-lease-time ${(+S.lease || 8) * 3600 * 2};`,
    "authoritative;",
    fo ? ["",
      `# ── PRO · Conmutación por error con ${host2()} ──`,
      `# En ${host2()} el mismo fichero, pero con «secondary;», las direcciones al revés y sin «mclt» ni «split»`,
      'failover peer "failover-lan" {',
      "  primary;",
      `  address ${S.srvIp};`, "  port 647;",
      `  peer address ${S.srv2Ip};`, "  peer port 647;",
      "  max-response-delay 30;", "  max-unacked-updates 10;", "  load balance max seconds 3;",
      "  mclt 1800;", "  split 128;",
      "}"] : [],
    "",
    `subnet ${d.redTxt} netmask ${d.maskTxt} {`,
    `  option routers ${S.gw};`,
    `  option broadcast-address ${d.bcastTxt};`,
    fo ? ["  pool {", '    failover peer "failover-lan";', `    range ${S.dhcpIni} ${S.dhcpFin};`, "  }"] : [`  range ${S.dhcpIni} ${S.dhcpFin};`],
    "}",
    res.length ? ["", "# Reservas", ...res] : [],
    "EOF",
    "",
    "# Comprueba que la sintaxis es correcta antes de reiniciar",
    "dhcpd -t -cf /etc/dhcp/dhcpd.conf",
    "",
    "# Abre los puertos si el cortafuegos está activo",
    ufwSi("ufw allow 67/udp"),
    fo ? ufwSi(`ufw allow from ${S.srv2Ip} to any port 647 proto tcp`) : [],
    "",
    "# Arranca el servicio y lo deja activado al iniciar",
    "systemctl restart isc-dhcp-server",
    "systemctl enable isc-dhcp-server",
    "systemctl --no-pager status isc-dhcp-server"
  );
}
function dhcpLinuxKea(d, f){
  const fo = PRO() && S.dhcpFailover;
  const subnet = {
    id: 1, subnet: d.cidr,
    pools: [{ pool: `${S.dhcpIni} - ${S.dhcpFin}` }],
    "option-data": [
      { name: "routers", data: S.gw },
      { name: "domain-name-servers", data: dnsClientes().join(", ") },
      { name: "domain-name", data: S.dominio }
    ]
  };
  if (S.reservas.length) subnet.reservations = S.reservas.map(r => ({ "hw-address": macLin(r.mac), "ip-address": r.ip, hostname: limpio(r.nombre) }));
  const conf = { Dhcp4: {
    "interfaces-config": { interfaces: [limpio(S.ifLin)] },
    "lease-database": { type: "memfile", "lfc-interval": 3600 },
    "valid-lifetime": (+S.lease || 8) * 3600,
    subnet4: [subnet]
  }};
  if (PRO()){
    conf.Dhcp4.loggers = [{ name: "kea-dhcp4", severity: "INFO", output_options: [{ output: "/var/log/kea/kea-dhcp4.log", maxsize: 10485760, maxver: 5 }] }];
  }
  if (fo){
    conf.Dhcp4["hooks-libraries"] = [
      { library: "__HOOKS__/libdhcp_lease_cmds.so" },
      { library: "__HOOKS__/libdhcp_ha.so", parameters: { "high-availability": [{
        "this-server-name": host(), mode: "load-balancing",
        "heartbeat-delay": 10000, "max-response-delay": 60000, "max-ack-delay": 5000, "max-unacked-clients": 5,
        "multi-threading": { "enable-multi-threading": true, "http-dedicated-listener": true, "http-listener-threads": 0, "http-client-threads": 0 },
        peers: [
          { name: host(), url: `http://${S.srvIp}:8000/`, role: "primary", "auto-failover": true },
          { name: host2(), url: `http://${S.srv2Ip}:8000/`, role: "secondary", "auto-failover": true }
        ]
      }] } }
    ];
  }
  return L(cabeceraSH("Servidor DHCP en Ubuntu (Kea, el sucesor de ISC DHCP)", f),
    "# Instala el servidor DHCPv4 de Kea",
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y kea-dhcp4-server",
    "",
    "# Copia de seguridad del fichero original (solo la primera vez)",
    "[ -f /etc/kea/kea-dhcp4.conf.orig ] || cp /etc/kea/kea-dhcp4.conf /etc/kea/kea-dhcp4.conf.orig",
    PRO() ? [...PROsec("Registro en /var/log/kea"), "mkdir -p /var/log/kea", "chown _kea:_kea /var/log/kea 2>/dev/null || true"] : [],
    fo ? [...PROsec(`Alta disponibilidad con ${host2()} (load-balancing)`),
      `# En ${host2()} usa el mismo fichero cambiando "this-server-name" a "${host2()}".`,
      "# Busca dónde están las librerías de hooks de Kea en este sistema",
      'HA_LIB=$(find /usr/lib -name libdhcp_ha.so 2>/dev/null | head -n 1)',
      '[ -n "$HA_LIB" ] || { echo "No encuentro libdhcp_ha.so: instala los hooks de Kea de tu versión"; exit 1; }',
      'HOOKS=$(dirname "$HA_LIB")'] : [],
    "",
    `# Configuración en JSON: interfaz, ámbito ${d.cidr}, opciones y reservas`,
    "cat > /etc/kea/kea-dhcp4.conf <<'EOF'",
    JSON.stringify(conf, null, 2),
    "EOF",
    fo ? ['sed -i "s#__HOOKS__#$HOOKS#g" /etc/kea/kea-dhcp4.conf'] : [],
    "",
    "# Comprueba que la configuración es válida antes de reiniciar",
    "kea-dhcp4 -t /etc/kea/kea-dhcp4.conf",
    "",
    "# Abre los puertos si el cortafuegos está activo",
    ufwSi("ufw allow 67/udp"),
    fo ? ufwSi(`ufw allow from ${S.srv2Ip} to any port 8000 proto tcp`) : [],
    "",
    "# Arranca el servicio y lo deja activado al iniciar",
    "systemctl restart kea-dhcp4-server",
    "systemctl enable kea-dhcp4-server",
    "systemctl --no-pager status kea-dhcp4-server"
  );
}

/* ============================================================
   DNS
   ============================================================ */
function registrosDNS(){
  const vistos = new Set([host() + "|A", ...(usaSrv2() ? [host2() + "|A"] : [])]);
  return S.registros.filter(r => {
    const k = String(r.nombre).toLowerCase() + "|" + r.tipo;
    if (vistos.has(k) && r.tipo !== "MX") return false;
    vistos.add(k); return true;
  });
}
function destinoFQDN(v){ v = String(v).trim(); if (v.endsWith(".")) return v.slice(0, -1); return v.includes(".") ? v : `${v}.${S.dominio}`; }
const destinoBind = v => { v = String(v).trim(); return v.includes(".") ? (v.endsWith(".") ? v : v + ".") : v; };
function dnsWindows(d, f){
  const z = zonaInversa(d), zona = S.dominio, ad = has("ad"), s2 = usaSrv2();
  const almac = ad ? '-ReplicationScope "Domain" -DynamicUpdate Secure' : null;
  const A = (n, ip, ptr) => [
    `if (-not (Get-DnsServerResourceRecord -ZoneName "${zona}" -Name "${n}" -RRType A -ErrorAction SilentlyContinue)) {`,
    `    Add-DnsServerResourceRecordA -ZoneName "${zona}" -Name "${n}" -IPv4Address ${ip}${ptr ? " -CreatePtr" : ""}`, "}"];
  const out = [cabeceraPS("Servidor DNS en Windows Server", f),
    `# Instala el rol DNS${ad ? " (si ya creaste el dominio, ya está instalado y no hace nada)" : ""}`,
    "Install-WindowsFeature DNS -IncludeManagementTools",
    "",
    ad ? "# Zonas integradas en Active Directory: se replican solas a los demás controladores de dominio"
       : "# Zonas guardadas en fichero (C:\\Windows\\System32\\dns)",
    "# Zona directa: nombre -> IP",
    `if (-not (Get-DnsServerZone -Name "${zona}" -ErrorAction SilentlyContinue)) {`,
    `    Add-DnsServerPrimaryZone -Name "${zona}" ${almac || `-ZoneFile "${zona}.dns"`}`,
    "}",
    "",
    `# Zona inversa: IP -> nombre${d.p % 8 ? ` (se crea como /${z.n*8}, porque las zonas inversas van por octetos)` : ""}`,
    `if (-not (Get-DnsServerZone -Name "${z.nombre}" -ErrorAction SilentlyContinue)) {`,
    `    Add-DnsServerPrimaryZone -NetworkId "${z.networkId}" ${almac || `-ZoneFile "${z.nombre}.dns"`}`,
    "}",
    "",
    "# Registro A del servidor con su PTR en la zona inversa",
    ...A(host(), S.srvIp, true),
    s2 ? [`# Registro del segundo servidor (${S.srv2Nombre})`, ...A(host2(), S.srv2Ip, true)] : []];
  const regs = registrosDNS();
  if (regs.length) out.push("", "# Resto de registros del proyecto");
  regs.forEach(r => {
    const n = limpio(r.nombre);
    if (r.tipo === "A") out.push(...A(n, r.valor, z.contiene(r.valor)));
    else if (r.tipo === "CNAME") out.push(
      `if (-not (Get-DnsServerResourceRecord -ZoneName "${zona}" -Name "${n}" -RRType CName -ErrorAction SilentlyContinue)) {`,
      `    Add-DnsServerResourceRecordCName -ZoneName "${zona}" -Name "${n}" -HostNameAlias "${destinoFQDN(r.valor)}"`, "}");
    else if (r.tipo === "MX") out.push(`# Correo: los mensajes para @${zona} van a ${destinoFQDN(r.valor)} (prioridad 10)`,
      `if (-not (Get-DnsServerResourceRecord -ZoneName "${zona}" -Name "${n}" -RRType MX -ErrorAction SilentlyContinue)) {`,
      `    Add-DnsServerResourceRecordMX -ZoneName "${zona}" -Name "${n === "@" ? "." : n}" -MailExchange "${destinoFQDN(r.valor)}" -Preference 10`, "}");
  });
  out.push("", "# Reenviadores: lo que el servidor no conoce lo pregunta fuera",
    `Set-DnsServerForwarder -IPAddress ${forwarders().join(",")}`);
  if (PRO()){
    out.push(...PROsec("Limpieza de registros caducados (scavenging)"),
      "# Borra los registros dinámicos de equipos que llevan más de 14 días sin renovarse",
      "Set-DnsServerScavenging -ScavengingState $true -ScavengingInterval 7.00:00:00 -RefreshInterval 7.00:00:00 -NoRefreshInterval 7.00:00:00 -ApplyOnAllZones",
      ...PROsec("Transferencias de zona"),
      ad ? ["# Con AD las zonas se replican por el propio dominio: no se permite transferirlas a nadie",
            `Set-DnsServerPrimaryZone -Name "${zona}" -SecureSecondaries NoTransfer`,
            `Set-DnsServerPrimaryZone -Name "${z.nombre}" -SecureSecondaries NoTransfer`]
         : [`# Solo ${S.srv2Nombre} (${S.srv2Ip}) puede copiar las zonas, y se le avisa de cada cambio`,
            `Set-DnsServerPrimaryZone -Name "${zona}" -SecureSecondaries TransferToSecureServers -SecondaryServers ${S.srv2Ip} -Notify NotifyServers -NotifyServers ${S.srv2Ip}`,
            `Set-DnsServerPrimaryZone -Name "${z.nombre}" -SecureSecondaries TransferToSecureServers -SecondaryServers ${S.srv2Ip} -Notify NotifyServers -NotifyServers ${S.srv2Ip}`,
            "# Añade el secundario como servidor de nombres (NS) de las zonas",
            `Add-DnsServerResourceRecord -ZoneName "${zona}" -NS -Name "@" -NameServer "${fqdn2()}" -ErrorAction SilentlyContinue`,
            `Add-DnsServerResourceRecord -ZoneName "${z.nombre}" -NS -Name "@" -NameServer "${fqdn2()}" -ErrorAction SilentlyContinue`],
      ...PROsec("Limitación de respuestas (frena ataques de amplificación DNS)"),
      "Set-DnsServerResponseRateLimiting -Mode Enable -Force");
  }
  out.push("", "# Prueba rápida contra el propio servidor",
    `Resolve-DnsName ${fqdn()} -Server 127.0.0.1`,
    `Resolve-DnsName ${S.srvIp} -Server 127.0.0.1`);
  return L(out);
}
function dnsWindowsSecundario(d, f){
  const z = zonaInversa(d);
  return L(cabeceraPS(`DNS secundario en ${S.srv2Nombre}`, f),
    `# Se ejecuta en ${S.srv2Nombre} (${S.srv2Ip}), con IP fija ya puesta`,
    "Install-WindowsFeature DNS -IncludeManagementTools",
    "",
    `# Copias de solo lectura de las zonas de ${S.srvNombre}`,
    `if (-not (Get-DnsServerZone -Name "${S.dominio}" -ErrorAction SilentlyContinue)) {`,
    `    Add-DnsServerSecondaryZone -Name "${S.dominio}" -ZoneFile "${S.dominio}.dns" -MasterServers ${S.srvIp}`,
    "}",
    `if (-not (Get-DnsServerZone -Name "${z.nombre}" -ErrorAction SilentlyContinue)) {`,
    `    Add-DnsServerSecondaryZone -Name "${z.nombre}" -ZoneFile "${z.nombre}.dns" -MasterServers ${S.srvIp}`,
    "}",
    "",
    "# Mismos reenviadores que el principal",
    `Set-DnsServerForwarder -IPAddress ${forwarders().join(",")}`,
    "",
    "# Fuerza la primera copia y comprueba",
    `Start-DnsServerZoneTransfer -Name "${S.dominio}" -FullTransfer`,
    `Resolve-DnsName ${fqdn()} -Server 127.0.0.1`
  );
}
function dnsLinux(d, f){
  const z = zonaInversa(d), zona = S.dominio, s2 = usaSrv2() && PRO();
  const pad = s => String(s).padEnd(16, " ");
  const soa = [
    "$TTL    86400",
    `@       IN      SOA     ${fqdn()}. admin.${zona}. (`,
    `                        ${hoySerial()} ; Serie (súbelo cada vez que cambies la zona)`,
    "                        3600       ; Refresh", "                        1800       ; Retry",
    "                        604800     ; Expire", "                        86400 )    ; TTL negativo",
    `@       IN      NS      ${fqdn()}.`,
    ...(s2 ? [`@       IN      NS      ${fqdn2()}.`] : [])];
  const regs = registrosDNS();
  const directa = [...soa, `${pad(host())}IN      A       ${S.srvIp}`, ...(s2 ? [`${pad(host2())}IN      A       ${S.srv2Ip}`] : [])];
  regs.forEach(r => {
    const v = String(r.valor).trim();
    if (r.tipo === "A") directa.push(`${pad(r.nombre)}IN      A       ${v}`);
    if (r.tipo === "CNAME") directa.push(`${pad(r.nombre)}IN      CNAME   ${destinoBind(v)}`);
    if (r.tipo === "MX") directa.push(`${pad(r.nombre)}IN      MX      10 ${destinoBind(v)}`);
  });
  const inversa = [...soa, `${pad(z.etiqueta(S.srvIp))}IN      PTR     ${fqdn()}.`, ...(s2 ? [`${pad(z.etiqueta(S.srv2Ip))}IN      PTR     ${fqdn2()}.`] : [])];
  regs.filter(r => r.tipo === "A" && z.contiene(r.valor)).forEach(r => inversa.push(`${pad(z.etiqueta(r.valor))}IN      PTR     ${r.nombre}.${zona}.`));
  const extra = s2 ? [`    allow-transfer { ${S.srv2Ip}; };`, `    also-notify { ${S.srv2Ip}; };`, "    notify yes;"] : [];
  return L(cabeceraSH("Servidor DNS en Ubuntu (BIND9)", f),
    "# Instala BIND9 y las herramientas de prueba (dig, named-checkzone...)",
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y bind9 bind9utils bind9-dnsutils",
    "",
    "# Copia de seguridad de la configuración original (solo la primera vez)",
    "for f in named.conf.options named.conf.local; do",
    '  [ -f "/etc/bind/$f.orig" ] || cp "/etc/bind/$f" "/etc/bind/$f.orig"',
    "done",
    PRO() ? ["", "# Carpeta para el registro de consultas (AppArmor ya permite /var/log/named)", "mkdir -p /var/log/named", "chown bind:bind /var/log/named"] : [],
    "",
    "# Opciones generales: reenviadores y quién puede preguntar",
    "cat > /etc/bind/named.conf.options <<'EOF'",
    "options {",
    '    directory "/var/cache/bind";',
    `    forwarders { ${forwarders().map(x => x + ";").join(" ")} };`,
    "    dnssec-validation auto;",
    "    listen-on-v6 { any; };",
    "    recursion yes;",
    `    allow-query { localhost; ${d.cidr}; };`,
    `    allow-recursion { localhost; ${d.cidr}; };`,
    PRO() ? ["",
      "    # ── PRO · Endurecimiento ──",
      "    # Nadie puede copiar las zonas salvo que se permita en cada zona",
      "    allow-transfer { none; };",
      "    # No dice qué versión de BIND usa",
      '    version "no disponible";',
      "    # Limita respuestas repetidas (frena ataques de amplificación)",
      "    rate-limit { responses-per-second 10; };"] : [],
    "};",
    PRO() ? ["",
      "# ── PRO · Registro de consultas, con rotación ──",
      "logging {",
      '    channel consultas { file "/var/log/named/consultas.log" versions 5 size 20m; print-time yes; };',
      "    category queries { consultas; };",
      "};"] : [],
    "EOF",
    "",
    "# Declara las dos zonas: directa e inversa",
    "cat > /etc/bind/named.conf.local <<'EOF'",
    `zone "${zona}" {`, "    type master;", `    file "/etc/bind/db.${zona}";`, ...extra, "};",
    "",
    `zone "${z.nombre}" {`, "    type master;", `    file "${z.fichero}";`, ...extra, "};",
    "EOF",
    "",
    `# Zona directa ${zona}: nombre -> IP`,
    `cat > /etc/bind/db.${zona} <<'EOF'`, ...directa, "EOF",
    "",
    `# Zona inversa ${z.nombre}: IP -> nombre`,
    `cat > ${z.fichero} <<'EOF'`, ...inversa, "EOF",
    "",
    "# Comprueba la sintaxis de todo antes de reiniciar",
    "named-checkconf",
    `named-checkzone ${zona} /etc/bind/db.${zona}`,
    `named-checkzone ${z.nombre} ${z.fichero}`,
    "",
    "# Abre el puerto 53 si el cortafuegos está activo",
    ufwSi(PRO() ? `ufw allow from ${d.cidr} to any port 53` : "ufw allow 53"),
    "",
    "# Reinicia BIND (el servicio se llama named) y lo deja activado",
    "systemctl restart named",
    "systemctl enable named",
    "",
    "# Prueba rápida contra el propio servidor",
    `dig +short @127.0.0.1 ${fqdn()}`,
    `dig +short @127.0.0.1 -x ${S.srvIp}`
  );
}
function dnsLinuxSecundario(d, f){
  const z = zonaInversa(d);
  return L(cabeceraSH(`DNS secundario en ${host2()} (BIND9)`, f),
    `# Se ejecuta en ${host2()} (${S.srv2Ip}). Copia las zonas de ${host()} y las mantiene al día.`,
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y bind9 bind9utils bind9-dnsutils",
    "",
    "# Mismas opciones que el principal (reenviadores y red permitida)",
    "cat > /etc/bind/named.conf.options <<'EOF'",
    "options {", '    directory "/var/cache/bind";',
    `    forwarders { ${forwarders().map(x => x + ";").join(" ")} };`,
    "    dnssec-validation auto;", "    recursion yes;",
    `    allow-query { localhost; ${d.cidr}; };`, `    allow-recursion { localhost; ${d.cidr}; };`,
    "    allow-transfer { none; };", '    version "no disponible";',
    "};", "EOF",
    "",
    "# Zonas secundarias (en BIND moderno también se escribe «type secondary» y «primaries»)",
    "cat > /etc/bind/named.conf.local <<'EOF'",
    `zone "${S.dominio}" {`, "    type slave;", `    masters { ${S.srvIp}; };`, `    file "/var/cache/bind/db.${S.dominio}";`, "};",
    "",
    `zone "${z.nombre}" {`, "    type slave;", `    masters { ${S.srvIp}; };`, `    file "/var/cache/bind/${z.fichero.split("/").pop()}";`, "};",
    "EOF",
    "",
    "named-checkconf",
    ufwSi(`ufw allow from ${d.cidr} to any port 53`),
    "systemctl restart named",
    "systemctl enable named",
    "",
    "# Espera la primera transferencia y comprueba",
    "sleep 3",
    `dig +short @127.0.0.1 ${fqdn()}`
  );
}
