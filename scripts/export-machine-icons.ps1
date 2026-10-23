param(
    [Parameter(Mandatory = $true)][int]$GameProcessId,
    [Parameter(Mandatory = $true)][string]$JavaHome,
    [switch]$Catalog
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot -Parent
$work = Join-Path $root '.tmp-blueprint/native-icons'
$classes = Join-Path $work 'classes-current'
$export = Join-Path $work $(if ($Catalog) { 'catalog-current' } else { 'export-current' })
$jar = Join-Path $work "inventory-icons-$([Guid]::NewGuid().ToString('N')).jar"
New-Item -ItemType Directory -Path $classes, $export -Force | Out-Null

& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 --release 17 -d $classes (Join-Path $PSScriptRoot 'native-icons/InventoryIcons.java')
if ($LASTEXITCODE -ne 0) { throw 'Exporter compilation failed' }
& (Join-Path $JavaHome 'bin/jar.exe') cfm $jar (Join-Path $PSScriptRoot 'native-icons/MANIFEST.MF') -C $classes .
if ($LASTEXITCODE -ne 0) { throw 'Exporter packaging failed' }

if ($Catalog) {
    $argument = "catalog|$export"
} else {
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'native-icons/manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $selection = Join-Path $work 'selection.tsv'
    $sources = @{}
    $rows = foreach ($entry in $manifest.models.PSObject.Properties) {
        $item = $entry.Value
        $identity = "$($item.registry):$($item.meta)"
        if (!$sources.ContainsKey($identity)) {
            $sources[$identity] = $entry.Name
            "$($entry.Name)`t$($item.registry)`t$($item.meta)"
        }
    }
    [System.IO.File]::WriteAllLines($selection, [string[]]$rows, [System.Text.UTF8Encoding]::new($false))
    $argument = "export|$export|$selection"
}
foreach ($marker in @('done.txt', 'error.txt')) {
    $path = Join-Path $export $marker
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
}
& (Join-Path $JavaHome 'bin/java.exe') -cp $jar gtnh.icons.InventoryIcons $GameProcessId $jar $argument
if ($LASTEXITCODE -ne 0) { throw 'Could not attach to the local game' }

$deadline = [DateTime]::UtcNow.AddMinutes(10)
while (!(Test-Path -LiteralPath (Join-Path $export 'done.txt'))) {
    if (Test-Path -LiteralPath (Join-Path $export 'error.txt')) {
        throw (Get-Content -LiteralPath (Join-Path $export 'error.txt') -Raw -Encoding utf8)
    }
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Game did not complete the export' }
    Start-Sleep -Milliseconds 500
}
if ($Catalog) {
    Write-Output "Catalog: $export"
} else {
    $destination = Join-Path $root 'src/assets/machines'
    foreach ($entry in $manifest.models.PSObject.Properties) {
        $item = $entry.Value
        $source = $sources["$($item.registry):$($item.meta)"]
        $file = Join-Path $export "$source.png"
        if (!(Test-Path -LiteralPath $file)) { throw "Missing exported icon: $($entry.Name)" }
    }
    foreach ($entry in $manifest.models.PSObject.Properties) {
        $item = $entry.Value
        $source = $sources["$($item.registry):$($item.meta)"]
        Copy-Item -LiteralPath (Join-Path $export "$source.png") -Destination (Join-Path $destination "$($entry.Name).png")
    }
    Write-Output "Imported $($manifest.models.PSObject.Properties.Name.Count) native inventory icons"
}
