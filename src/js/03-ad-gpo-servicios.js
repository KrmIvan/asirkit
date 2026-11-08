/* ============================================================
   Active Directory
   ============================================================ */
const raizOU = () => limpio(S.ouRaiz) || "Empresa";
const ouUsuarios = () => PRO() ? `OU=Usuarios,OU=${raizOU()},${dn()}` : `OU=${raizOU()},${dn()}`;
const ouGrupos = () => PRO() ? `OU=Grupos,OU=${raizOU()},${dn()}` : `OU=${raizOU()},${dn()}`;
const ouEquipos = () => PRO() ? `OU=Equipos,OU=${raizOU()},${dn()}` : dn();
const PS_GRUPO = "\"G_\" + (($dep.Normalize('FormD') -replace '\\p{Mn}', '') -replace '[^A-Za-z0-9]+', '_')";

function adForest(f){
  return L(cabeceraPS("Crear el dominio (nuevo bosque de Active Directory)", f),
    `# Antes de esto: IP estática (${num("ip") !== "00" && has("ip") ? "módulo " + num("ip") : "hecha a mano"}) y el nombre del servidor ya cambiado`,
    "",
    "# Instala el rol de Servicios de dominio de Active Directory",
    "Install-WindowsFeature AD-Domain-Services -IncludeManagementTools",
    "Import-Module ADDSDeployment",
    "",
    "# La contraseña de restauración (DSRM) se pide al ejecutar: nunca la escribas en el script",
    '$dsrm = Read-Host -AsSecureString "Contraseña del modo de restauración (DSRM)"',
    "",
    `# Crea el bosque ${S.dominio}, instala el DNS integrado y reinicia al terminar`,
    "$bosque = @{",
    `    DomainName                    = "${S.dominio}"`,
    `    DomainNetbiosName             = "${NB()}"`,
    "    InstallDns                    = $true",
    "    SafeModeAdministratorPassword = $dsrm",
    "    Force                         = $true",
    "}",
    "Install-ADDSForest @bosque",
    "",
    `# Tras el reinicio, entra como ${NB()}\\Administrador y ejecuta ${fich("ad", "usuarios", "ps1", "b")}`
  );
}
function adUsuarios(f){
  const { usuarios } = parseCSV();
  const deps = [...new Set(usuarios.map(u => u.depto))];
  const w = Math.max(4, ...usuarios.map(u => u.nombre.length));
  const out = [cabeceraPS(PRO() ? "Estructura de OUs, grupos y usuarios (modelo por niveles)" : "Unidades organizativas, grupos y usuarios desde CSV", f),
    "Import-Module ActiveDirectory",
    "",
    `$dominio = "${dn()}"`,
    `$raiz    = "OU=${raizOU()},$dominio"`,
    `$upn     = "${S.dominio}"`,
    "",
    "# Contraseña inicial: se pide al ejecutar y el usuario la cambia al entrar.",
    "# Debe cumplir la directiva de complejidad (mayúscula, minúscula, número, 7+ caracteres).",
    '$pass = Read-Host -AsSecureString "Contraseña inicial para los usuarios nuevos"',
    "",
    "# Crea una OU solo si no existe",
    "function Nueva-OU([string]$Nombre, [string]$Ruta) {",
    "    $existe = Get-ADOrganizationalUnit -Filter \"Name -eq '$Nombre'\" -SearchBase $Ruta -SearchScope OneLevel -ErrorAction SilentlyContinue",
    "    if (-not $existe) {",
    "        New-ADOrganizationalUnit -Name $Nombre -Path $Ruta -ProtectedFromAccidentalDeletion $true",
    '        Write-Host "OU creada: $Nombre" -ForegroundColor Green',
    "    }",
    "}",
    "",
    `Nueva-OU "${raizOU()}" $dominio`];
  if (PRO()) out.push(...PROsec("Estructura por niveles: cada tipo de objeto en su OU"),
    "# Así cada GPO y cada delegación de permisos se aplica justo donde toca",
    'foreach ($ou in @("Usuarios", "Grupos", "Equipos", "Servidores", "Administracion")) { Nueva-OU $ou $raiz }',
    '$rutaUsuarios = "OU=Usuarios,$raiz"',
    '$rutaGrupos   = "OU=Grupos,$raiz"', "");
  else out.push('$rutaUsuarios = $raiz', '$rutaGrupos   = $raiz', "");
  out.push("# Una OU y un grupo de seguridad global por departamento",
    `$departamentos = @(${deps.map(x => `"${x}"`).join(", ")})`,
    "foreach ($dep in $departamentos) {",
    "    Nueva-OU $dep $rutaUsuarios",
    `    $grupo = ${PS_GRUPO}`,
    "    if (-not (Get-ADGroup -Filter \"Name -eq '$grupo'\" -ErrorAction SilentlyContinue)) {",
    PRO() ? '        New-ADGroup -Name $grupo -GroupScope Global -GroupCategory Security -Path $rutaGrupos -Description "Usuarios de $dep"'
          : '        New-ADGroup -Name $grupo -GroupScope Global -GroupCategory Security -Path "OU=$dep,$raiz"',
    '        Write-Host "Grupo creado: $grupo" -ForegroundColor Green',
    "    }",
    "}",
    "",
    `# Usuarios del CSV (${usuarios.length})`,
    "$usuarios = @(",
    usuarios.map(u => `    @{ Nombre = "${u.nombre}";${" ".repeat(w - u.nombre.length)} Apellidos = "${u.apellidos}"; Usuario = "${u.usuario}"; Depto = "${u.depto}" }`).join("\n"),
    ")",
    "",
    "foreach ($u in $usuarios) {",
    "    if (Get-ADUser -Filter \"SamAccountName -eq '$($u.Usuario)'\" -ErrorAction SilentlyContinue) {",
    '        Write-Host "Ya existe, se salta: $($u.Usuario)" -ForegroundColor Yellow',
    "        continue",
    "    }",
    "    $dep = $u.Depto",
    "    $completo = \"$($u.Nombre) $($u.Apellidos)\"",
    "    $datos = @{",
    "        Name                  = $completo",
    "        DisplayName           = $completo",
    "        GivenName             = $u.Nombre",
    "        Surname               = $u.Apellidos",
    "        SamAccountName        = $u.Usuario",
    "        UserPrincipalName     = \"$($u.Usuario)@$upn\"",
    "        Path                  = \"OU=$dep,$rutaUsuarios\"",
    "        Department            = $dep",
    "        AccountPassword       = $pass",
    "        Enabled               = $true",
    "        ChangePasswordAtLogon = $true",
    "    }",
    "    New-ADUser @datos",
    `    $grupo = ${PS_GRUPO}`,
    "    Add-ADGroupMember -Identity $grupo -Members $u.Usuario",
    '    Write-Host "Usuario creado: $($u.Usuario) -> $grupo" -ForegroundColor Green',
    "}");
  if (PRO()) out.push(...PROsec("Papelera de reciclaje de AD"),
    "# Permite recuperar usuarios u OUs borrados por error, con todos sus atributos (no se puede desactivar)",
    "if (-not (Get-ADOptionalFeature -Filter \"Name -eq 'Recycle Bin Feature'\").EnabledScopes) {",
    `    Enable-ADOptionalFeature -Identity "Recycle Bin Feature" -Scope ForestOrConfigurationSet -Target "${S.dominio}" -Confirm:$false`,
    "}",
    ...PROsec("Equipos nuevos directamente en su OU"),
    "# Por defecto caen en el contenedor «Computers», donde no se pueden aplicar GPO",
    `redircmp "${ouEquipos()}"`,
    ...PROsec("Hora oficial"),
    "# El controlador de dominio da la hora a toda la red: que la tome del Real Observatorio de la Armada",
    'w32tm /config /manualpeerlist:"hora.roa.es,0x8 es.pool.ntp.org,0x8" /syncfromflags:manual /reliable:yes /update',
    "Restart-Service w32time",
    "w32tm /resync /force");
  out.push("", "# Resumen de lo que hay en la OU de la empresa",
    "Get-ADUser -Filter * -SearchBase $raiz -Properties Department | Sort-Object Department | Format-Table SamAccountName, Name, Department");
  return L(out);
}
function adClienteWin(f){
  return L(cabeceraPS("Unir un equipo Windows 10/11 al dominio", f),
    "# Se ejecuta en el CLIENTE, no en el servidor",
    "",
    "# El cliente tiene que usar el servidor como DNS para encontrar el dominio",
    `$tarjeta = "${limpio(S.ifWin)}"`,
    `Set-DnsClientServerAddress -InterfaceAlias $tarjeta -ServerAddresses ${dnsClientes().join(",")}`,
    "",
    "# Comprueba que encuentra el controlador de dominio",
    `Resolve-DnsName _ldap._tcp.dc._msdcs.${S.dominio} -Type SRV`,
    "",
    "# Une el equipo (pide la contraseña del administrador del dominio) y reinicia",
    PRO() ? [`# En modo profesional el equipo entra directamente en ${ouEquipos()}`,
      `Add-Computer -DomainName "${S.dominio}" -OUPath "${ouEquipos()}" -Credential "${NB()}\\Administrador" -Restart`]
          : `Add-Computer -DomainName "${S.dominio}" -Credential "${NB()}\\Administrador" -Restart`
  );
}
function adClienteLinux(f){
  const u = parseCSV().usuarios[0]?.usuario || "usuario";
  return L(cabeceraSH("Unir un Ubuntu al dominio de Active Directory (realmd + SSSD)", f),
    "# Se ejecuta en el CLIENTE Ubuntu. Requisitos:",
    `#  - Que su DNS sea el controlador de dominio (${S.srvIp})`,
    "#  - Que la hora coincida con la del servidor (Kerberos falla con más de 5 minutos de diferencia)",
    "",
    "# Paquetes necesarios",
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y realmd sssd sssd-tools libnss-sss libpam-sss adcli samba-common-bin oddjob oddjob-mkhomedir packagekit",
    "",
    "# Comprueba que ve el dominio",
    `realm discover ${S.dominio}`,
    "",
    "# Une el equipo (pide la contraseña del Administrador del dominio)",
    PRO() ? `realm join -U Administrador --computer-ou="${ouEquipos()}" ${S.dominio}` : `realm join -U Administrador ${S.dominio}`,
    "",
    "# Crea la carpeta personal la primera vez que entra un usuario del dominio",
    "pam-auth-update --enable mkhomedir",
    "",
    "# Permite entrar con «usuario» en vez de «usuario@dominio»",
    "sed -i 's/^use_fully_qualified_names = True/use_fully_qualified_names = False/' /etc/sssd/sssd.conf",
    PRO() ? [...PROsec("Solo pueden entrar los grupos que digas"),
      "realm deny --all",
      ...departamentos().slice(0, 1).map(dep => `realm permit -g ${grupoDe(dep)}`),
      "# Añade más grupos con: realm permit -g NOMBRE_GRUPO"] : [],
    "systemctl restart sssd",
    "",
    "# Prueba: debe mostrar el usuario y sus grupos del dominio",
    `id ${u}`
  );
}
function adSegundoDC(f){
  return L(cabeceraPS(`Segundo controlador de dominio en ${S.srv2Nombre}`, f),
    `# Se ejecuta en ${S.srv2Nombre} (${S.srv2Ip}). Antes: IP fija, DNS apuntando a ${S.srvIp} y nombre cambiado.`,
    "# Si un controlador cae, el otro sigue validando usuarios y resolviendo el DNS.",
    "",
    "Install-WindowsFeature AD-Domain-Services -IncludeManagementTools",
    "Import-Module ADDSDeployment",
    "",
    `$cred = Get-Credential "${NB()}\\Administrador"`,
    '$dsrm = Read-Host -AsSecureString "Contraseña del modo de restauración (DSRM)"',
    "",
    "$dc = @{",
    `    DomainName                    = "${S.dominio}"`,
    "    InstallDns                    = $true",
    "    Credential                    = $cred",
    "    SafeModeAdministratorPassword = $dsrm",
    "    Force                         = $true",
    "}",
    "Install-ADDSDomainController @dc",
    "",
    "# Tras el reinicio, en los dos servidores pon como DNS: primero el otro controlador y después 127.0.0.1",
    "# Comprueba la replicación con: repadmin /replsummary"
  );
}

/* ============================================================
   Directivas de grupo (GPO)
   ============================================================ */
function gpoWindows(f){
  const out = [cabeceraPS("Directivas de grupo (GPO)", f),
    "Import-Module GroupPolicy",
    "Import-Module ActiveDirectory",
    "",
    `$dominio   = "${S.dominio}"`,
    `$ouUsuarios = "${ouUsuarios()}"`,
    `$ouEquipos  = "${ouEquipos()}"`,
    "",
    "# Crea la GPO si no existe y la vincula a su OU",
    "function Nueva-GPO([string]$Nombre, [string]$Destino) {",
    "    if (-not (Get-GPO -Name $Nombre -ErrorAction SilentlyContinue)) {",
    '        New-GPO -Name $Nombre -Comment "Creada con ASIRkit" | Out-Null',
    '        Write-Host "GPO creada: $Nombre" -ForegroundColor Green',
    "    }",
    "    if (-not ((Get-GPInheritance -Target $Destino).GpoLinks.DisplayName -contains $Nombre)) {",
    "        New-GPLink -Name $Nombre -Target $Destino | Out-Null",
    "    }",
    "}",
    "",
    "# Política de contraseñas del dominio (va en la Default Domain Policy, no en una GPO aparte)",
    PRO() ? [
      "$politica = @{",
      "    Identity                    = $dominio",
      "    MinPasswordLength           = 12",
      "    ComplexityEnabled           = $true",
      "    PasswordHistoryCount        = 24",
      "    MaxPasswordAge              = (New-TimeSpan -Days 180)",
      "    MinPasswordAge              = (New-TimeSpan -Days 1)",
      "    # ── PRO · Bloqueo de cuenta: 5 intentos fallidos = 15 minutos bloqueada",
      "    LockoutThreshold            = 5",
      "    LockoutDuration             = (New-TimeSpan -Minutes 15)",
      "    LockoutObservationWindow    = (New-TimeSpan -Minutes 15)",
      "}",
      "Set-ADDefaultDomainPasswordPolicy @politica"
    ] : "Set-ADDefaultDomainPasswordPolicy -Identity $dominio -MinPasswordLength 8 -ComplexityEnabled $true -PasswordHistoryCount 5 -MaxPasswordAge (New-TimeSpan -Days 90)"];
  if (PRO()) out.push(...PROsec("Política más dura solo para los administradores del dominio"),
    "# Directiva de contraseñas específica (PSO): 15 caracteres y bloqueo tras 3 intentos",
    "if (-not (Get-ADFineGrainedPasswordPolicy -Filter \"Name -eq 'PSO-Administradores'\")) {",
    "    $pso = @{",
    '        Name                        = "PSO-Administradores"',
    "        Precedence                  = 10",
    "        MinPasswordLength           = 15",
    "        ComplexityEnabled           = $true",
    "        PasswordHistoryCount        = 24",
    "        MaxPasswordAge              = (New-TimeSpan -Days 180)",
    "        MinPasswordAge              = (New-TimeSpan -Days 1)",
    "        LockoutThreshold            = 3",
    "        LockoutDuration             = (New-TimeSpan -Minutes 30)",
    "        LockoutObservationWindow    = (New-TimeSpan -Minutes 30)",
    "        ReversibleEncryptionEnabled = $false",
    "    }",
    "    New-ADFineGrainedPasswordPolicy @pso",
    "}",
    "# «Admins. del dominio» se busca por su SID (-512), así funciona en cualquier idioma",
    '$admins = Get-ADGroup -Identity "$((Get-ADDomain).DomainSID.Value)-512"',
    'Add-ADFineGrainedPasswordPolicySubject -Identity "PSO-Administradores" -Subjects $admins');
  const usr = [], eq = [];
  if (S.gpoPanel) usr.push("# Sin acceso al Panel de control ni a Configuración",
    '$r = @{ Name = $gUsr; Key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer"; ValueName = "NoControlPanel"; Type = "DWord"; Value = 1 }',
    "Set-GPRegistryValue @r | Out-Null");
  if (S.gpoCmd) usr.push("# Sin símbolo del sistema (2 = bloquea la consola, pero deja ejecutar scripts de inicio de sesión)",
    '$r = @{ Name = $gUsr; Key = "HKCU\\Software\\Policies\\Microsoft\\Windows\\System"; ValueName = "DisableCMD"; Type = "DWord"; Value = 2 }',
    "Set-GPRegistryValue @r | Out-Null");
  if (S.gpoFondo) usr.push("# Fondo de escritorio corporativo (4 = rellenar)",
    `$r = @{ Name = $gUsr; Key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"; ValueName = "Wallpaper"; Type = "String"; Value = "${ruta(S.fondoRuta)}" }`,
    "Set-GPRegistryValue @r | Out-Null",
    '$r = @{ Name = $gUsr; Key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"; ValueName = "WallpaperStyle"; Type = "String"; Value = "4" }',
    "Set-GPRegistryValue @r | Out-Null");
  if (S.gpoBloqueo) usr.push("# Bloqueo de pantalla con contraseña a los 10 minutos sin uso",
    'foreach ($v in @(@("ScreenSaveActive", "1"), @("ScreenSaverIsSecure", "1"), @("ScreenSaveTimeOut", "600"))) {',
    '    Set-GPRegistryValue -Name $gUsr -Key "HKCU\\Software\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop" -ValueName $v[0] -Type String -Value $v[1] | Out-Null',
    "}");
  if (S.gpoUsb) eq.push("# Bloquea las memorias USB y demás almacenamiento extraíble",
    '$r = @{ Name = $gEq; Key = "HKLM\\Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices"; ValueName = "Deny_All"; Type = "DWord"; Value = 1 }',
    "Set-GPRegistryValue @r | Out-Null");
  if (PRO()) eq.push("# ── PRO · Firma SMB obligatoria: evita ataques de retransmisión (NTLM relay)",
    'Set-GPRegistryValue -Name $gEq -Key "HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation\\Parameters" -ValueName "RequireSecuritySignature" -Type DWord -Value 1 | Out-Null',
    'Set-GPRegistryValue -Name $gEq -Key "HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -ValueName "RequireSecuritySignature" -Type DWord -Value 1 | Out-Null',
    "# ── PRO · Sin LLMNR: la herramienta Responder lo usa para robar credenciales en la red local",
    'Set-GPRegistryValue -Name $gEq -Key "HKLM\\Software\\Policies\\Microsoft\\Windows NT\\DNSClient" -ValueName "EnableMulticast" -Type DWord -Value 0 | Out-Null');
  if (usr.length) out.push("", `# GPO de usuario, vinculada a ${PRO() ? "la OU Usuarios" : "la OU de la empresa"}`,
    '$gUsr = "ASIRkit - Restricciones de usuario"', "Nueva-GPO $gUsr $ouUsuarios", ...usr);
  if (eq.length) out.push("", `# GPO de equipo, vinculada a ${PRO() ? "la OU Equipos" : "todo el dominio"}`,
    '$gEq = "ASIRkit - Seguridad de equipos"', "Nueva-GPO $gEq $ouEquipos", ...eq);
  out.push("", "# Informe en HTML de todas las GPO, en el escritorio",
    'Get-GPOReport -All -ReportType Html -Path "$env:USERPROFILE\\Desktop\\informe-gpo.html"',
    "",
    "# En los clientes se aplican al reiniciar o con: gpupdate /force");
  return L(out);
}

/* ============================================================
   Servidor de ficheros
   ============================================================ */
function ficherosWindows(f){
  const cs = carpetas(), ad = has("ad"), agdlp = PRO() && ad, base = ruta(S.rutaWin), unidad = base.slice(0, 2);
  const g = c => {
    if (!c.grupo) return ad ? (agdlp ? `${NB()}\\DL_Comun_M` : "*$((Get-ADDomain).DomainSID.Value)-513") : "*S-1-5-11";
    if (agdlp) return `${NB()}\\DL_${c.nombre}_M`;
    return ad ? `${NB()}\\${c.grupo}` : c.grupo;
  };
  const out = [cabeceraPS("Servidor de ficheros: carpetas compartidas por departamento", f),
    "# Rol de servidor de archivos",
    `Install-WindowsFeature FS-FileServer${PRO() ? ", FS-Resource-Manager" : ""} -IncludeManagementTools`,
    "",
    `$base = "${base}"`,
    "New-Item -ItemType Directory -Path $base -Force | Out-Null",
    "",
    "# «Usuarios autentificados» por su SID, para que funcione en cualquier idioma de Windows",
    '$autenticados = (New-Object System.Security.Principal.SecurityIdentifier "S-1-5-11").Translate([System.Security.Principal.NTAccount]).Value'];
  if (!ad) out.push("", "# Sin dominio: grupos locales por departamento (añade usuarios con Add-LocalGroupMember)",
    `foreach ($grupo in @(${cs.filter(c => c.grupo).map(c => `"${c.grupo}"`).join(", ")})) {`,
    "    if (-not (Get-LocalGroup -Name $grupo -ErrorAction SilentlyContinue)) { New-LocalGroup -Name $grupo | Out-Null }",
    "}");
  if (agdlp){
    out.push(...PROsec("Modelo AGDLP: usuarios → grupo Global → grupo Local de dominio → permiso"),
      "# Los permisos se dan a grupos DL_ (uno por carpeta y nivel de acceso), y los G_ de departamento se meten dentro.",
      "# Si mañana Ventas necesita leer Informática, se añade G_Ventas a un DL_ sin tocar ni un permiso NTFS.",
      `$rutaGrupos = "${ouGrupos()}"`,
      "$dl = @(",
      cs.map(c => `    @{ Nombre = "DL_${c.nombre}_M"; Miembro = ${c.grupo ? `"${c.grupo}"` : '"$((Get-ADDomain).DomainSID.Value)-513"'} }`).join("\n"),
      ")",
      "foreach ($x in $dl) {",
      "    if (-not (Get-ADGroup -Filter \"Name -eq '$($x.Nombre)'\" -ErrorAction SilentlyContinue)) {",
      '        New-ADGroup -Name $x.Nombre -GroupScope DomainLocal -GroupCategory Security -Path $rutaGrupos -Description "Modificar en $base"',
      "    }",
      "    Add-ADGroupMember -Identity $x.Nombre -Members (Get-ADGroup -Identity $x.Miembro)",
      "}");
  }
  out.push("", "# Carpetas: nombre del recurso y grupo con permiso de modificar",
    "$carpetas = @(",
    cs.map(c => `    @{ Nombre = "${c.nombre}"; Grupo = "${g(c)}" }`).join("\n"),
    ")",
    "",
    "foreach ($c in $carpetas) {",
    "    $ruta = Join-Path $base $c.Nombre",
    "    New-Item -ItemType Directory -Path $ruta -Force | Out-Null",
    "",
    "    # NTFS: quita la herencia y deja solo Administradores (S-1-5-32-544), SYSTEM (S-1-5-18) y el grupo",
    '    icacls $ruta /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "$($c.Grupo):(OI)(CI)M" | Out-Null',
    "",
    "    # Recurso compartido: control total a los usuarios autentificados y quien manda es NTFS",
    "    if (-not (Get-SmbShare -Name $c.Nombre -ErrorAction SilentlyContinue)) {",
    PRO() ? [
    "        # ── PRO · Cada uno solo ve las carpetas que puede abrir, el tráfico va cifrado y sin caché sin conexión",
    "        New-SmbShare -Name $c.Nombre -Path $ruta -FullAccess $autenticados -FolderEnumerationMode AccessBased -EncryptData $true -CachingMode None | Out-Null"]
          : "        New-SmbShare -Name $c.Nombre -Path $ruta -FullAccess $autenticados | Out-Null",
    '        Write-Host "Compartida: \\\\$env:COMPUTERNAME\\$($c.Nombre)" -ForegroundColor Green',
    "    }",
    PRO() ? [
    "",
    `    # ── PRO · Cuota de ${+S.cuotaGB || 5} GB por carpeta`,
    "    if (-not (Get-FsrmQuota -Path $ruta -ErrorAction SilentlyContinue)) {",
    `        New-FsrmQuota -Path $ruta -Size ${+S.cuotaGB || 5}GB -Description "Cuota de ASIRkit" | Out-Null`,
    "    }"] : [],
    "}");
  if (PRO()) out.push(...PROsec(`Instantáneas de ${unidad} (versiones anteriores de los archivos)`),
    "# Los usuarios recuperan ellos mismos un archivo pisado: clic derecho > Restaurar versiones anteriores",
    `vssadmin add shadowstorage /for=${unidad} /on=${unidad} /maxsize=10%`,
    `$accion = New-ScheduledTaskAction -Execute "vssadmin.exe" -Argument "create shadow /for=${unidad}"`,
    "$horas  = @((New-ScheduledTaskTrigger -Daily -At 7am), (New-ScheduledTaskTrigger -Daily -At 12pm))",
    `Register-ScheduledTask -TaskName "Instantaneas ${unidad[0]}" -Action $accion -Trigger $horas -User "SYSTEM" -RunLevel Highest -Force | Out-Null`,
    "",
    "# SMBv1 desactivado",
    "Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force");
  out.push("", "Get-SmbShare | Where-Object Path -like \"$base*\" | Format-Table Name, Path");
  return L(out);
}
function ficherosLinux(f){
  const cs = carpetas(), base = ruta(S.rutaLin).replace(/\/$/, "");
  const usuarios = has("ad") ? parseCSV().usuarios : [];
  const grupoLin = dep => cs.find(c => c.etiqueta === dep)?.linux || "comun";
  const seccion = c => [
    `[${c.nombre}]`,
    `   path = ${base}/${c.nombre}`,
    `   valid users = @${c.linux}`,
    "   read only = no",
    "   create mask = 0660",
    "   directory mask = 2770",
    ...(PRO() ? ["   # ── PRO · Solo ve la carpeta quien puede entrar, y lo borrado va a una papelera",
      "   access based share enum = yes", "   hide unreadable = yes",
      "   vfs objects = recycle", "   recycle:repository = .papelera", "   recycle:keeptree = yes", "   recycle:versions = yes"] : []),
    ""];
  return L(cabeceraSH("Servidor de ficheros en Ubuntu (Samba)", f),
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y samba",
    "[ -f /etc/samba/smb.conf.orig ] || cp /etc/samba/smb.conf /etc/samba/smb.conf.orig",
    "",
    "# Un grupo de Linux por carpeta; el bit setgid (2770) hace que lo nuevo herede el grupo",
    ...cs.map(c => `getent group ${c.linux} >/dev/null || groupadd ${c.linux}`),
    "",
    ...cs.flatMap(c => [`mkdir -p ${base}/${c.nombre}`, `chown root:${c.linux} ${base}/${c.nombre}`, `chmod 2770 ${base}/${c.nombre}`]),
    "",
    usuarios.length ? [
      "# Usuarios del CSV como usuarios locales sin shell (solo acceden por Samba).",
      "# Para usar los del dominio, une este Ubuntu al dominio con el módulo de Active Directory.",
      'read -rsp "Contraseña inicial de Samba para los usuarios: " PASS; echo',
      "crear_usuario() {",
      '  id "$1" &>/dev/null || useradd -M -s /usr/sbin/nologin "$1"',
      '  usermod -aG "$2" "$1"',
      `  ${S.comun ? 'usermod -aG comun "$1"' : ":"}`,
      `  printf '%s\\n%s\\n' "$PASS" "$PASS" | smbpasswd -s -a "$1" >/dev/null`,
      "}",
      ...usuarios.map(u => `crear_usuario ${u.usuario} ${grupoLin(u.depto)}`)
    ] : ["# Añade usuarios con: sudo useradd -M -s /usr/sbin/nologin ana && sudo usermod -aG GRUPO ana && sudo smbpasswd -a ana"],
    "",
    "# Configuración de Samba",
    "cat > /etc/samba/smb.conf <<'EOF'",
    "[global]",
    `   workgroup = ${NB()}`,
    `   server string = Servidor de ficheros ${host()}`,
    "   server role = standalone server",
    "   security = user",
    "   map to guest = never",
    "   log file = /var/log/samba/log.%m",
    "   max log size = 1000",
    PRO() ? ["   # ── PRO · Solo SMB3 y cifrado si el cliente lo admite",
      "   server min protocol = SMB3", "   smb encrypt = desired"] : [],
    "",
    ...cs.flatMap(seccion),
    "EOF",
    "",
    "# Comprueba la configuración y reinicia",
    "testparm -s >/dev/null",
    ufwSi(PRO() ? `ufw allow from ${derivar().cidr || S.red} to any app Samba` : "ufw allow Samba"),
    "systemctl restart smbd",
    "systemctl enable smbd",
    "smbclient -L localhost -N 2>/dev/null | grep Disk || true"
  );
}

/* ============================================================
   Servidor web
   ============================================================ */
function webWindows(f){
  const w = webFqdn(), raiz = ruta(S.webRaizWin), sitio = limpio(S.webHost);
  const out = [cabeceraPS(`Servidor web IIS: ${w}`, f),
    "Install-WindowsFeature Web-Server -IncludeManagementTools",
    "Import-Module WebAdministration",
    "",
    `$sitio = "${sitio}"`,
    `$web   = "${w}"`,
    `$raiz  = "${raiz}"`,
    "",
    "# Carpeta del sitio y una página de prueba",
    "New-Item -ItemType Directory -Path $raiz -Force | Out-Null",
    'if (-not (Test-Path "$raiz\\index.html")) {',
    `    Set-Content -Path "$raiz\\index.html" -Value "<h1>Intranet de ${S.dominio}</h1>" -Encoding UTF8`,
    "}",
    "",
    "# Sitio que responde solo al nombre de la intranet (encabezado de host)",
    "if (-not (Get-Website -Name $sitio)) {",
    "    New-Website -Name $sitio -PhysicalPath $raiz -Port 80 -HostHeader $web | Out-Null",
    "}"];
  if (PRO()) out.push(...PROsec("HTTPS"), ...certPS(w),
    'if (-not (Get-WebBinding -Name $sitio -Protocol https)) {',
    "    New-WebBinding -Name $sitio -Protocol https -Port 443 -HostHeader $web -SslFlags 1",
    '    (Get-WebBinding -Name $sitio -Protocol https).AddSslCertificate($cert.GetCertHashString(), "my")',
    "}",
    ...PROsec("Cabeceras de seguridad"),
    "# Quita las cabeceras que dicen qué servidor y versión usas",
    'Remove-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/httpProtocol/customHeaders" -Name "." -AtElement @{name = "X-Powered-By"} -ErrorAction SilentlyContinue',
    'Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/security/requestFiltering" -Name "removeServerHeader" -Value $true',
    "# Cabeceras que protegen frente a clickjacking, tipos MIME falsos y conexiones sin cifrar",
    "$cabeceras = @{",
    '    "X-Content-Type-Options"    = "nosniff"',
    '    "X-Frame-Options"           = "SAMEORIGIN"',
    '    "Strict-Transport-Security" = "max-age=31536000"',
    '    "Referrer-Policy"           = "strict-origin-when-cross-origin"',
    "}",
    "foreach ($c in $cabeceras.GetEnumerator()) {",
    '    Add-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST/$sitio" -Filter "system.webServer/httpProtocol/customHeaders" -Name "." -Value @{name = $c.Key; value = $c.Value} -ErrorAction SilentlyContinue',
    "}",
    "# Sin listado de carpetas",
    'Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST/$sitio" -Filter "system.webServer/directoryBrowse" -Name "enabled" -Value $false');
  out.push("", "Start-Website -Name $sitio", `Invoke-WebRequest "http://${w}" -UseBasicParsing | Select-Object StatusCode`);
  return L(out);
}
function webLinux(f){
  const w = webFqdn(), raiz = ruta(S.webRaizLin).replace(/\/$/, ""), sitio = limpio(S.webHost);
  const dir = [`    <Directory ${raiz}>`, "        Options -Indexes", "        AllowOverride None", "        Require all granted", "    </Directory>"];
  const logs = ["    ErrorLog ${APACHE_LOG_DIR}/" + sitio + "_error.log", "    CustomLog ${APACHE_LOG_DIR}/" + sitio + "_access.log combined"];
  const vhost = PRO() ? [
    "<VirtualHost *:80>", `    ServerName ${w}`, "    # Todo lo que llega por HTTP se manda a HTTPS", `    Redirect permanent / https://${w}/`, "</VirtualHost>", "",
    "<VirtualHost *:443>", `    ServerName ${w}`, `    DocumentRoot ${raiz}`,
    "    SSLEngine on", `    SSLCertificateFile /etc/apache2/ssl/${sitio}.crt`, `    SSLCertificateKeyFile /etc/apache2/ssl/${sitio}.key`,
    "    # Cabeceras de seguridad",
    '    Header always set Strict-Transport-Security "max-age=31536000"',
    '    Header always set X-Content-Type-Options "nosniff"',
    '    Header always set X-Frame-Options "SAMEORIGIN"',
    '    Header always set Referrer-Policy "strict-origin-when-cross-origin"',
    ...dir, ...logs, "</VirtualHost>"]
    : ["<VirtualHost *:80>", `    ServerName ${w}`, `    DocumentRoot ${raiz}`, ...dir, ...logs, "</VirtualHost>"];
  return L(cabeceraSH(`Servidor web Apache: ${w}`, f),
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y apache2",
    "",
    "# Carpeta del sitio y una página de prueba",
    `mkdir -p ${raiz}`,
    `[ -f ${raiz}/index.html ] || echo "<h1>Intranet de ${S.dominio}</h1>" > ${raiz}/index.html`,
    `chown -R www-data:www-data ${raiz}`,
    PRO() ? [...PROsec("HTTPS y cabeceras"), "a2enmod ssl headers", "mkdir -p /etc/apache2/ssl",
      ...certSH(w, `/etc/apache2/ssl/${sitio}.crt`, `/etc/apache2/ssl/${sitio}.key`),
      "", "# Oculta la versión de Apache y del sistema en errores y cabeceras",
      "sed -i 's/^ServerTokens .*/ServerTokens Prod/; s/^ServerSignature .*/ServerSignature Off/' /etc/apache2/conf-available/security.conf"] : [],
    "",
    `# Host virtual de ${w}`,
    `cat > /etc/apache2/sites-available/${sitio}.conf <<'EOF'`,
    ...vhost,
    "EOF",
    "",
    "# Activa el sitio, quita el de ejemplo y comprueba la sintaxis",
    `a2ensite ${sitio}`,
    "a2dissite 000-default",
    "apache2ctl configtest",
    ufwSi(PRO() ? 'ufw allow "Apache Full"' : 'ufw allow "Apache"'),
    "systemctl reload apache2",
    "",
    `curl -sk -o /dev/null -w "%{http_code}\\n" ${PRO() ? "https" : "http"}://${w}/ || true`
  );
}

/* ============================================================
   FTP
   ============================================================ */
function ftpWindows(f){
  const r = ruta(S.ftpRutaWin), ad = has("ad");
  const out = [cabeceraPS("Servidor FTP con IIS", f),
    "Install-WindowsFeature Web-Ftp-Server -IncludeManagementTools",
    "Import-Module WebAdministration",
    "",
    `$ruta = "${r}"`,
    "New-Item -ItemType Directory -Path $ruta -Force | Out-Null",
    "",
    "# Sitio FTP en el puerto 21",
    'if (-not (Get-Website -Name "FTP")) {',
    '    New-WebFtpSite -Name "FTP" -Port 21 -PhysicalPath $ruta | Out-Null',
    "}",
    "",
    "# Autenticación básica (usuarios de Windows o del dominio)",
    'Set-ItemProperty "IIS:\\Sites\\FTP" -Name ftpServer.security.authentication.basicAuthentication.enabled -Value $true',
    "",
    "# Reglas de autorización: se borran y se vuelven a crear",
    'Clear-WebConfiguration "/system.ftpServer/security/authorization" -PSPath IIS:\\ -Location "FTP"'];
  if (PRO()) out.push(...PROsec("Solo el grupo G_FTP puede entrar"),
    ad ? ["if (-not (Get-ADGroup -Filter \"Name -eq 'G_FTP'\")) {", '    New-ADGroup -Name "G_FTP" -GroupScope Global -GroupCategory Security', "}"]
       : ['if (-not (Get-LocalGroup -Name "G_FTP" -ErrorAction SilentlyContinue)) { New-LocalGroup -Name "G_FTP" | Out-Null }'],
    'Add-WebConfiguration "/system.ftpServer/security/authorization" -PSPath IIS:\\ -Location "FTP" -Value @{accessType = "Allow"; roles = "G_FTP"; permissions = "Read,Write"}',
    `icacls $ruta /grant "${ad ? NB() + "\\\\" : ""}G_FTP:(OI)(CI)M" | Out-Null`.replace("\\\\\\\\", "\\\\"),
    ...PROsec("FTPS obligatorio (usuario, contraseña y datos cifrados)"), ...certPS("ftp." + S.dominio),
    'Set-ItemProperty "IIS:\\Sites\\FTP" -Name ftpServer.security.ssl.serverCertHash -Value $cert.GetCertHashString()',
    "# 1 = SslRequire",
    'Set-ItemProperty "IIS:\\Sites\\FTP" -Name ftpServer.security.ssl.controlChannelPolicy -Value 1',
    'Set-ItemProperty "IIS:\\Sites\\FTP" -Name ftpServer.security.ssl.dataChannelPolicy -Value 1',
    ...PROsec(`Puertos pasivos fijos ${S.pasvMin}-${S.pasvMax} (para poder abrirlos en el cortafuegos)`),
    `Set-WebConfigurationProperty -PSPath IIS:\\ -Filter system.ftpServer/firewallSupport -Name lowDataChannelPort -Value ${S.pasvMin}`,
    `Set-WebConfigurationProperty -PSPath IIS:\\ -Filter system.ftpServer/firewallSupport -Name highDataChannelPort -Value ${S.pasvMax}`,
    'if (-not (Get-NetFirewallRule -Name "ASIRkit-FTP-Pasivo" -ErrorAction SilentlyContinue)) {',
    `    New-NetFirewallRule -Name "ASIRkit-FTP-Pasivo" -DisplayName "FTP pasivo" -Direction Inbound -Protocol TCP -LocalPort ${S.pasvMin}-${S.pasvMax} -Action Allow | Out-Null`,
    "}");
  else out.push("# Cualquier usuario autentificado puede leer y escribir",
    'Add-WebConfiguration "/system.ftpServer/security/authorization" -PSPath IIS:\\ -Location "FTP" -Value @{accessType = "Allow"; users = "*"; permissions = "Read,Write"}',
    'icacls $ruta /grant "*S-1-5-11:(OI)(CI)M" | Out-Null',
    "",
    "# SSL permitido pero no obligatorio (0 = SslAllow), lo típico en prácticas",
    'Set-ItemProperty "IIS:\\Sites\\FTP" -Name ftpServer.security.ssl.controlChannelPolicy -Value 0',
    'Set-ItemProperty "IIS:\\Sites\\FTP" -Name ftpServer.security.ssl.dataChannelPolicy -Value 0');
  out.push("", "Restart-Service ftpsvc", 'Get-Website -Name "FTP" | Format-List Name, State, PhysicalPath');
  return L(out);
}
function ftpLinux(f){
  return L(cabeceraSH("Servidor FTP en Ubuntu (vsftpd)", f),
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y vsftpd",
    "[ -f /etc/vsftpd.conf.orig ] || cp /etc/vsftpd.conf /etc/vsftpd.conf.orig",
    PRO() ? [...PROsec("Certificado para FTPS y lista de usuarios permitidos"),
      ...certSH("ftp." + S.dominio, "/etc/ssl/certs/vsftpd.pem", "/etc/ssl/private/vsftpd.key"),
      "# Un usuario por línea: solo ellos pueden entrar",
      "touch /etc/vsftpd.userlist",
      'echo "Añade usuarios con: echo usuario | sudo tee -a /etc/vsftpd.userlist"'] : [],
    "",
    "# Usuarios locales, sin anónimos, cada uno encerrado en su carpeta personal (chroot)",
    "cat > /etc/vsftpd.conf <<'EOF'",
    "listen=YES", "listen_ipv6=NO",
    "anonymous_enable=NO", "local_enable=YES", "write_enable=YES", "local_umask=022",
    "dirmessage_enable=YES", "xferlog_enable=YES", "connect_from_port_20=YES",
    "chroot_local_user=YES", "allow_writeable_chroot=YES",
    "secure_chroot_dir=/var/run/vsftpd/empty", "pam_service_name=vsftpd",
    PRO() ? ["",
      "# ── PRO · Puertos pasivos fijos",
      "pasv_enable=YES", `pasv_min_port=${S.pasvMin}`, `pasv_max_port=${S.pasvMax}`,
      "# ── PRO · Solo los usuarios de la lista",
      "userlist_enable=YES", "userlist_file=/etc/vsftpd.userlist", "userlist_deny=NO",
      "# ── PRO · FTPS obligatorio",
      "ssl_enable=YES", "rsa_cert_file=/etc/ssl/certs/vsftpd.pem", "rsa_private_key_file=/etc/ssl/private/vsftpd.key",
      "force_local_logins_ssl=YES", "force_local_data_ssl=YES", "ssl_ciphers=HIGH", "require_ssl_reuse=NO"] : [],
    "EOF",
    "",
    ufwSi(PRO() ? `ufw allow 21/tcp && ufw allow ${S.pasvMin}:${S.pasvMax}/tcp` : "ufw allow 20:21/tcp"),
    "systemctl restart vsftpd",
    "systemctl enable vsftpd",
    "systemctl --no-pager status vsftpd"
  );
}

/* ============================================================
   SSH
   ============================================================ */
function sshWindows(f){
  const p = +S.sshPuerto || 22;
  const reemplazos = [["Port", String(p)], ...(PRO() ? [["PasswordAuthentication", "no"], ["PermitEmptyPasswords", "no"], ["MaxAuthTries", "3"], ["LoginGraceTime", "30"]] : [])];
  return L(cabeceraPS("Servidor OpenSSH en Windows", f),
    "# OpenSSH viene como característica opcional de Windows",
    "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0",
    "Set-Service -Name sshd -StartupType Automatic",
    "Start-Service sshd",
    "",
    "# PowerShell como shell al entrar por SSH (por defecto sería cmd)",
    'New-ItemProperty -Path "HKLM:\\SOFTWARE\\OpenSSH" -Name DefaultShell -Value "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -PropertyType String -Force | Out-Null',
    "",
    "# Ajustes en sshd_config (se guarda una copia del original)",
    '$conf = "C:\\ProgramData\\ssh\\sshd_config"',
    'if (-not (Test-Path "$conf.orig")) { Copy-Item $conf "$conf.orig" }',
    "$c = Get-Content $conf",
    ...reemplazos.map(([k, v]) => `$c = $c -replace '^#?${k} .*', '${k} ${v}'`),
    "Set-Content -Path $conf -Value $c -Encoding ascii",
    PRO() ? [...PROsec("Solo con clave pública"),
      "# Los administradores usan este fichero (no el de su carpeta personal).",
      "# Pega tu clave pública ANTES de reiniciar el servicio o te quedarás fuera.",
      '$claves = "C:\\ProgramData\\ssh\\administrators_authorized_keys"',
      "if (-not (Test-Path $claves)) { New-Item $claves -ItemType File | Out-Null }",
      'icacls $claves /inheritance:r /grant "*S-1-5-32-544:F" /grant "*S-1-5-18:F" | Out-Null',
      'if ((Get-Item $claves).Length -eq 0) { Write-Host "AVISO: $claves está vacío. Añade tu clave pública antes de seguir." -ForegroundColor Red; exit 1 }'] : [],
    "",
    "# Regla del cortafuegos para el puerto de SSH",
    'Remove-NetFirewallRule -Name "ASIRkit-SSH" -ErrorAction SilentlyContinue',
    `New-NetFirewallRule -Name "ASIRkit-SSH" -DisplayName "SSH" -Direction Inbound -Protocol TCP -LocalPort ${p} -Action Allow${PRO() ? ` -RemoteAddress ${S.adminNet}` : ""} | Out-Null`,
    "",
    "Restart-Service sshd",
    `# Prueba desde otro equipo: ssh -p ${p} administrador@${fqdn()}`
  );
}
function sshLinux(f){
  const p = +S.sshPuerto || 22, g = limpio(S.sshGrupo) || "sshusers";
  return L(cabeceraSH("Servidor OpenSSH en Ubuntu", f),
    "apt-get update",
    `DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server${PRO() ? " fail2ban" : ""}`,
    PRO() ? [...PROsec("Seguro anti-bloqueo"),
      "# Si desactivas las contraseñas sin tener tu clave copiada, te quedas fuera del servidor.",
      "# Desde tu equipo, antes de ejecutar esto: ssh-copy-id usuario@servidor",
      'ADMIN="${SUDO_USER:-}"',
      '[ -n "$ADMIN" ] || { echo "Ejecútalo con sudo desde tu usuario, no como root directamente"; exit 1; }',
      'if [ ! -s "/home/$ADMIN/.ssh/authorized_keys" ]; then',
      '  echo "AVISO: $ADMIN no tiene claves en ~/.ssh/authorized_keys. Cópiala con ssh-copy-id y vuelve a ejecutar."',
      "  exit 1",
      "fi",
      "",
      `# Grupo de quien puede entrar por SSH (tú incluido)`,
      `groupadd -f ${g}`,
      `usermod -aG ${g} "$ADMIN"`] : [],
    "",
    "# Los ajustes van en un fichero aparte; el sshd_config original no se toca",
    "cat > /etc/ssh/sshd_config.d/10-asirkit.conf <<'EOF'",
    `Port ${p}`,
    "PermitRootLogin no",
    PRO() ? ["# ── PRO · Solo claves, pocos intentos y solo el grupo permitido",
      "PasswordAuthentication no", "KbdInteractiveAuthentication no", "PubkeyAuthentication yes",
      "MaxAuthTries 3", "LoginGraceTime 30", `AllowGroups ${g}`, "X11Forwarding no",
      "ClientAliveInterval 300", "ClientAliveCountMax 2"] : [],
    "EOF",
    "",
    "# Comprueba la sintaxis antes de reiniciar",
    "sshd -t",
    "",
    "# En Ubuntu 24.04 el puerto lo gestiona ssh.socket: hay que recargarlo",
    "systemctl daemon-reload",
    "systemctl restart ssh.socket 2>/dev/null || true",
    "systemctl restart ssh",
    PRO() ? [...PROsec("Fail2ban: bloquea una hora las IP que fallan 5 veces"),
      "cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'",
      "[sshd]", "enabled = true", `port = ${p}`, "maxretry = 5", "findtime = 10m", "bantime = 1h", "EOF",
      "systemctl enable fail2ban", "systemctl restart fail2ban"] : [],
    "",
    ufwSi(PRO() ? `ufw limit from ${S.adminNet} to any port ${p} proto tcp` : `ufw allow ${p}/tcp`),
    `# Prueba desde otro equipo: ssh -p ${p} usuario@${fqdn()}`
  );
}
