@echo off
setlocal

set ROOT_DIR=%~dp0
pushd "%ROOT_DIR%\.."

if not exist ".venv" (
  echo [INFO] Creating virtual environment...
  py -3 -m venv .venv
  if errorlevel 1 (
    echo [ERROR] Could not create virtual environment with py launcher.
    echo [HINT] Install Python 3.11+ and ensure "py" works in terminal.
    popd
    exit /b 1
  )
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo [ERROR] Failed to activate virtual environment.
  popd
  exit /b 1
)

echo [INFO] Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
  echo [ERROR] pip upgrade failed.
  popd
  exit /b 1
)

echo [INFO] Installing pipeline dependencies...
pip install -r "jnv_pipeline\requirements.txt"
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  popd
  exit /b 1
)

echo [OK] Environment setup complete.
echo [NEXT] Configure INPUT_DIR and OUTPUT_DIR in run_pipeline.bat, then run it.
popd
exit /b 0
