param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs)
$ErrorActionPreference='Stop'
$crewRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $crewRoot
$env:SUPABASE_HOME=Join-Path $crewRoot '.supabase/cli-state'
$env:SUPABASE_PROFILE=Join-Path $crewRoot '.supabase/crewcanvas-profile.yaml'
if(-not(Test-Path -LiteralPath $env:SUPABASE_PROFILE)){throw 'Complete the isolated CrewCanvas CLI login first. See docs/backend-integration.md.'}
$crewIdentity=(& npx --yes supabase@2.122.0 whoami --output-format json | ConvertFrom-Json)
if($LASTEXITCODE -ne 0 -or $crewIdentity.email -ne 'ronnybraces@gmail.com'){throw 'Refusing operation: expected ronnybraces@gmail.com.'}
$crewRef='tsnwowlyrlxpwwetmxns'
$crewLinked=Join-Path $crewRoot 'supabase/.temp/project-ref'
if(Test-Path -LiteralPath $crewLinked){if((Get-Content -Raw -LiteralPath $crewLinked).Trim() -ne $crewRef){throw 'Unexpected linked project. Operation refused.'}}
if($CliArgs -contains '--db-url'){throw 'Direct database URLs are not supported by this project guard.'}
for($crewIndex=0;$crewIndex -lt $CliArgs.Length;$crewIndex++){
  if($CliArgs[$crewIndex] -eq '--project-ref' -and $CliArgs[$crewIndex+1] -ne $crewRef){throw 'Unexpected project reference. Operation refused.'}
  if($CliArgs[$crewIndex] -match '^--project-ref=(.+)$' -and $Matches[1] -ne $crewRef){throw 'Unexpected project reference. Operation refused.'}
}
& npx --yes supabase@2.122.0 @CliArgs
exit $LASTEXITCODE
