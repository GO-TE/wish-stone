# =============================================================================
# Wish Stone Spring Boot MSA 5개 서비스 로컬 원클릭 기동 스크립트
# =============================================================================

$javaCmd = (Get-ChildItem "C:\Users\sybon\.gradle\jdks", "C:\Program Files\JetBrains\PyCharm 2026.2.3\jbr" -Recurse -Filter "java.exe" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $javaCmd) {
    $javaCmd = "java"
}

$backendRoot = Join-Path $PSScriptRoot "..\backend"

$services = @(
    @{ Name = "user-auth-service"; Port = 8081; Jar = "$backendRoot\user-auth-service\build\libs\user-auth-service-0.1.0-SNAPSHOT.jar" },
    @{ Name = "wish-tower-service"; Port = 8082; Jar = "$backendRoot\wish-tower-service\build\libs\wish-tower-service-0.1.0-SNAPSHOT.jar" },
    @{ Name = "interaction-service"; Port = 8083; Jar = "$backendRoot\interaction-service\build\libs\interaction-service-0.1.0-SNAPSHOT.jar" },
    @{ Name = "group-service"; Port = 8084; Jar = "$backendRoot\group-service\build\libs\group-service-0.1.0-SNAPSHOT.jar" },
    @{ Name = "gateway-service"; Port = 8080; Jar = "$backendRoot\gateway-service\build\libs\gateway-service-0.1.0-SNAPSHOT.jar" }
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🪨 Wish Stone Spring Boot MSA 5개 서비스 기동 중... " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$jobs = @()
foreach ($svc in $services) {
    if (Test-Path $svc.Jar) {
        Write-Host "  -> [$($svc.Name)] (Port: $($svc.Port)) 시작..." -ForegroundColor Yellow
        $job = Start-Process -FilePath $javaCmd -ArgumentList "-jar", $svc.Jar -PassThru -WindowStyle Hidden
        $jobs += @{ Name = $svc.Name; Process = $job; Port = $svc.Port }
    } else {
        Write-Host "  [경고] $($svc.Jar) 파일이 없습니다. 먼저 gradle bootJar를 실행하세요." -ForegroundColor Red
    }
}

Write-Host "`n모든 백엔드 마이크로서비스가 백그라운드에서 정상 기동되었습니다!" -ForegroundColor Green
Write-Host "  - Gateway: http://localhost:8080" -ForegroundColor White
Write-Host "  - User Auth: http://localhost:8081" -ForegroundColor White
Write-Host "  - Wish Tower: http://localhost:8082" -ForegroundColor White
Write-Host "  - Interaction: http://localhost:8083" -ForegroundColor White
Write-Host "  - Group: http://localhost:8084" -ForegroundColor White
Write-Host "종료하려면 PowerShell에서 Stop-Process -Name java 를 실행하세요.`n" -ForegroundColor Gray
