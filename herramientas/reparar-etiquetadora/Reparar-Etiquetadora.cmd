<# : parte de cmd; PowerShell la ve como un comentario
@echo off
setlocal
set "SUM_FICHERO=%~f0"
set "SUM_MODO=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([IO.File]::ReadAllText($env:SUM_FICHERO, [Text.Encoding]::UTF8))"
set "SALIDA=%ERRORLEVEL%"
endlocal & exit /b %SALIDA%
#>

# ─────────────────────────────────────────────────────────────────────────────
# Reparar-Etiquetadora — SUM Logística
#
# Una etiquetadora de red recibe la IP prestada del router. Cuando el router le
# da otra, Windows la sigue buscando en la antigua y la da por desconectada.
#
# Esta herramienta no toca la impresora: enseña a Windows a seguirla. Apunta su
# MAC (la matrícula de fábrica, que no cambia nunca) y, cuando la IP cambia, la
# busca por esa matrícula en la red y corrige el puerto de la impresora.
#
# Modos (primer argumento del .cmd):
#   (nada)     doble clic: revisa, repara y deja la vigilancia instalada
#   vigilar    lo que ejecuta la tarea programada, sin ventana ni preguntas
#   quitar     desinstala la vigilancia
#   simulacro  lo mira todo y dice lo que haría, sin cambiar nada
#   funciones  sólo carga las funciones (para probarlas sueltas)
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

$MODO      = "$env:SUM_MODO".Trim().ToLower()
$SIMULACRO = ($MODO -eq 'simulacro')
$VIGILAR   = ($MODO -eq 'vigilar')

$CARPETA = if ($env:SUM_CARPETA) { $env:SUM_CARPETA } else { Join-Path $env:ProgramData 'SUM-Etiquetadora' }
$FICHA   = Join-Path $CARPETA 'etiquetadoras.json'
$DIARIO  = Join-Path $CARPETA 'diario.log'
$COPIA   = Join-Path $CARPETA 'Reparar-Etiquetadora.cmd'
$TAREA   = 'SUM Etiquetadora'
$CADA_MINUTOS = 15
$PUERTO_RAW   = 9100

# Impresoras que no son de papel: no se ofrecen nunca
$VIRTUALES = 'PDF|XPS|OneNote|Fax|PaperPort|Tungsten|Send to|Enviar a|AnyDesk|TeamViewer|Virtual'
# Marcas y palabras que delatan a una etiquetadora
$MARCAS = 'zebra|zdesigner|tsc|godex|dymo|bixolon|honeywell|datamax|intermec|citizen|argox|sato|munbyn|xprinter|gprinter|hprt|idprt|rollo|phomemo|nelko|brother (ql|td|pt)|toshiba b-|label|etiquet'

# ─── Decir y anotar ──────────────────────────────────────────────────────────

function Anotar([string]$texto) {
    if ($SIMULACRO) { return }
    try {
        if (-not (Test-Path $CARPETA)) { New-Item -ItemType Directory -Path $CARPETA -Force | Out-Null }
        if ((Test-Path $DIARIO) -and (Get-Item $DIARIO).Length -gt 1MB) {
            $ultimas = Get-Content $DIARIO -Tail 2000 -Encoding UTF8
            Set-Content -Path $DIARIO -Value $ultimas -Encoding UTF8
        }
        Add-Content -Path $DIARIO -Value ("{0}  {1}" -f (Get-Date -Format 'dd/MM/yyyy HH:mm:ss'), $texto) -Encoding UTF8
    } catch {}
}

# -Rutina: lo que en la vigilancia no merece una línea cada 15 minutos
function Decir([string]$texto, [string]$color = 'Gray', [switch]$Rutina) {
    if (-not $VIGILAR) { Write-Host $texto -ForegroundColor $color }
    if ($texto.Trim() -and -not ($VIGILAR -and $Rutina)) { Anotar $texto.Trim() }
}

function Preguntar([string]$texto, [string]$porDefecto) {
    if ($env:SUM_SIN_PREGUNTAS) { return $porDefecto }
    $respuesta = Read-Host $texto
    if ([string]::IsNullOrWhiteSpace($respuesta)) { return $porDefecto }
    return $respuesta.Trim()
}

function EsAdministrador {
    $yo = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ─── La red ──────────────────────────────────────────────────────────────────

function A-Entero([string]$ip) {
    $b = ([Net.IPAddress]::Parse($ip)).GetAddressBytes()
    return ([long]$b[0] * 16777216) + ([long]$b[1] * 65536) + ([long]$b[2] * 256) + [long]$b[3]
}

function A-IP([long]$n) {
    return '{0}.{1}.{2}.{3}' -f (($n -shr 24) -band 255), (($n -shr 16) -band 255), (($n -shr 8) -band 255), ($n -band 255)
}

function EsUnaIP([string]$texto) {
    return ($texto -match '^\d{1,3}(\.\d{1,3}){3}$')
}

function LimpiarMac([string]$mac) {
    return ($mac -replace '[^0-9A-Fa-f]', '').ToUpper()
}

function MacBonita([string]$mac) {
    if (-not $mac) { return '' }
    return (($mac -split '(..)' | Where-Object { $_ }) -join '-')
}

function RedesLocales {
    $redes = @()
    try {
        $redes = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and "$($_.AddressState)" -eq 'Preferred' } |
            ForEach-Object { [pscustomobject]@{ IP = $_.IPAddress; Prefijo = [int]$_.PrefixLength } })
    } catch {}
    return $redes
}

# ¿Está esa IP en la misma red que el ordenador? Sólo entonces se le ve la MAC.
function EnMiRed([string]$ip) {
    $n = A-Entero $ip
    foreach ($red in @(RedesLocales)) {
        $tamano = [long][math]::Pow(2, 32 - $red.Prefijo)
        if ([math]::Floor($n / $tamano) -eq [math]::Floor((A-Entero $red.IP) / $tamano)) { return $true }
    }
    return $false
}

function DireccionesParaBuscar {
    $todas = New-Object 'System.Collections.Generic.HashSet[string]'
    $mias = @(RedesLocales)
    foreach ($red in $mias) {
        $prefijo = $red.Prefijo
        if ($prefijo -lt 22) { $prefijo = 24 }   # red enorme: sólo el tramo del ordenador
        if ($prefijo -gt 30) { continue }
        $tamano = [long][math]::Pow(2, 32 - $prefijo)
        $base = [long][math]::Floor((A-Entero $red.IP) / $tamano) * $tamano
        for ($i = 1; $i -lt ($tamano - 1); $i++) { [void]$todas.Add((A-IP ($base + $i))) }
    }
    foreach ($red in $mias) { [void]$todas.Remove($red.IP) }
    return @($todas)
}

function RespondeAlPing([string]$ip) {
    $ping = New-Object Net.NetworkInformation.Ping
    try {
        # Tres intentos largos: una impresora dormida por wifi tarda en despertar
        for ($i = 0; $i -lt 3; $i++) {
            if ("$($ping.Send($ip, 1000).Status)" -eq 'Success') { return $true }
        }
    } catch {} finally { $ping.Dispose() }
    return $false
}

function AbrePuerto([string]$ip, [int]$puerto, [int]$espera = 1500) {
    $cliente = New-Object Net.Sockets.TcpClient
    try {
        $tarea = $cliente.ConnectAsync($ip, $puerto)
        if ($tarea.Wait($espera) -and $cliente.Connected) { return $true }
    } catch {} finally { $cliente.Close() }
    return $false
}

# Primero el ping, que no molesta a la impresora; el puerto de imprimir sólo si no contesta.
function Responde([string]$ip) {
    if (RespondeAlPing $ip) { return $true }
    return (AbrePuerto $ip $PUERTO_RAW)
}

# Llama a todas las direcciones a la vez: quien esté encendido queda apuntado,
# con su MAC, en la tabla de vecinos de Windows.
function BarrerRed($direcciones) {
    $llamadas = @(foreach ($ip in $direcciones) {
        $ping = New-Object Net.NetworkInformation.Ping
        try { [pscustomobject]@{ Ping = $ping; Tarea = $ping.SendPingAsync($ip, 700) } } catch { $ping.Dispose() }
    })
    if ($llamadas.Count -eq 0) { return }
    try { [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($llamadas | ForEach-Object { $_.Tarea }), 5000) } catch {}
    foreach ($llamada in $llamadas) { try { $llamada.Ping.Dispose() } catch {} }
}

function TablaDeVecinos {
    $filas = @()
    try {
        $filas = @(Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.LinkLayerAddress -and "$($_.State)" -ne 'Unreachable' -and "$($_.State)" -ne 'Incomplete' } |
            ForEach-Object { [pscustomobject]@{ IP = "$($_.IPAddress)"; Mac = (LimpiarMac $_.LinkLayerAddress) } })
    } catch {
        # Windows sin Get-NetNeighbor: se lee lo que escribe arp -a
        $filas = @(& arp.exe -a | ForEach-Object {
            if ($_ -match '^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}(-[0-9a-fA-F]{2}){5})\s') {
                [pscustomobject]@{ IP = $Matches[1]; Mac = (LimpiarMac $Matches[2]) }
            }
        })
    }
    # Fuera las direcciones de difusión, que no son de ningún aparato
    return @($filas | Where-Object { $_.Mac.Length -eq 12 -and $_.Mac -ne '000000000000' -and $_.Mac -ne 'FFFFFFFFFFFF' -and $_.Mac -notlike '01005E*' })
}

# La MAC de un aparato que acaba de contestar. Si no contesta no se da ninguna:
# la tabla de vecinos guarda un rato la del que tuvo esa IP antes.
function MacDe([string]$ip) {
    if (-not (EnMiRed $ip)) { return $null }
    if (-not (Responde $ip)) { return $null }
    $fila = TablaDeVecinos | Where-Object { $_.IP -eq $ip } | Select-Object -First 1
    if ($fila) { return $fila.Mac }
    return $null
}

function BuscarPorMac([string]$mac) {
    BarrerRed (DireccionesParaBuscar)
    $sitios = @(TablaDeVecinos | Where-Object { $_.Mac -eq $mac } | ForEach-Object { $_.IP } | Select-Object -Unique)
    foreach ($ip in $sitios) {
        if (Responde $ip) { return $ip }
    }
    return $null
}

# Aparatos de la red que aceptan trabajos de impresión (puerto 9100)
function BuscarImpresorasEnRed {
    $intentos = @(foreach ($ip in (DireccionesParaBuscar)) {
        $cliente = New-Object Net.Sockets.TcpClient
        try { [pscustomobject]@{ IP = $ip; Cliente = $cliente; Tarea = $cliente.ConnectAsync($ip, $PUERTO_RAW) } } catch { $cliente.Close() }
    })
    if ($intentos.Count -eq 0) { return @() }
    try { [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($intentos | ForEach-Object { $_.Tarea }), 3000) } catch {}
    $abiertas = @($intentos | Where-Object { "$($_.Tarea.Status)" -eq 'RanToCompletion' -and $_.Cliente.Connected } | ForEach-Object { $_.IP })
    foreach ($intento in $intentos) { try { $intento.Cliente.Close() } catch {} }
    return $abiertas
}

# Cómo se presenta el aparato: el título de su página web o su nombre en la red
function NombreDelAparato([string]$ip) {
    try {
        $pagina = Invoke-WebRequest -Uri "http://$ip/" -UseBasicParsing -TimeoutSec 2
        if ($pagina.Content -match '<title[^>]*>\s*([^<]+?)\s*</title>') { return $Matches[1] }
    } catch {}
    try { return [Net.Dns]::GetHostEntry($ip).HostName } catch {}
    return 'sin nombre'
}

# La MAC que va escondida dentro de una dirección IPv6 local (fe80::...ff:fe...)
function MacDesdeIPv6($direccion) {
    $b = $direccion.GetAddressBytes()
    if ($b.Length -ne 16 -or $b[11] -ne 0xFF -or $b[12] -ne 0xFE) { return $null }
    return (('{0:X2}{1:X2}{2:X2}{3:X2}{4:X2}{5:X2}') -f ($b[8] -bxor 2), $b[9], $b[10], $b[13], $b[14], $b[15])
}

# El puerto puede llevar una IP o un nombre de red (las Brother: BRW + su MAC).
# Un nombre a veces sólo devuelve la dirección IPv6: de ella, o del propio
# nombre, se saca la MAC y se busca la IP en la tabla de vecinos.
function ResolverDireccion([string]$direccion) {
    if (-not $direccion) { return $null }
    if (EsUnaIP $direccion) { return $direccion }

    $respuestas = @()
    try { $respuestas = @([Net.Dns]::GetHostAddresses($direccion)) } catch {}
    $ip = $respuestas | Where-Object { "$($_.AddressFamily)" -eq 'InterNetwork' } | Select-Object -First 1
    if ($ip) { return $ip.IPAddressToString }

    try {
        $registro = Resolve-DnsName -Name $direccion -Type A -ErrorAction Stop | Where-Object { "$($_.Type)" -eq 'A' -and $_.IPAddress } | Select-Object -First 1
        if ($registro) { return "$($registro.IPAddress)" }
    } catch {}

    $mac = $null
    foreach ($respuesta in $respuestas) {
        if (-not $mac -and "$($respuesta.AddressFamily)" -eq 'InterNetworkV6') { $mac = MacDesdeIPv6 $respuesta }
    }
    if (-not $mac -and $direccion -match '([0-9A-Fa-f]{12})$') { $mac = $Matches[1].ToUpper() }
    if ($mac) {
        $fila = TablaDeVecinos | Where-Object { $_.Mac -eq $mac } | Select-Object -First 1
        if ($fila -and (Responde $fila.IP)) { return $fila.IP }
        return (BuscarPorMac $mac)
    }
    return $null
}

# ─── Las impresoras de Windows ───────────────────────────────────────────────

function ImpresorasDeVerdad {
    return @(Get-Printer | Where-Object {
        "$($_.Name) $($_.DriverName) $($_.PortName)" -notmatch $VIRTUALES -and
        $_.PortName -notmatch '^(PORTPROMPT:|nul:|FILE:)$' -and
        "$($_.Type)" -ne 'Connection'
    } | Sort-Object Name)
}

function PuertoDe($impresora) {
    try { return (Get-PrinterPort -Name $impresora.PortName -ErrorAction Stop) } catch { return $null }
}

function TipoDePuerto($puerto, [string]$nombre) {
    if ($nombre -match '^USB\d+') { return 'usb' }
    if ($nombre -match '^(COM|LPT)\d') { return 'cable' }
    if ($nombre -match '^WSD') { return 'wsd' }
    if ($puerto -and ("$($puerto.PortMonitor)" -match 'TCPMON' -or $puerto.PrinterHostAddress)) { return 'red' }
    return 'otro'
}

# Las IP que ya usan las demás impresoras instaladas, para no confundirlas con la etiquetadora
function DireccionesDeLasDemas([string]$menosEsta) {
    $ocupadas = @()
    foreach ($otra in @(ImpresorasDeVerdad | Where-Object { $_.Name -ne $menosEsta })) {
        $puerto = PuertoDe $otra
        if ($puerto -and $puerto.PrinterHostAddress) {
            $ip = ResolverDireccion $puerto.PrinterHostAddress
            if ($ip) { $ocupadas += $ip }
        }
    }
    return $ocupadas
}

function ElegirImpresora {
    $todas = @(ImpresorasDeVerdad)
    if ($todas.Count -eq 0) { throw 'No hay ninguna impresora instalada en este ordenador. Primero hay que instalarla con su driver.' }

    if ($env:SUM_IMPRESORA) {
        $pedida = $todas | Where-Object { $_.Name -eq $env:SUM_IMPRESORA } | Select-Object -First 1
        if ($pedida) { return $pedida }
    }

    $etiquetadoras = @($todas | Where-Object { "$($_.Name) $($_.DriverName)" -match $MARCAS })
    if ($etiquetadoras.Count -eq 1) {
        Decir "Etiquetadora encontrada: «$($etiquetadoras[0].Name)»" 'Cyan'
        return $etiquetadoras[0]
    }

    Write-Host ''
    Write-Host 'Impresoras de este ordenador:' -ForegroundColor Cyan
    for ($i = 0; $i -lt $todas.Count; $i++) {
        Write-Host ("  {0}. {1}   [{2}]" -f ($i + 1), $todas[$i].Name, $todas[$i].PortName)
    }
    Write-Host ''
    while ($true) {
        $numero = Preguntar '¿Cuál es la etiquetadora? Escribe su número y pulsa Intro' '1'
        if ($numero -match '^\d+$' -and [int]$numero -ge 1 -and [int]$numero -le $todas.Count) { return $todas[[int]$numero - 1] }
        Write-Host '  Ese número no está en la lista.' -ForegroundColor Yellow
    }
}

function ApuntarImpresora($impresora, [string]$ip, $puertoViejo) {
    $nombrePuerto = "SUM_$ip"
    if ($SIMULACRO) {
        Decir "  (simulacro) Pondría «$($impresora.Name)» en el puerto $nombrePuerto" 'Magenta'
        return
    }

    $existe = $false
    try { if (Get-PrinterPort -Name $nombrePuerto -ErrorAction Stop) { $existe = $true } } catch {}
    if (-not $existe) {
        if ($puertoViejo -and $puertoViejo.Protocol -eq 2 -and $puertoViejo.LprQueueName) {
            Add-PrinterPort -Name $nombrePuerto -LprHostAddress $ip -LprQueueName $puertoViejo.LprQueueName
        } else {
            $numero = $PUERTO_RAW
            if ($puertoViejo -and $puertoViejo.PortNumber -gt 0) { $numero = $puertoViejo.PortNumber }
            Add-PrinterPort -Name $nombrePuerto -PrinterHostAddress $ip -PortNumber $numero
        }
    }
    Set-Printer -Name $impresora.Name -PortName $nombrePuerto

    # Los puertos que esta herramienta creó otras veces y ya no usa nadie
    $enUso = @(Get-Printer | ForEach-Object { $_.PortName })
    foreach ($viejo in @(Get-PrinterPort | Where-Object { $_.Name -like 'SUM_*' -and $_.Name -ne $nombrePuerto -and $enUso -notcontains $_.Name })) {
        try { Remove-PrinterPort -Name $viejo.Name -ErrorAction Stop } catch {}
    }
}

# Windows a veces deja marcada «Usar impresora sin conexión» y no la quita solo
function QuitarSinConexion($impresora) {
    if ($SIMULACRO) { return }
    try {
        $w = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $impresora.Name } | Select-Object -First 1
        if ($w -and $w.WorkOffline) {
            Set-CimInstance -InputObject $w -Property @{ WorkOffline = $false }
            Decir '  Tenía marcado «Usar impresora sin conexión»: quitado.' 'Green'
        }
    } catch {}
}

# ─── La ficha: qué etiquetadoras se vigilan ──────────────────────────────────

function LeerFicha {
    if (-not (Test-Path $FICHA)) { return @() }
    try {
        $texto = [IO.File]::ReadAllText($FICHA, [Text.Encoding]::UTF8)
        # ConvertFrom-Json entrega la lista entera como una sola pieza: hay que desenrollarla
        $datos = $texto | ConvertFrom-Json
        return @($datos | ForEach-Object { $_ } | Where-Object { $_.Impresora })
    } catch { return @() }
}

function GuardarEnFicha([string]$impresora, [string]$mac, [string]$ip) {
    if ($SIMULACRO) { return }
    $resto = @(LeerFicha | Where-Object { $_.Impresora -ne $impresora })
    $nueva = [pscustomobject]@{ Impresora = $impresora; Mac = $mac; UltimaIP = $ip; Revisada = (Get-Date -Format 'dd/MM/yyyy HH:mm') }
    $lista = @($resto) + @($nueva)
    if (-not (Test-Path $CARPETA)) { New-Item -ItemType Directory -Path $CARPETA -Force | Out-Null }
    [IO.File]::WriteAllText($FICHA, (ConvertTo-Json -InputObject @($lista)), (New-Object Text.UTF8Encoding($false)))
}

# ─── Revisar una etiquetadora ────────────────────────────────────────────────
# Devuelve Estado: bien | reparada | no-encontrada | usb | sin-tocar

function RevisarImpresora($impresora, [string]$macGuardada) {
    $puerto = PuertoDe $impresora
    $tipo = TipoDePuerto $puerto $impresora.PortName
    $resultado = [pscustomobject]@{ Estado = 'sin-tocar'; IP = $null; Mac = $macGuardada }

    Decir '' -Rutina
    Decir "Impresora: $($impresora.Name)" 'White' -Rutina
    Decir "  Puerto en Windows: $($impresora.PortName)" -Rutina

    if ($tipo -eq 'usb' -or $tipo -eq 'cable') {
        Decir '  Va por cable al ordenador, no por red: la IP no le afecta.' 'Yellow' -Rutina
        Decir '  Si Windows ha creado una «(Copia 1)», es por enchufarla en otra toma USB:' -Rutina
        Decir '  hay que volver a la toma de siempre o imprimir en la copia.' -Rutina
        $resultado.Estado = 'usb'
        return $resultado
    }

    $direccion = if ($puerto) { "$($puerto.PrinterHostAddress)" } else { '' }
    $ip = ResolverDireccion $direccion
    if ($direccion) { Decir "  Windows la busca en: $direccion" -Rutina }

    # ¿Sigue donde Windows cree, y es ella y no otro aparato que heredó su IP?
    if ($ip -and (Responde $ip)) {
        $macAhora = MacDe $ip
        if (-not $macGuardada -or -not $macAhora -or $macAhora -eq $macGuardada) {
            Decir "  Contesta en $ip. Está bien configurada." 'Green' -Rutina
            QuitarSinConexion $impresora
            $resultado.Estado = 'bien'
            $resultado.IP = $ip
            if ($macAhora) { $resultado.Mac = $macAhora }
            return $resultado
        }
        Decir "  En $ip contesta otro aparato: el router le ha dado a otro la IP de la etiquetadora." 'Yellow'
    } elseif ($direccion) {
        Decir "  En $direccion no contesta nadie." 'Yellow' -Rutina
    }

    # Con matrícula apuntada se la busca a ella y a nadie más
    if ($macGuardada) {
        Decir "  Buscándola en la red por su matrícula ($(MacBonita $macGuardada))..." -Rutina
        $nueva = BuscarPorMac $macGuardada
        if (-not $nueva) {
            Decir '  No aparece en la red: está apagada, sin cable o sin wifi.' 'Red' -Rutina
            $resultado.Estado = 'no-encontrada'
            return $resultado
        }
        # Está donde Windows ya la buscaba (tardó en contestar, o el puerto va por
        # nombre de red y lleva a esa misma IP): no hay nada que cambiar
        $yaApuntaAhi = ($ip -eq $nueva)
        if (-not $yaApuntaAhi -and $direccion -and -not (EsUnaIP $direccion)) { $yaApuntaAhi = ((ResolverDireccion $direccion) -eq $nueva) }
        if ($yaApuntaAhi) {
            Decir "  Contesta en $nueva. Está bien configurada." 'Green' -Rutina
            $resultado.Estado = 'bien'
            $resultado.IP = $nueva
            return $resultado
        }
        Decir "  Encontrada en $nueva (antes $direccion)." 'Green'
        ApuntarImpresora $impresora $nueva $puerto
        QuitarSinConexion $impresora
        Decir "  Windows ya imprime en $nueva." 'Green'
        $resultado.Estado = 'reparada'
        $resultado.IP = $nueva
        return $resultado
    }

    # Primera vez y ya perdida: no hay matrícula, hay que reconocerla entre las que haya
    if ($VIGILAR) { return $resultado }

    if ($tipo -eq 'wsd' -or $tipo -eq 'otro') {
        Decir '  Este puerto no es de dirección fija: Windows busca la impresora por su cuenta.' 'Yellow'
        $cambiar = Preguntar '  ¿Buscarla en la red y pasarla a un puerto normal? (s/N)' 'n'
        if ($cambiar -notmatch '^[sS]') { return $resultado }
    }

    Decir '  Buscando impresoras encendidas en la red...'
    $ocupadas = @(DireccionesDeLasDemas $impresora.Name)
    $halladas = @(BuscarImpresorasEnRed | Where-Object { $ocupadas -notcontains $_ })

    if ($halladas.Count -eq 0) {
        Decir '  No hay ninguna impresora libre en la red. Comprueba que la etiquetadora' 'Red'
        Decir '  está encendida y con el cable de red (o el wifi) puesto, y vuelve a probar.' 'Red'
        $resultado.Estado = 'no-encontrada'
        return $resultado
    }

    $candidatas = @($halladas | ForEach-Object { [pscustomobject]@{ IP = $_; Nombre = (NombreDelAparato $_) } })
    Write-Host ''
    for ($i = 0; $i -lt $candidatas.Count; $i++) {
        Write-Host ("    {0}. {1}   {2}" -f ($i + 1), $candidatas[$i].IP, $candidatas[$i].Nombre)
    }
    Write-Host ''
    $elegida = $null
    if ($candidatas.Count -eq 1) {
        $si = Preguntar '  Sólo hay una. ¿Es la etiquetadora? (S/n)' 's'
        if ($si -match '^[sS]') { $elegida = $candidatas[0] }
    } else {
        $numero = Preguntar '  ¿Cuál es la etiquetadora? Número (o Intro para no tocar nada)' ''
        if ($numero -match '^\d+$' -and [int]$numero -ge 1 -and [int]$numero -le $candidatas.Count) { $elegida = $candidatas[[int]$numero - 1] }
    }
    if (-not $elegida) {
        Decir '  No se ha cambiado nada.' 'Yellow'
        return $resultado
    }

    ApuntarImpresora $impresora $elegida.IP $puerto
    QuitarSinConexion $impresora
    Decir "  Windows ya imprime en $($elegida.IP)." 'Green'
    $resultado.Estado = 'reparada'
    $resultado.IP = $elegida.IP
    $resultado.Mac = MacDe $elegida.IP
    return $resultado
}

# Lo que se mandó a imprimir mientras estaba perdida saldría ahora todo seguido
function VaciarCola($impresora) {
    if ($SIMULACRO) { return }
    $trabajos = @()
    try { $trabajos = @(Get-PrintJob -PrinterName $impresora.Name -ErrorAction Stop) } catch { return }
    if ($trabajos.Count -eq 0) { return }
    Decir "  Hay $($trabajos.Count) trabajo(s) esperando en la cola: saldrían todos ahora." 'Yellow'
    $borrar = Preguntar '  ¿Borrarlos para que no salgan etiquetas repetidas? (S/n)' 's'
    if ($borrar -notmatch '^[sS]') { return }
    foreach ($trabajo in $trabajos) {
        try { Remove-PrintJob -PrinterName $impresora.Name -ID $trabajo.Id -ErrorAction Stop } catch {}
    }
    Decir '  Cola vaciada.' 'Green'
}

# ─── La vigilancia ───────────────────────────────────────────────────────────

function InstalarVigilancia {
    if ($SIMULACRO) {
        Decir "  (simulacro) Instalaría la vigilancia cada $CADA_MINUTOS minutos" 'Magenta'
        return
    }
    if (-not (Test-Path $CARPETA)) { New-Item -ItemType Directory -Path $CARPETA -Force | Out-Null }
    if ([IO.Path]::GetFullPath($env:SUM_FICHERO) -ne [IO.Path]::GetFullPath($COPIA)) {
        Copy-Item -Path $env:SUM_FICHERO -Destination $COPIA -Force
    }
    # Como SYSTEM: funciona aunque no haya nadie con la sesión abierta y sin pedir permiso cada vez
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & schtasks.exe /Create /TN $TAREA /TR "$COPIA vigilar" /SC MINUTE /MO $CADA_MINUTOS /RU SYSTEM /RL HIGHEST /F 2>&1 | Out-Null
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = $antes
    if ($codigo -ne 0) { throw 'Windows no ha dejado crear la tarea programada de vigilancia.' }
    # En un portátil, que vigile también sin el cargador puesto
    try {
        $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Set-ScheduledTask -TaskName $TAREA -Settings $ajustes | Out-Null
    } catch {}
}

function QuitarVigilancia {
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & schtasks.exe /Delete /TN $TAREA /F 2>&1 | Out-Null
    $ErrorActionPreference = $antes
    foreach ($fichero in @($FICHA, $COPIA)) {
        try { if (Test-Path $fichero) { Remove-Item $fichero -Force -Confirm:$false } } catch {}
    }
    Decir 'Vigilancia quitada. Las impresoras se quedan como están ahora.' 'Green'
}

function Vigilar {
    foreach ($apuntada in @(LeerFicha)) {
        try {
            $impresora = Get-Printer -Name $apuntada.Impresora -ErrorAction Stop
            $r = RevisarImpresora $impresora "$($apuntada.Mac)"
            if ($r.Estado -eq 'reparada') { GuardarEnFicha $apuntada.Impresora $r.Mac $r.IP }
        } catch {
            Anotar "«$($apuntada.Impresora)»: $($_.Exception.Message)"
        }
    }
}

# ─── Doble clic ──────────────────────────────────────────────────────────────

function PedirPermisoDeAdministrador {
    Write-Host 'Hace falta permiso de administrador. Windows lo va a pedir ahora...' -ForegroundColor Yellow
    Start-Process -FilePath $env:ComSpec -ArgumentList "/c `"`"$env:SUM_FICHERO`" $MODO`"" -Verb RunAs
}

function Principal {
    Write-Host ''
    Write-Host '  SUM Logística — Reparar etiquetadora' -ForegroundColor Cyan
    if ($SIMULACRO) { Write-Host '  SIMULACRO: no se cambia nada' -ForegroundColor Magenta }
    Write-Host ''

    $impresora = ElegirImpresora
    $apuntada = LeerFicha | Where-Object { $_.Impresora -eq $impresora.Name } | Select-Object -First 1
    $macGuardada = if ($apuntada) { "$($apuntada.Mac)" } else { '' }

    $r = RevisarImpresora $impresora $macGuardada
    if ($r.Estado -eq 'reparada') { VaciarCola $impresora }

    Write-Host ''
    if ($r.Estado -eq 'bien' -or $r.Estado -eq 'reparada') {
        if ($r.Mac) {
            GuardarEnFicha $impresora.Name $r.Mac $r.IP
            InstalarVigilancia
            Decir "Matrícula apuntada: $(MacBonita $r.Mac)" 'Green'
            Decir "Vigilancia instalada: cada $CADA_MINUTOS minutos se comprueba que Windows la sigue encontrando." 'Green'
            Decir 'Si el router le cambia la IP, se corrige solo.' 'Green'
        } else {
            Decir 'La etiquetadora está en otra red distinta a la del ordenador y no se le ve la matrícula.' 'Yellow'
            Decir 'Sin ella no se la puede vigilar: aquí hay que fijar la IP en el router o en la impresora.' 'Yellow'
        }
    } elseif ($r.Estado -eq 'no-encontrada') {
        Decir 'No se ha podido reparar porque la etiquetadora no aparece en la red.' 'Red'
    }
}

# ─── Arranque ────────────────────────────────────────────────────────────────

if ($MODO -eq 'funciones') { return }

if ($VIGILAR) {
    try { Vigilar } catch { Anotar "Vigilancia: $($_.Exception.Message)" }
    exit 0
}

$salida = 0
$relanzado = $false
try {
    if (-not $SIMULACRO -and -not (EsAdministrador)) {
        PedirPermisoDeAdministrador
        $relanzado = $true
    } elseif ($MODO -eq 'quitar') {
        QuitarVigilancia
    } else {
        Principal
    }
} catch {
    Decir "ERROR: $($_.Exception.Message)" 'Red'
    $salida = 1
}
if (-not $relanzado -and -not $env:SUM_SIN_PREGUNTAS) {
    Write-Host ''
    [void](Read-Host 'Pulsa Intro para cerrar')
}
exit $salida
