@echo off
rem Dipanggil oleh Task Scheduler: menjalankan backup inkremental dan mencatat hasilnya ke backups\backup.log
cd /d "%~dp0.."
if not exist backups mkdir backups
echo [%date% %time%] mulai >> backups\backup.log
python app.py backup-auto >> backups\backup.log 2>&1
set KODE=%errorlevel%
echo [%date% %time%] selesai, kode keluar %KODE% >> backups\backup.log
exit /b %KODE%
