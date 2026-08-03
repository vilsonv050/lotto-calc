param(
    [int]$Port = 8787,
    [switch]$NoBrowser,
    [string]$StatisticsPath = ""
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 12
[Net.ServicePointManager]::Expect100Continue = $false

$baseUrl = "http://127.0.0.1:$Port"
$indexPath = Join-Path $PSScriptRoot "index.html"
$appVersion = "1.1"
$curlCommand = Get-Command "curl.exe" -ErrorAction SilentlyContinue
$curlPath = if ($null -ne $curlCommand) { $curlCommand.Source } else { "" }

if ([string]::IsNullOrWhiteSpace($StatisticsPath)) {
    $repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
    $StatisticsPath = Join-Path $repositoryRoot "Scripts\Статистика Тиражей v7.7.js"
}

function Get-ReasonPhrase {
    param([int]$StatusCode)

    switch ($StatusCode) {
        200 { "OK" }
        204 { "No Content" }
        400 { "Bad Request" }
        403 { "Forbidden" }
        404 { "Not Found" }
        405 { "Method Not Allowed" }
        502 { "Bad Gateway" }
        default { "Internal Server Error" }
    }
}

function Send-Bytes {
    param(
        [IO.Stream]$Stream,
        [byte[]]$Body,
        [int]$StatusCode = 200,
        [string]$ContentType = "application/octet-stream",
        [string]$ReasonPhrase = "",
        [bool]$HeadersOnly = $false
    )

    if ([string]::IsNullOrWhiteSpace($ReasonPhrase)) {
        $ReasonPhrase = Get-ReasonPhrase -StatusCode $StatusCode
    }

    if ($null -eq $Body) {
        $Body = [byte[]]::new(0)
    }

    $headerLines = @(
        "HTTP/1.1 $StatusCode $ReasonPhrase",
        "Content-Type: $ContentType",
        "Content-Length: $($Body.Length)",
        "Cache-Control: no-store",
        "X-Content-Type-Options: nosniff",
        "Connection: close",
        "",
        ""
    )
    $headerBytes = [Text.Encoding]::ASCII.GetBytes(($headerLines -join "`r`n"))
    $Stream.Write($headerBytes, 0, $headerBytes.Length)

    if (-not $HeadersOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }

    $Stream.Flush()
}

function Send-Text {
    param(
        [IO.Stream]$Stream,
        [string]$Text,
        [int]$StatusCode = 200,
        [string]$ContentType = "text/plain; charset=utf-8",
        [bool]$HeadersOnly = $false
    )

    Send-Bytes `
        -Stream $Stream `
        -Body ([Text.Encoding]::UTF8.GetBytes($Text)) `
        -StatusCode $StatusCode `
        -ContentType $ContentType `
        -HeadersOnly $HeadersOnly
}

function Invoke-OfficialApi {
    param(
        [string]$Url,
        [Net.Http.HttpClient]$HttpClient,
        [string]$CurlPath
    )

    $remoteResponse = $null
    try {
        $remoteResponse = $HttpClient.GetAsync(
            $Url,
            [Net.Http.HttpCompletionOption]::ResponseHeadersRead
        ).GetAwaiter().GetResult()

        $contentType = "application/octet-stream"
        if ($null -ne $remoteResponse.Content.Headers.ContentType) {
            $contentType = $remoteResponse.Content.Headers.ContentType.ToString()
        }

        return [PSCustomObject]@{
            StatusCode = [int]$remoteResponse.StatusCode
            ContentType = $contentType
            Body = $remoteResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        }
    } catch {
        $primaryError = $_.Exception.GetBaseException().Message
    } finally {
        if ($null -ne $remoteResponse) {
            $remoteResponse.Dispose()
        }
    }

    if ([string]::IsNullOrWhiteSpace($CurlPath)) {
        throw $primaryError
    }

    $temporaryBody = [IO.Path]::GetTempFileName()

    try {
        $curlArguments = @(
            "--silent", "--show-error", "--compressed",
            "--max-time", "60",
            "--output", $temporaryBody,
            "--write-out", "%{http_code}`n%{content_type}",
            "--", $Url
        )
        $metadata = @(& $CurlPath @curlArguments)
        $curlExitCode = $LASTEXITCODE

        if ($curlExitCode -ne 0 -or $metadata.Count -lt 1) {
            throw "$primaryError; curl.exe завершился с кодом $curlExitCode."
        }

        $statusCode = 0
        if (-not [int]::TryParse([string]$metadata[0], [ref]$statusCode)) {
            throw "Не удалось определить статус ответа официального API."
        }

        $fallbackContentType = "application/octet-stream"
        if ($metadata.Count -ge 2 -and
            -not [string]::IsNullOrWhiteSpace([string]$metadata[1])) {
            $fallbackContentType = [string]$metadata[1]
        }

        return [PSCustomObject]@{
            StatusCode = $statusCode
            ContentType = $fallbackContentType
            Body = [IO.File]::ReadAllBytes($temporaryBody)
        }
    } finally {
        if (Test-Path -LiteralPath $temporaryBody) {
            Remove-Item -LiteralPath $temporaryBody -Force
        }
    }
}

function Handle-Client {
    param(
        [Net.Sockets.TcpClient]$Client,
        [string]$BaseUrl,
        [string]$IndexPath,
        [string]$StatisticsPath,
        [string]$AppVersion,
        [Net.Http.HttpClient]$HttpClient,
        [string]$CurlPath,
        [hashtable]$ServerState
    )

    $stream = $null

    try {
        $stream = $Client.GetStream()
        $reader = [IO.StreamReader]::new(
            $stream,
            [Text.Encoding]::ASCII,
            $false,
            4096,
            $true
        )

        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            return
        }

        $parts = $requestLine.Split(" ")
        if ($parts.Length -lt 2) {
            Send-Text -Stream $stream -Text "Некорректный HTTP-запрос." -StatusCode 400
            return
        }

        $method = $parts[0].ToUpperInvariant()
        $target = $parts[1]
        $headersOnly = $method -eq "HEAD"

        for ($headerCount = 0; $headerCount -lt 100; $headerCount++) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) {
                break
            }
        }

        if ($method -ne "GET" -and $method -ne "HEAD") {
            Send-Text `
                -Stream $stream `
                -Text "Поддерживаются только GET и HEAD." `
                -StatusCode 405 `
                -HeadersOnly $headersOnly
            return
        }

        $requestUri = [Uri]("$BaseUrl$target")
        $path = [Uri]::UnescapeDataString($requestUri.AbsolutePath)
        $query = $requestUri.Query

        if ($path -eq "/" -or $path -eq "/index.html") {
            Send-Bytes `
                -Stream $stream `
                -Body ([IO.File]::ReadAllBytes($IndexPath)) `
                -ContentType "text/html; charset=utf-8" `
                -HeadersOnly $headersOnly
            return
        }

        if ($path -eq "/statistics.js") {
            Send-Bytes `
                -Stream $stream `
                -Body ([IO.File]::ReadAllBytes($StatisticsPath)) `
                -ContentType "text/javascript; charset=utf-8" `
                -HeadersOnly $headersOnly
            return
        }

        if ($path -eq "/health") {
            $health = @{
                ok = $true
                app = "NLOTO Local Statistics"
                version = $AppVersion
                statistics = "7.7"
                parallel = $true
            } | ConvertTo-Json -Compress
            Send-Text `
                -Stream $stream `
                -Text $health `
                -ContentType "application/json; charset=utf-8" `
                -HeadersOnly $headersOnly
            return
        }

        if ($path -eq "/favicon.ico") {
            Send-Bytes `
                -Stream $stream `
                -Body ([byte[]]::new(0)) `
                -StatusCode 204 `
                -ContentType "image/x-icon" `
                -HeadersOnly $headersOnly
            return
        }

        if ($path -eq "/shutdown") {
            Send-Text `
                -Stream $stream `
                -Text '{"ok":true,"message":"Приложение остановлено"}' `
                -ContentType "application/json; charset=utf-8" `
                -HeadersOnly $headersOnly
            $ServerState.Running = $false
            return
        }

        $remoteUrl = $null

        if ($path.StartsWith("/proxy/napi/", [StringComparison]::Ordinal)) {
            $remotePath = $path.Substring("/proxy/napi/".Length)
            $remoteUrl =
                "https://static.nationallottery.ru/_next/image/napi/" +
                $remotePath +
                $query
        } elseif ($path -eq "/proxy/dictionaries") {
            $remoteUrl =
                "https://static.nationallottery.ru/_next/image/dictionaries" +
                $query
        }

        if ($null -eq $remoteUrl) {
            Send-Text `
                -Stream $stream `
                -Text "Маршрут не найден." `
                -StatusCode 404 `
                -HeadersOnly $headersOnly
            return
        }

        try {
            $remoteResponse = Invoke-OfficialApi `
                -Url $remoteUrl `
                -HttpClient $HttpClient `
                -CurlPath $CurlPath
            Send-Bytes `
                -Stream $stream `
                -Body $remoteResponse.Body `
                -StatusCode $remoteResponse.StatusCode `
                -ContentType $remoteResponse.ContentType `
                -ReasonPhrase "Upstream Response" `
                -HeadersOnly $headersOnly
        } catch {
            $message = @{
                ok = $false
                error = "Официальный API NLOTO временно недоступен"
                detail = $_.Exception.GetBaseException().Message
            } | ConvertTo-Json -Compress
            Send-Text `
                -Stream $stream `
                -Text $message `
                -StatusCode 502 `
                -ContentType "application/json; charset=utf-8" `
                -HeadersOnly $headersOnly
        }
    } catch {
        if ($null -ne $stream) {
            try {
                Send-Text `
                    -Stream $stream `
                    -Text "Ошибка локального приложения." `
                    -StatusCode 500
            } catch {
                # Клиент уже мог закрыть соединение.
            }
        }
    } finally {
        $Client.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    throw "Не найден файл интерфейса: $indexPath"
}

if (-not (Test-Path -LiteralPath $StatisticsPath -PathType Leaf)) {
    throw "Не найден скрипт статистики: $StatisticsPath"
}

try {
    $existing = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 1
    if ($existing.StatusCode -eq 200) {
        $existingHealth = $existing.Content | ConvertFrom-Json
        if ($existingHealth.app -ne "NLOTO Local Statistics") {
            throw "Локальный порт $Port занят другой программой."
        }

        if ([string]$existingHealth.version -eq $appVersion) {
            if (-not $NoBrowser) {
                Start-Process "$baseUrl/"
            }
            exit 0
        }

        Invoke-WebRequest `
            -Uri "$baseUrl/shutdown" `
            -UseBasicParsing `
            -TimeoutSec 3 | Out-Null
        Start-Sleep -Milliseconds 500
    }
} catch {
    if ($_.Exception.Message -like "*занят другой программой*") {
        throw
    }
}

$handler = [Net.Http.HttpClientHandler]::new()
$handler.AutomaticDecompression =
    [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
$handler.MaxConnectionsPerServer = 8

$http = [Net.Http.HttpClient]::new($handler)
$http.Timeout = [TimeSpan]::FromSeconds(60)
$http.DefaultRequestHeaders.UserAgent.ParseAdd("NLOTO-Local-Statistics/1.1")

$initialSessionState =
    [Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
$workerFunctionNames = @(
    "Get-ReasonPhrase",
    "Send-Bytes",
    "Send-Text",
    "Invoke-OfficialApi",
    "Handle-Client"
)

foreach ($functionName in $workerFunctionNames) {
    $definition = (Get-Item "function:$functionName").Definition
    $entry = [Management.Automation.Runspaces.SessionStateFunctionEntry]::new(
        $functionName,
        $definition
    )
    $initialSessionState.Commands.Add($entry)
}

$runspacePool = [RunspaceFactory]::CreateRunspacePool(
    1,
    12,
    $initialSessionState,
    $Host
)
$runspacePool.Open()

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
$serverState = [hashtable]::Synchronized(@{ Running = $true })
$activeWorkers = [Collections.ArrayList]::new()

function Complete-FinishedWorkers {
    for ($workerIndex = $activeWorkers.Count - 1; $workerIndex -ge 0; $workerIndex--) {
        $worker = $activeWorkers[$workerIndex]
        if (-not $worker.Handle.IsCompleted) {
            continue
        }

        try {
            $null = $worker.Pipeline.EndInvoke($worker.Handle)
        } catch {
            Write-Warning $_.Exception.GetBaseException().Message
        } finally {
            $worker.Pipeline.Dispose()
            $activeWorkers.RemoveAt($workerIndex)
        }
    }
}

if (-not $NoBrowser) {
    Start-Process "$baseUrl/"
}

try {
    while ($serverState.Running) {
        if ($listener.Pending()) {
            $client = $listener.AcceptTcpClient()
            $pipeline = [PowerShell]::Create()
            $pipeline.RunspacePool = $runspacePool
            $null = $pipeline.AddCommand("Handle-Client")
            $null = $pipeline.AddParameter("Client", $client)
            $null = $pipeline.AddParameter("BaseUrl", $baseUrl)
            $null = $pipeline.AddParameter("IndexPath", $indexPath)
            $null = $pipeline.AddParameter("StatisticsPath", $StatisticsPath)
            $null = $pipeline.AddParameter("AppVersion", $appVersion)
            $null = $pipeline.AddParameter("HttpClient", $http)
            $null = $pipeline.AddParameter("CurlPath", $curlPath)
            $null = $pipeline.AddParameter("ServerState", $serverState)
            $handle = $pipeline.BeginInvoke()
            $null = $activeWorkers.Add([PSCustomObject]@{
                Pipeline = $pipeline
                Handle = $handle
            })
        } else {
            Start-Sleep -Milliseconds 15
        }

        Complete-FinishedWorkers
    }
} finally {
    $listener.Stop()

    foreach ($worker in @($activeWorkers)) {
        try {
            $null = $worker.Pipeline.EndInvoke($worker.Handle)
        } catch {
            Write-Warning $_.Exception.GetBaseException().Message
        } finally {
            $worker.Pipeline.Dispose()
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()
    $http.Dispose()
    $handler.Dispose()
}
