# Lockette Hub installer for Windows.
# Paste this into PowerShell (it downloads and runs this file):
#   irm https://raw.githubusercontent.com/pingusbot67-wq/diamond-challenge-stuff/claude/nifty-brown-yq5bxn/lockette/install-hub.ps1 | iex
# Run the same line again any time to update the hub.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # makes downloads much faster in Windows PowerShell
$Branch = "claude/nifty-brown-yq5bxn"
$Zip = "https://github.com/pingusbot67-wq/diamond-challenge-stuff/archive/refs/heads/$Branch.zip"
$HubDir = Join-Path $HOME "LocketteHub"

function Say($text) { Write-Host "`n>> $text" -ForegroundColor Magenta }

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}

function Find-Python {
    # Prefer the "py" launcher; plain "python" can be a fake Microsoft Store shortcut
    foreach ($cmd in @("py", "python")) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) {
            $extra = @()
            if ($cmd -eq "py") { $extra = @("-3") }
            try {
                $ver = & $cmd @extra -c "import sys; print(sys.version_info >= (3, 11))" 2>$null
                if ($ver -eq "True") { return ,(@($cmd) + $extra) }   # the comma keeps it a list
            } catch { }
        }
    }
    return $null
}

Write-Host "=== Lockette Hub setup (about 5 minutes) ===" -ForegroundColor Magenta

# 1. Python
Say "Step 1 of 4: checking for Python"
$py = Find-Python
if (-not $py) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Python isn't installed and this PC can't install it automatically. Install Python 3.12 from python.org (check 'Add python.exe to PATH'), then run this again."
    }
    Write-Host "Installing Python (a window may ask for permission - click Yes)..."
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements | Out-Host
    Refresh-Path
    $py = Find-Python
    if (-not $py) { throw "Python was installed but can't be found yet. Close PowerShell, open a new one, and run this again." }
}
$pyExe = $py[0]
$pyArgs = @()
if ($py.Count -gt 1) { $pyArgs = $py[1..($py.Count - 1)] }
Write-Host "Python is ready."

# 2. Download the hub
Say "Step 2 of 4: downloading Lockette Hub"
$tmp = Join-Path $env:TEMP "lockette-hub-download"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
$zipFile = Join-Path $tmp "lockette.zip"
Invoke-WebRequest -Uri $Zip -OutFile $zipFile -UseBasicParsing
Expand-Archive -Path $zipFile -DestinationPath $tmp -Force
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1
if (Test-Path $HubDir) { Remove-Item $HubDir -Recurse -Force }
Copy-Item (Join-Path $src.FullName "lockette") $HubDir -Recurse
Remove-Item $tmp -Recurse -Force
Write-Host "Saved to $HubDir"

# 3. Python packages
Say "Step 3 of 4: installing the hub's Python packages"
& $pyExe @pyArgs -m pip install --user --quiet --disable-pip-version-check -r (Join-Path $HubDir "hub-requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Installing the Python packages failed. Check your internet connection and run this again." }
Write-Host "Done."

# 4. Shortcuts: start with Windows (minimized, no browser pop-up) + a desktop link
Say "Step 4 of 4: making the hub start with Windows"
$shell = New-Object -ComObject WScript.Shell
$startup = [Environment]::GetFolderPath("Startup")
$lnk = $shell.CreateShortcut((Join-Path $startup "Lockette Hub.lnk"))
$lnk.TargetPath = Join-Path $HubDir "start-hub.bat"
$lnk.Arguments = "startup"
$lnk.WorkingDirectory = $HubDir
$lnk.WindowStyle = 7
$lnk.Save()
$desktop = [Environment]::GetFolderPath("Desktop")
Set-Content -Path (Join-Path $desktop "Lockette.url") -Value "[InternetShortcut]`r`nURL=http://localhost:8080/"
Write-Host "The hub will start by itself when you log in. There's also a 'Lockette' link on your desktop."

# Start it now (stop an older copy first)
Get-CimInstance Win32_Process -Filter "Name like 'python%' or Name = 'py.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*hub.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath (Join-Path $HubDir "start-hub.bat") -WorkingDirectory $HubDir -WindowStyle Minimized

Write-Host "`n=== All set! Opening http://localhost:8080 ===" -ForegroundColor Green
Write-Host "If Windows Firewall asks about Python, click Allow."
