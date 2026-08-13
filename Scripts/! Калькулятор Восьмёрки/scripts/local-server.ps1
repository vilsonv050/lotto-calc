param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 4175,

  [ValidateRange(0, 1000000)]
  [int]$MaxRequests = 0
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol =
  [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$publicRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\public"))
$publicPrefix = $publicRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

$mimeTypes = @{
  ".css"  = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".txt"  = "text/plain; charset=utf-8"
}

function Get-ReasonPhrase {
  param([int]$StatusCode)

  switch ($StatusCode) {
    200 { "OK" }
    400 { "Bad Request" }
    403 { "Forbidden" }
    404 { "Not Found" }
    405 { "Method Not Allowed" }
    502 { "Bad Gateway" }
    default { "Error" }
  }
}

function Send-Response {
  param(
    [IO.Stream]$Stream,
    [string]$Method,
    [int]$StatusCode,
    [string]$ContentType,
    [byte[]]$Body,
    [string]$CacheControl = "no-cache"
  )

  if ($null -eq $Body) {
    $Body = [byte[]]::new(0)
  }

  $reason = Get-ReasonPhrase $StatusCode
  $headers =
    "HTTP/1.1 $StatusCode $reason`r`n" +
    "Content-Type: $ContentType`r`n" +
    "Content-Length: $($Body.Length)`r`n" +
    "Cache-Control: $CacheControl`r`n" +
    "Connection: close`r`n`r`n"

  $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)

  if ($Method -ne "HEAD" -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

function Send-Json {
  param(
    [IO.Stream]$Stream,
    [string]$Method,
    [int]$StatusCode,
    [hashtable]$Value
  )

  $json = $Value | ConvertTo-Json -Compress
  $body = [Text.Encoding]::UTF8.GetBytes($json)
  Send-Response $Stream $Method $StatusCode "application/json; charset=utf-8" $body "no-store"
}

function Send-StaticFile {
  param(
    [IO.Stream]$Stream,
    [string]$Method,
    [string]$UrlPath
  )

  $decodedPath = [Uri]::UnescapeDataString($UrlPath)
  if ($decodedPath -eq "/") {
    $relativePath = "index.html"
  }
  else {
    $relativePath = $decodedPath.TrimStart("/").Replace("/", [string][IO.Path]::DirectorySeparatorChar)
  }

  $target = [IO.Path]::GetFullPath((Join-Path $publicRoot $relativePath))
  if (-not $target.StartsWith($publicPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Send-Json $Stream $Method 403 @{ error = "Forbidden" }
    return
  }

  if (-not [IO.File]::Exists($target)) {
    Send-Json $Stream $Method 404 @{ error = "Not found" }
    return
  }

  $extension = [IO.Path]::GetExtension($target).ToLowerInvariant()
  $contentType = $mimeTypes[$extension]
  if (-not $contentType) {
    $contentType = "application/octet-stream"
  }

  $body = [IO.File]::ReadAllBytes($target)
  Send-Response $Stream $Method 200 $contentType $body
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)

try {
  $listener.Start()
  Write-Host "Lottery Eights Calculator"
  Write-Host "Local URL: http://127.0.0.1:$Port/"
  Write-Host "Close this window to stop the calculator."

  $servedRequests = 0
  while ($MaxRequests -eq 0 -or $servedRequests -lt $MaxRequests) {
    $client = $listener.AcceptTcpClient()
    $servedRequests++
    $reader = $null
    $stream = $null
    try {
      $client.ReceiveTimeout = 15000
      $client.SendTimeout = 60000
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 8192, $true)
      $requestLine = $reader.ReadLine()

      if (-not $requestLine) {
        continue
      }

      $requestParts = $requestLine.Split(" ", 3)
      if ($requestParts.Length -lt 2) {
        Send-Json $stream "GET" 400 @{ error = "Bad request" }
        continue
      }

      $method = $requestParts[0].ToUpperInvariant()
      $requestTarget = $requestParts[1]
      $headers = @{}

      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
          break
        }
        $separator = $line.IndexOf(":")
        if ($separator -gt 0) {
          $name = $line.Substring(0, $separator).Trim().ToLowerInvariant()
          $headers[$name] = $line.Substring($separator + 1).Trim()
        }
      }

      if ($method -ne "GET" -and $method -ne "HEAD") {
        Send-Json $stream $method 405 @{ error = "Only GET and HEAD are supported" }
        continue
      }

      $requestUri = [Uri]::new("http://127.0.0.1:$Port$requestTarget")
      Send-StaticFile $stream $method $requestUri.AbsolutePath
    }
    catch {
      try {
        if ($stream) {
          Send-Json $stream "GET" 400 @{ error = "Request failed" }
        }
      }
      catch {
      }
    }
    finally {
      if ($reader) { $reader.Dispose() }
      if ($stream) { $stream.Dispose() }
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
