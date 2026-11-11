param([switch]$Force)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$mediaLog = @()

function Copy-Media {
  param([string]$Source, [string]$Destination)
  $sourcePath = Join-Path $projectRoot $Source
  $destinationPath = Join-Path $projectRoot $Destination
  if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Не найден исходный файл: $Source" }
  $destinationDirectory = Split-Path -Parent $destinationPath
  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  if ($Force -or -not (Test-Path -LiteralPath $destinationPath)) {
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
  }
}

function Export-Preview {
  param([string]$Source, [string]$Destination, [double]$At = 4)
  $sourcePath = Join-Path $projectRoot $Source
  $destinationPath = Join-Path $projectRoot $Destination
  if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Не найден ролик для превью: $Source" }
  $destinationDirectory = Split-Path -Parent $destinationPath
  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  if ($Force -or -not (Test-Path -LiteralPath $destinationPath)) {
    & ffmpeg -hide_banner -loglevel error -y -ss $At -i $sourcePath -frames:v 1 -vf 'scale=1280:-2' -q:v 3 $destinationPath
    if ($LASTEXITCODE -ne 0) { throw "FFmpeg не смог создать превью: $Destination" }
  }
}

function Add-MediaReport {
  param([string]$Source, [string]$Destination)
  if ([IO.Path]::GetExtension($Destination) -ne '.mp4') { return }
  $destinationPath = Join-Path $projectRoot $Destination
  $probe = (& ffprobe -v error -show_entries 'format=duration,size,format_name:stream=codec_type,codec_name,width,height' -of json -- $destinationPath) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw "FFprobe не смог проверить: $Destination" }
  $video = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  $audio = $probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
  if ($video.codec_name -ne 'h264' -or $audio.codec_name -ne 'aac') { throw "Неподдерживаемые кодеки в ${Destination}: $($video.codec_name)/$($audio.codec_name)" }
  $script:mediaLog += [PSCustomObject]@{
    source = $Source; destination = $Destination; container = $probe.format.format_name
    videoCodec = $video.codec_name; audioCodec = $audio.codec_name
    width = $video.width; height = $video.height
    durationSeconds = [math]::Round([double]$probe.format.duration, 3)
    bytes = [long]$probe.format.size; pagesAssetCompatible = ([long]$probe.format.size -le 25MB)
  }
}

$copies = @(
  # Игра года
  @('games/rdr 1.mp4', 'public/assets/nominees/game/videos/rdr-1.mp4'),
  @('games/rdr 2.mp4', 'public/assets/nominees/game/videos/rdr-2.mp4'),
  @('games/rdr 3.mp4', 'public/assets/nominees/game/videos/rdr-3.mp4'),
  @('games/rdr 4.mp4', 'public/assets/nominees/game/videos/rdr-4.mp4'),
  @('games/re 2 1.mp4', 'public/assets/nominees/game/videos/re2-1.mp4'),
  @('games/re 2 2.mp4', 'public/assets/nominees/game/videos/re2-2.mp4'),
  @('games/re 2 3.mp4', 'public/assets/nominees/game/videos/re2-3.mp4'),
  @('games/re 4 1.mp4', 'public/assets/nominees/game/videos/re4-1.mp4'),
  @('games/re 4 2.mp4', 'public/assets/nominees/game/videos/re4-2.mp4'),
  @('games/The Last of Us Part I 1.mp4', 'public/assets/nominees/game/videos/tlou1-1.mp4'),
  @('games/The Last of Us Part I 2.mp4', 'public/assets/nominees/game/videos/tlou1-2.mp4'),
  @('games/The Witcher 3 Wild Hunt Remastered 1.mp4', 'public/assets/nominees/game/videos/witcher3-1.mp4'),
  @('games/Clair Obscur Expedition 33.mp4', 'public/assets/nominees/game/videos/clair-obscur-1.mp4'),

  # Инди-игра года
  @('indi/no im no human 1.mp4', 'public/assets/nominees/indie-game/videos/no-human-1.mp4'),
  @('indi/no im no human 2.mp4', 'public/assets/nominees/indie-game/videos/no-human-2.mp4'),
  @('indi/no im no human 3.mp4', 'public/assets/nominees/indie-game/videos/no-human-3.mp4'),
  @('indi/whos lila.mp4', 'public/assets/nominees/indie-game/videos/whos-lila-1.mp4'),

  # Ивент года
  @('ivent/chgk 1.png', 'public/assets/nominees/event/chgk.png'),
  @('ivent/chudo.jpg', 'public/assets/nominees/event/chudo.jpg'),
  @('ivent/logika.png', 'public/assets/nominees/event/logika.png'),
  @('ivent/turnir1.png', 'public/assets/nominees/event/turnir1.png'),
  @('ivent/turnir2.png', 'public/assets/nominees/event/turnir2.png'),
  @('ivent/chgk 1.mp4', 'public/assets/nominees/event/videos/chgk-1.mp4'),
  @('ivent/logika 1.mp4', 'public/assets/nominees/event/videos/logika-1.mp4'),
  @('ivent/logika 2.mp4', 'public/assets/nominees/event/videos/logika-2.mp4'),
  @('ivent/turnir1 1.mp4', 'public/assets/nominees/event/videos/turnir1-1.mp4'),
  @('ivent/turnir1 2.mp4', 'public/assets/nominees/event/videos/turnir1-2.mp4'),
  @('ivent/turnir2 1.mp4', 'public/assets/nominees/event/videos/turnir2-1.mp4'),
  @('ivent/turnir2 2.mp4', 'public/assets/nominees/event/videos/turnir2-2.mp4'),
  @('ivent/turnir2 3.mp4', 'public/assets/nominees/event/videos/turnir2-3.mp4'),

  # Лучший ИРЛ с друзьями
  @('alko/МОНСТРЫ НА КАНИКУЛАХ В МОСКВЕ.jpg', 'public/assets/nominees/irl/monsters-moscow.jpg'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ ЧАСТЬ 2.jpg', 'public/assets/nominees/irl/monsters-part-2.jpg'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ В МОСКВЕ 1.mp4', 'public/assets/nominees/irl/videos/monsters-moscow-1.mp4'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ В МОСКВЕ 2.mp4', 'public/assets/nominees/irl/videos/monsters-moscow-2.mp4'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ В МОСКВЕ 3.mp4', 'public/assets/nominees/irl/videos/monsters-moscow-3.mp4'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ ЧАСТЬ 2 1.mp4', 'public/assets/nominees/irl/videos/monsters-part-2-1.mp4'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ ЧАСТЬ 2 2.mp4', 'public/assets/nominees/irl/videos/monsters-part-2-2.mp4'),
  @('alko/МОНСТРЫ НА КАНИКУЛАХ ЧАСТЬ 2 3.mp4', 'public/assets/nominees/irl/videos/monsters-part-2-3.mp4'),
  @('alko/ЧАТ РУЛЕТКА.mp4', 'public/assets/nominees/irl/videos/chat-roulette-1.mp4'),
  @('alko/ЧАТ РУЛЕТКА 2.mp4', 'public/assets/nominees/irl/videos/chat-roulette-2.mp4'),

  # Кукинг года
  @('alko/ГОВЯДИНА ВЕЛЛИНГТОН КУКИНГ.jpg', 'public/assets/nominees/cooking/beef-wellington.jpg'),
  @('alko/МОСКОВСКИЙАЛКОКУКИНГ.jpg', 'public/assets/nominees/cooking/moscow-local-cooking.jpg'),
  @('alko/ГОВЯДИНА ВЕЛЛИНГТОН КУКИНГ.mp4', 'public/assets/nominees/cooking/videos/beef-wellington-1.mp4'),
  @('alko/ГОТОВИМ ПИЦЦУ.mp4', 'public/assets/nominees/cooking/videos/pizza-1.mp4'),
  @('alko/ГОТОВИМ ПИЦЦУ 2.mp4', 'public/assets/nominees/cooking/videos/pizza-2.mp4'),
  @('alko/МОСКОВСКИЙАЛКОКУКИНГ 1.mp4', 'public/assets/nominees/cooking/videos/moscow-local-cooking-1.mp4'),
  @('alko/МОСКОВСКИЙАЛКОКУКИНГ 2.mp4', 'public/assets/nominees/cooking/videos/moscow-local-cooking-2.mp4')
)

for ($index = 1; $index -le 7; $index++) {
  $copies += ,@("zavoz/завоз $index.mp4", "public/assets/nominees/community-drop/videos/community-drop-$index.mp4")
}

$dotaSources = @(
  '20251221_AuspiciousEndearingFriseeDendiFace-tOe9fW5PwRHgBcYi_source.mp4',
  '20260213_UnsightlyInexpensiveCarrotThisIsSparta-jbBwVVZqO1NTXsNB_source.mp4',
  '20260920_SassyBrightEagleNononoCat-l_mmGxp03bg0YIpM_source.mp4',
  '20261011_NimbleQuaintHerdTBTacoLeft-vg_Aj-WCo4SJuiHy_source.mp4',
  '20261013_ZealousSavoryPhoneOSfrog-GFpOBkPOMDhRLmYU_source.mp4',
  'рейдж 1.mp4',
  'рейдж 2.mp4'
)
$failSources = @(
  '20251005_ProtectiveFaithfulSproutKeepo-Md_dlI-P1KDiCnv7_source.mp4',
  '20251217_UnusualCooperativeAnacondaPeteZaroll-wocBEU3wcgg-vK1I_source.mp4',
  '20251224_PeppyGorgeousSwallowFloof-qLQQM5zTvg3zLGUc_source.mp4',
  '20260104_RepleteNastyShieldSwiftRage-EGfncEtDZCrqcz69_source.mp4',
  '20260114_CrowdedCarefulRavenArsonNoSexy-iS1UvMJ8THpQlnwc_source.mp4',
  '20260116_CalmKindHorseAMPTropPunch-NjA6Pm70ID4wW5K9_source.mp4',
  '20260329_NimblePoliteYamFreakinStinkin-PnjcHa8vuyC6Lq0M_source.mp4',
  '20260930_HandsomeCalmTapirPRChase-_vAW6zHDN5_seswQ_source.mp4'
)
for ($index = 0; $index -lt $dotaSources.Count; $index++) {
  $number = '{0:D2}' -f ($index + 1)
  $copies += ,@("дота/$($dotaSources[$index])", "public/assets/nominees/dota-clip/videos/dota-clip-$number.mp4")
}
for ($index = 0; $index -lt $failSources.Count; $index++) {
  $number = '{0:D2}' -f ($index + 1)
  $copies += ,@("фейл/$($failSources[$index])", "public/assets/nominees/fail/videos/fail-$number.mp4")
}

foreach ($copy in $copies) {
  Copy-Media -Source $copy[0] -Destination $copy[1]
  Add-MediaReport -Source $copy[0] -Destination $copy[1]
}

$previews = @(
  @('alko/ЧАТ РУЛЕТКА.mp4', 'public/assets/generated-previews/irl/chat-roulette.jpg', 4),
  @('alko/ГОТОВИМ ПИЦЦУ.mp4', 'public/assets/generated-previews/cooking/pizza.jpg', 4)
)
for ($index = 1; $index -le 7; $index++) {
  $previews += ,@("zavoz/завоз $index.mp4", "public/assets/generated-previews/community-drop/community-drop-$index.jpg", 4)
}
for ($index = 0; $index -lt $dotaSources.Count; $index++) {
  $number = '{0:D2}' -f ($index + 1)
  $previews += ,@("дота/$($dotaSources[$index])", "public/assets/generated-previews/dota-clip/dota-clip-$number.jpg", 4)
}
for ($index = 0; $index -lt $failSources.Count; $index++) {
  $number = '{0:D2}' -f ($index + 1)
  $previews += ,@("фейл/$($failSources[$index])", "public/assets/generated-previews/fail/fail-$number.jpg", 4)
}

foreach ($preview in $previews) { Export-Preview -Source $preview[0] -Destination $preview[1] -At $preview[2] }

$reportPath = Join-Path $projectRoot 'artifacts/media-preparation-v7.json'
[PSCustomObject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  cloudflarePagesSingleAssetLimitBytes = 25MB
  videos = $mediaLog
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8

$externalCount = @($mediaLog | Where-Object { -not $_.pagesAssetCompatible }).Count
Write-Host "Медиа подготовлены: $($copies.Count) файлов, $($previews.Count) сгенерированных превью."
Write-Host "Отчёт: artifacts/media-preparation-v7.json. Для R2: $externalCount файлов крупнее лимита Pages 25 MiB."
