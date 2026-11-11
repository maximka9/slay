param(
  [Parameter(Mandatory = $true)][string]$Bucket
)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$assetRoot = Join-Path $projectRoot 'public/assets'
$videos = Get-ChildItem -LiteralPath $assetRoot -Recurse -File -Filter *.mp4 | Sort-Object FullName

if (-not $videos.Count) { throw 'Подготовленные MP4 не найдены. Сначала выполните npm run prepare:media.' }

foreach ($video in $videos) {
  $relative = $video.FullName.Substring($assetRoot.Length).TrimStart('\', '/').Replace('\', '/')
  $objectKey = "assets/$relative"
  Write-Host "R2 <- $objectKey"
  & npx wrangler r2 object put "$Bucket/$objectKey" --file $video.FullName --content-type video/mp4 --remote
  if ($LASTEXITCODE -ne 0) { throw "Не удалось загрузить $objectKey" }
}

Write-Host "Загружено в R2: $($videos.Count) видео."
