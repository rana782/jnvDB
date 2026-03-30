@echo off
setlocal

REM -------------------- USER CONFIG --------------------
REM Defaults are pre-wired to this repository layout.
set INPUT_DIR=%~dp0..\jnv-platform\tools\pmshri-crawler\data\pdfs
set OUTPUT_DIR=%~dp0output
set STATE_DIR=%~dp0state
set BATCH_SIZE=50
REM Set FORCE_OCR=1 to force OCR for all PDFs
set FORCE_OCR=0
REM ----------------------------------------------------

set ROOT_DIR=%~dp0
pushd "%ROOT_DIR%\.."

if not exist ".venv\Scripts\activate.bat" (
  echo [ERROR] Virtual environment not found.
  echo [HINT] Run jnv_pipeline\setup_and_install.bat first.
  popd
  exit /b 1
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo [ERROR] Could not activate virtual environment.
  popd
  exit /b 1
)

set FORCE_OCR_ARG=
if "%FORCE_OCR%"=="1" set FORCE_OCR_ARG=--force-ocr

echo [INFO] Running JNV batch pipeline...
python -m jnv_pipeline.main ^
  --input-dir "%INPUT_DIR%" ^
  --output-dir "%OUTPUT_DIR%" ^
  --manifest "%STATE_DIR%\manifest.json" ^
  --log-file "%STATE_DIR%\processing_log.jsonl" ^
  --batch-size %BATCH_SIZE% ^
  %FORCE_OCR_ARG%

if errorlevel 1 (
  echo [ERROR] Pipeline run failed.
  popd
  exit /b 1
)

echo [OK] Pipeline run completed.
popd
exit /b 0
