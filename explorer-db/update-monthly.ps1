# Reconstruit la base locale avec le dump Lichess du mois précédent.
# À lancer à la main ou depuis le Planificateur de tâches Windows (voir le README).
# Les arguments sont transmis à build.py, par exemple : .\update-monthly.ps1 --max-games 20000000
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) {
    py -3 -m venv .venv
    .\.venv\Scripts\python -m pip install -q -r requirements.txt
}
$env:PYTHONIOENCODING = 'utf-8'
.\.venv\Scripts\python build.py @args 2>&1 | Tee-Object -FilePath build.log
