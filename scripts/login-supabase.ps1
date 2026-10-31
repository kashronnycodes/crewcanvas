$ErrorActionPreference='Stop'
$crewRoot=Split-Path -Parent $PSScriptRoot
$crewState=Join-Path $crewRoot '.supabase'
New-Item -ItemType Directory -Path $crewState -Force | Out-Null
$env:SUPABASE_HOME=Join-Path $crewState 'cli-state'
$env:SUPABASE_PROFILE=Join-Path $crewState 'crewcanvas-profile.yaml'
if(-not(Test-Path -LiteralPath $env:SUPABASE_PROFILE)){
  Copy-Item -LiteralPath (Join-Path $crewRoot 'supabase/cli-profile.example.yaml') -Destination $env:SUPABASE_PROFILE
}
Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
Write-Host 'Use the ronnybraces CrewCanvas account. Enter any verification code only in this terminal.'
& npx --yes supabase@2.122.0 login --agent no --output-format text --name 'CrewCanvas Hackathon CLI'
exit $LASTEXITCODE
