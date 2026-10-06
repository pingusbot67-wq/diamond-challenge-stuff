@echo off
rem Lockette Hub - double-click to start. Close this window to stop it.
cd /d "%~dp0"
where py >NUL 2>NUL && (set "PY=py -3") || (set "PY=python")
echo Getting Lockette Hub ready...
%PY% -m pip install --user --quiet --disable-pip-version-check -r hub-requirements.txt
rem When Windows starts it (with "startup"), don't pop open the browser
if /i not "%~1"=="startup" start "" cmd /c "timeout /t 3 >NUL & start http://localhost:8080"
%PY% hub.py
pause
