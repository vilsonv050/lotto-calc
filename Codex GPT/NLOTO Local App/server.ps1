param(
    [int]$Port = 8787,
    [switch]$NoBrowser,
    [string]$StatisticsPath = ""
)

$ErrorActionPreference = "Stop"

$baseUrl = "http://127.0.0.1:$Port"
$indexPath = Join-Path $PSScriptRoot "index.html"
$curlCommand = Get-Command "curl.exe" -ErrorAction SilentlyContinue

if ($null -eq $curlCommand) {
    throw "Не найден системный компонент curl.exe."
}

$curlPath = $curlCommand.Source

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
    param([string]$Url)

    $temporaryBody = [IO.Path]::GetTempFileName()

    try {
        $curlArguments = @(
            "--silent",
            "--show-error",
            "--compressed",
            "--max-time",
            "60",
            "--output",
            $temporaryBody,
            "--write-out",
            "%{http_code}`n%{content_type}",
            "--",
            $Url
        )

        $metadata = @(& $curlPath @curlArguments)
        $curlExitCode = $LASTEXITCODE

        if ($curlExitCode -ne 0 -or $metadata.Count -lt 1) {
            throw "curl.exe завершился с кодом $curlExitCode."
        }

        $statusCode = 0
        if (-not [int]::TryParse([string]$metadata[0], [ref]$statusCode)) {
            throw "Не удалось определить статус ответа официального API."
        }

        $contentType = "application/octet-stream"
        if ($metadata.Count -ge 2 -and
            -not [string]::IsNullOrWhiteSpace([string]$metadata[1])) {
            $contentType = [string]$metadata[1]
        }

        [PSCustomObject]@{
            StatusCode = $statusCode
            ContentType = $contentType
            Body = [IO.File]::ReadAllBytes($temporaryBody)
        }
    } finally {
        if (Test-Path -LiteralPath $temporaryBody) {
            Remove-Item -LiteralPath $temporaryBody -Force
        }
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
        if (-not $NoBrowser) {
            Start-Process "$baseUrl/"
        }
        exit 0
    }
} catch {
    # На этом порту ещё нет запущенной копии приложения.
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
$running = $true

if (-not $NoBrowser) {
    Start-Process "$baseUrl/"
}

try {
    while ($running) {
        $client = $listener.AcceptTcpClient()
        $stream = $null

        try {
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new(
                $stream,
                [Text.Encoding]::ASCII,
                $false,
                4096,
                $true
            )

            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }

            $parts = $requestLine.Split(" ")
            if ($parts.Length -lt 2) {
                Send-Text -Stream $stream -Text "Некорректный HTTP-запрос." -StatusCode 400
                continue
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
                continue
            }

            $requestUri = [Uri]("$baseUrl$target")
            $path = [Uri]::UnescapeDataString($requestUri.AbsolutePath)
            $query = $requestUri.Query

            if ($path -eq "/" -or $path -eq "/index.html") {
                Send-Bytes `
                    -Stream $stream `
                    -Body ([IO.File]::ReadAllBytes($indexPath)) `
                    -ContentType "text/html; charset=utf-8" `
                    -HeadersOnly $headersOnly
                continue
            }

            if ($path -eq "/statistics.js") {
                Send-Bytes `
                    -Stream $stream `
                    -Body ([IO.File]::ReadAllBytes($StatisticsPath)) `
                    -ContentType "text/javascript; charset=utf-8" `
                    -HeadersOnly $headersOnly
                continue
            }

            if ($path -eq "/health") {
                Send-Text `
                    -Stream $stream `
                    -Text '{"ok":true,"app":"NLOTO Local Statistics","version":"1.0","statistics":"7.7"}' `
                    -ContentType "application/json; charset=utf-8" `
                    -HeadersOnly $headersOnly
                continue
            }

            if ($path -eq "/favicon.ico") {
                Send-Bytes `
                    -Stream $stream `
                    -Body ([byte[]]::new(0)) `
                    -StatusCode 204 `
                    -ContentType "image/x-icon" `
                    -HeadersOnly $headersOnly
                continue
            }

            if ($path -eq "/shutdown") {
                Send-Text `
                    -Stream $stream `
                    -Text '{"ok":true,"message":"Приложение остановлено"}' `
                    -ContentType "application/json; charset=utf-8" `
                    -HeadersOnly $headersOnly
                $running = $false
                continue
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
                continue
            }

            try {
                $remoteResponse = Invoke-OfficialApi -Url $remoteUrl
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
            $client.Dispose()
        }
    }
} finally {
    $listener.Stop()
}
