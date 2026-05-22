$envPath = (Resolve-Path ..\..\.env.local).Path
$lines = Get-Content $envPath | Where-Object { $_ -match '^[A-Z_]+=' -and $_ -notmatch '^#' }
$map = @{}
foreach ($l in $lines) { $i = $l.IndexOf('='); $map[$l.Substring(0,$i)] = $l.Substring($i+1) }
$keys = @('VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY')
foreach ($k in $keys) {
  if (-not $map.ContainsKey($k)) { Write-Host "SKIP $k (not in .env.local)"; continue }
  Write-Host "Setting $k..."
  & netlify env:set $k $map[$k] --context production --scope builds --scope functions --scope runtime --scope post-processing --force 2>&1 | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED $k exit=$LASTEXITCODE"; break }
}
Write-Host "=== verifying ==="
& netlify env:list --context production 2>&1 | Select-String 'VITE_|SUPABASE' | ForEach-Object { $_.Line }
Write-Host "DONE"
