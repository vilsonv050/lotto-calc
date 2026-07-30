[CmdletBinding()]
param(
    [ValidateSet('status', 'pull', 'push')]
    [string]$Action = 'status'
)

Set-StrictMode -Version Latest

$syncRepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$syncGitCommand = Get-Command git -ErrorAction Stop
$syncGitExe = $syncGitCommand.Source
$syncGitArgs = @()

# The Git bundled with Codex on Windows may keep remote-https.exe in
# mingw64\bin without exposing it through Git's default exec path.
$syncGitCmdDir = Split-Path -Parent $syncGitExe
$syncGitInstallRoot = Split-Path -Parent $syncGitCmdDir
$syncBundledExecPath = Join-Path $syncGitInstallRoot 'mingw64\bin'
$syncRemoteHttps = Join-Path $syncBundledExecPath 'git-remote-https.exe'

if (Test-Path -LiteralPath $syncRemoteHttps) {
    $syncGitArgs += "--exec-path=$syncBundledExecPath"
}

# OpenSSL is reliable for the bundled Git in non-interactive Codex sessions.
$syncGitArgs += @('-c', 'http.sslBackend=openssl')

function Invoke-SyncGit {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$Capture
    )

    if ($Capture) {
        $syncCapturedOutput = & $syncGitExe @syncGitArgs @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Git exited with code ${LASTEXITCODE}: git $($Arguments -join ' ')"
        }
        return $syncCapturedOutput
    }

    & $syncGitExe @syncGitArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git exited with code ${LASTEXITCODE}: git $($Arguments -join ' ')"
    }
}

Push-Location -LiteralPath $syncRepoRoot
try {
    $syncCurrentBranch = (Invoke-SyncGit -Arguments @('branch', '--show-current') -Capture | Select-Object -First 1)
    if ($syncCurrentBranch -ne 'main') {
        throw "Expected branch main; current branch: $syncCurrentBranch"
    }

    $syncDirtyFiles = @(Invoke-SyncGit -Arguments @('status', '--porcelain') -Capture)

    switch ($Action) {
        'status' {
            Invoke-SyncGit -Arguments @('status', '--short', '--branch')
            Invoke-SyncGit -Arguments @('log', '-5', '--oneline', '--decorate')
        }

        'pull' {
            if ($syncDirtyFiles.Count -gt 0) {
                throw 'Uncommitted changes found. Save or commit them intentionally before synchronization.'
            }

            Invoke-SyncGit -Arguments @('fetch', 'origin', 'main')
            Invoke-SyncGit -Arguments @('rebase', 'origin/main')
            Invoke-SyncGit -Arguments @('status', '--short', '--branch')
        }

        'push' {
            if ($syncDirtyFiles.Count -gt 0) {
                throw 'Uncommitted changes found. Commit verified work together with PROJECT_CONTEXT.md before push.'
            }

            Invoke-SyncGit -Arguments @('fetch', 'origin', 'main')
            $syncBehindCount = [int](Invoke-SyncGit -Arguments @('rev-list', '--count', 'HEAD..origin/main') -Capture | Select-Object -First 1)
            if ($syncBehindCount -gt 0) {
                throw "Local main is behind origin/main by $syncBehindCount commit(s). Run: .\SYNC_GITHUB.ps1 pull"
            }

            Invoke-SyncGit -Arguments @('push', 'origin', 'main')
            Invoke-SyncGit -Arguments @('status', '--short', '--branch')
        }
    }
}
finally {
    Pop-Location
}
