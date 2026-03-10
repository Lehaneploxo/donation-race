# ─── Красивое окно для ввода никнейма ────────────────────────────────────────
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text            = "Гонка Донатов — Запуск"
$form.Size            = New-Object System.Drawing.Size(420, 260)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox     = $false
$form.MinimizeBox     = $false
$form.BackColor       = [System.Drawing.Color]::FromArgb(12, 10, 35)

# Заголовок
$title = New-Object System.Windows.Forms.Label
$title.Text      = "🏁 ГОНКА ДОНАТОВ"
$title.ForeColor = [System.Drawing.Color]::Gold
$title.Font      = New-Object System.Drawing.Font("Arial Black", 16, [System.Drawing.FontStyle]::Bold)
$title.Location  = New-Object System.Drawing.Point(20, 18)
$title.Size      = New-Object System.Drawing.Size(380, 35)
$title.TextAlign = "MiddleCenter"
$form.Controls.Add($title)

# Подпись
$sub = New-Object System.Windows.Forms.Label
$sub.Text      = "Введи свой TikTok никнейм"
$sub.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 200)
$sub.Font      = New-Object System.Drawing.Font("Arial", 10)
$sub.Location  = New-Object System.Drawing.Point(20, 58)
$sub.Size      = New-Object System.Drawing.Size(380, 20)
$sub.TextAlign = "MiddleCenter"
$form.Controls.Add($sub)

# Поле ввода
$input = New-Object System.Windows.Forms.TextBox
$input.Location    = New-Object System.Drawing.Point(20, 90)
$input.Size        = New-Object System.Drawing.Size(370, 35)
$input.Font        = New-Object System.Drawing.Font("Arial", 14)
$input.Text        = "@"
$input.ForeColor   = [System.Drawing.Color]::White
$input.BackColor   = [System.Drawing.Color]::FromArgb(30, 25, 70)
$input.BorderStyle = "FixedSingle"
$form.Controls.Add($input)

# Курсор в конец поля
$input.Select($input.Text.Length, 0)

# Кнопка запуска
$btn = New-Object System.Windows.Forms.Button
$btn.Text       = "▶  ЗАПУСТИТЬ ИГРУ"
$btn.Location   = New-Object System.Drawing.Point(20, 143)
$btn.Size       = New-Object System.Drawing.Size(370, 50)
$btn.Font       = New-Object System.Drawing.Font("Arial Black", 12, [System.Drawing.FontStyle]::Bold)
$btn.BackColor  = [System.Drawing.Color]::FromArgb(230, 120, 0)
$btn.ForeColor  = [System.Drawing.Color]::Black
$btn.FlatStyle  = "Flat"
$btn.FlatAppearance.BorderSize = 0
$btn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $btn
$form.Controls.Add($btn)

# Подсказка
$hint = New-Object System.Windows.Forms.Label
$hint.Text      = "Если стрим не запущен — включится демо-режим"
$hint.ForeColor = [System.Drawing.Color]::FromArgb(120, 120, 120)
$hint.Font      = New-Object System.Drawing.Font("Arial", 8)
$hint.Location  = New-Object System.Drawing.Point(20, 205)
$hint.Size      = New-Object System.Drawing.Size(380, 16)
$hint.TextAlign = "MiddleCenter"
$form.Controls.Add($hint)

# Показываем окно
$result = $form.ShowDialog()

if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    exit
}

$username = $input.Text.Trim().TrimStart('@')
if ($username -eq "") { $username = "demo" }

# ─── Запуск сервера ───────────────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Установка зависимостей если нужно
if (-not (Test-Path "node_modules")) {
    $wait = New-Object System.Windows.Forms.Form
    $wait.Text = "Установка..."; $wait.Size = New-Object System.Drawing.Size(300,80)
    $wait.StartPosition = "CenterScreen"; $wait.Show()
    Start-Process -FilePath "npm" -ArgumentList "install" -Wait -NoNewWindow
    $wait.Close()
}

# Запускаем сервер
$nodeProc = Start-Process -FilePath "node" `
    -ArgumentList "server/server.js", $username `
    -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 3

# Открываем браузер
$gameUrl = "http://localhost:3000"
Start-Process $gameUrl

# ─── Окно статуса ─────────────────────────────────────────────────────────────
$status = New-Object System.Windows.Forms.Form
$status.Text            = "Гонка Донатов — Работает"
$status.Size            = New-Object System.Drawing.Size(380, 200)
$status.StartPosition   = "CenterScreen"
$status.FormBorderStyle = "FixedDialog"
$status.MaximizeBox     = $false
$status.BackColor       = [System.Drawing.Color]::FromArgb(12, 10, 35)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text      = "✅  Игра запущена!"
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(0, 255, 136)
$statusLabel.Font      = New-Object System.Drawing.Font("Arial Black", 14, [System.Drawing.FontStyle]::Bold)
$statusLabel.Location  = New-Object System.Drawing.Point(20, 25)
$statusLabel.Size      = New-Object System.Drawing.Size(340, 30)
$statusLabel.TextAlign = "MiddleCenter"
$status.Controls.Add($statusLabel)

$nikLabel = New-Object System.Windows.Forms.Label
$nikLabel.Text      = "Никнейм: @$username"
$nikLabel.ForeColor = [System.Drawing.Color]::Gold
$nikLabel.Font      = New-Object System.Drawing.Font("Arial", 11)
$nikLabel.Location  = New-Object System.Drawing.Point(20, 65)
$nikLabel.Size      = New-Object System.Drawing.Size(340, 22)
$nikLabel.TextAlign = "MiddleCenter"
$status.Controls.Add($nikLabel)

$urlLabel = New-Object System.Windows.Forms.Label
$urlLabel.Text      = "http://localhost:3000"
$urlLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 180, 255)
$urlLabel.Font      = New-Object System.Drawing.Font("Arial", 10)
$urlLabel.Location  = New-Object System.Drawing.Point(20, 92)
$urlLabel.Size      = New-Object System.Drawing.Size(340, 20)
$urlLabel.TextAlign = "MiddleCenter"
$status.Controls.Add($urlLabel)

$stopBtn = New-Object System.Windows.Forms.Button
$stopBtn.Text      = "⏹  ОСТАНОВИТЬ"
$stopBtn.Location  = New-Object System.Drawing.Point(20, 125)
$stopBtn.Size      = New-Object System.Drawing.Size(340, 40)
$stopBtn.Font      = New-Object System.Drawing.Font("Arial Black", 11)
$stopBtn.BackColor = [System.Drawing.Color]::FromArgb(180, 30, 30)
$stopBtn.ForeColor = [System.Drawing.Color]::White
$stopBtn.FlatStyle = "Flat"
$stopBtn.FlatAppearance.BorderSize = 0
$stopBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$status.CancelButton = $stopBtn
$status.Controls.Add($stopBtn)

$status.ShowDialog() | Out-Null

# Останавливаем сервер при закрытии окна
try {
    Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
} catch {}
