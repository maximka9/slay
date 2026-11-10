param([switch]$Force)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }

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
for ($index = 1; $index -le 2; $index++) {
  $copies += ,@("рейдж/рейдж $index.mp4", "public/assets/nominees/rage/videos/rage-$index.mp4")
}

foreach ($copy in $copies) { Copy-Media -Source $copy[0] -Destination $copy[1] }

$previews = @(
  @('alko/ЧАТ РУЛЕТКА.mp4', 'public/assets/generated-previews/irl/chat-roulette.jpg', 4),
  @('alko/ГОТОВИМ ПИЦЦУ.mp4', 'public/assets/generated-previews/cooking/pizza.jpg', 4)
)
for ($index = 1; $index -le 7; $index++) {
  $previews += ,@("zavoz/завоз $index.mp4", "public/assets/generated-previews/community-drop/community-drop-$index.jpg", 4)
}
for ($index = 1; $index -le 2; $index++) {
  $previews += ,@("рейдж/рейдж $index.mp4", "public/assets/generated-previews/rage/rage-$index.jpg", 4)
}

foreach ($preview in $previews) { Export-Preview -Source $preview[0] -Destination $preview[1] -At $preview[2] }

Write-Host "Медиа подготовлены: $($copies.Count) файлов, $($previews.Count) сгенерированных превью."
