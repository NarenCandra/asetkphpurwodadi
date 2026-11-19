# Memasang jadwal backup harian di Windows Task Scheduler. Jalankan sekali dari PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\pasang-jadwal-backup.ps1 -Jam 02:00
param([string]$Jam = '02:00')

$bat = Join-Path $PSScriptRoot 'backup-harian.bat'
$aksi = New-ScheduledTaskAction -Execute $bat -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$pemicu = New-ScheduledTaskTrigger -Daily -At $Jam
# StartWhenAvailable: bila komputer mati pada jam itu, backup dijalankan begitu komputer menyala lagi
$setelan = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'BackupSewaAset' -Action $aksi -Trigger $pemicu -Settings $setelan `
    -Description 'Backup inkremental data Sewa Aset Perhutani (python app.py backup-auto)' -Force | Out-Null

Write-Host "Jadwal dipasang: setiap hari pukul $Jam."
Write-Host "Uji sekarang : Start-ScheduledTask -TaskName BackupSewaAset"
Write-Host "Lihat hasil  : Get-Content backups\backup.log -Tail 20"
Write-Host "Hapus jadwal : Unregister-ScheduledTask -TaskName BackupSewaAset -Confirm:`$false"
