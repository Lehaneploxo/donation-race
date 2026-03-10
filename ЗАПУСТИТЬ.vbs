Dim fso, scriptDir, shell

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("WScript.Shell")

' Убиваем старые процессы node на порту 3000
shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True
WScript.Sleep 500

' Запускаем сервер в свёрнутом окне
shell.Run "cmd /c cd /d """ & scriptDir & """ && node server/server.js", 2, False

' Ждём пока сервер запустится
WScript.Sleep 3000

' Открываем браузер
shell.Run "http://localhost:3000"

' Сообщение — нажми OK чтобы остановить
MsgBox "Игра запущена!" & vbCrLf & vbCrLf & _
       "Адрес: http://localhost:3000" & vbCrLf & vbCrLf & _
       "Нажми OK чтобы ОСТАНОВИТЬ игру.", _
       vbInformation, "Гонка Донатов"

' Останавливаем сервер
shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True

MsgBox "Игра остановлена.", vbInformation, "Гонка Донатов"
