@echo off
setlocal EnableExtensions

REM Run native backend+frontend for development, while using
REM already-running container services (Postgres/Redis/Solr/index worker).

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"
if not exist "%ROOT_DIR%media" mkdir "%ROOT_DIR%media"

REM Development ports (different from dockerized app port).
set "DEV_BE_PORT=18000"
set "DEV_FE_PORT=15173"

REM Container services are expected on localhost.
set "PAPERMERGE__DATABASE__URL=postgresql://papermerge:papermerge@127.0.0.1:5432/papermerge"
set "PAPERMERGE__REDIS__URL=redis://127.0.0.1:6379/0"
set "PAPERMERGE__MAIN__MEDIA_ROOT=%ROOT_DIR%media"

REM Full-text search (Solr in docker-compose, exposed on localhost).
REM If Solr is not up yet, skip SEARCH_URL so startup does not die on
REM `paper-cli index-schema apply` (ConnectionError :8983).
set "PAPERMERGE__MAIN__GOTENBERG_URL=http://127.0.0.1:3000"
set "PAPERMERGE__SEARCH__URL="
set "INDEX_SCHEMA_CMD=echo [info] Solr unavailable - starting without search"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8983/solr/admin/info/system' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL%==0 (
  set "PAPERMERGE__SEARCH__URL=solr://127.0.0.1:8983/papermerge"
  set "INDEX_SCHEMA_CMD=poetry run paper-cli index-schema apply"
  echo Solr is up — search enabled.
) else (
  echo [warn] Solr is not reachable on 127.0.0.1:8983
  echo        Backend will start WITHOUT full-text search.
  echo        Fix: docker compose up -d solr
)

REM Keep API shape identical to nginx/container mode.
set "PAPERMERGE__MAIN__API_PREFIX=/api"
set "PAPERMERGE__MAIN__CORS_ORIGINS=http://127.0.0.1:%DEV_FE_PORT%,http://localhost:%DEV_FE_PORT%"

REM Local auth bypass for debugging only.
set "PAPERMERGE__DEV__AUTH_BYPASS_ENABLED=true"
set "PAPERMERGE__DEV__AUTH_BYPASS_USERNAME=admin"

REM Display / wall-clock timezone (UTC+10). Matches docker-compose TZ.
set "TZ=Asia/Vladivostok"
set "PAPERMERGE__MAIN__TIMEZONE=Asia/Vladivostok"

REM Leave VITE_BASE_URL unset so the UI calls relative /api and /ws via the Vite
REM dev proxy (same origin as :15173 — no browser CORS preflight).

echo Starting backend on http://127.0.0.1:%DEV_BE_PORT%
start "papermerge-be-dev" cmd /k "cd /d ""%ROOT_DIR%"" && set ""TZ=%TZ%"" && set ""PAPERMERGE__MAIN__TIMEZONE=%PAPERMERGE__MAIN__TIMEZONE%"" && set ""PAPERMERGE__DATABASE__URL=%PAPERMERGE__DATABASE__URL%"" && set ""PAPERMERGE__REDIS__URL=%PAPERMERGE__REDIS__URL%"" && set ""PAPERMERGE__MAIN__MEDIA_ROOT=%PAPERMERGE__MAIN__MEDIA_ROOT%"" && set ""PAPERMERGE__MAIN__API_PREFIX=%PAPERMERGE__MAIN__API_PREFIX%"" && set ""PAPERMERGE__MAIN__CORS_ORIGINS=%PAPERMERGE__MAIN__CORS_ORIGINS%"" && set ""PAPERMERGE__DEV__AUTH_BYPASS_ENABLED=%PAPERMERGE__DEV__AUTH_BYPASS_ENABLED%"" && set ""PAPERMERGE__DEV__AUTH_BYPASS_USERNAME=%PAPERMERGE__DEV__AUTH_BYPASS_USERNAME%"" && set ""PAPERMERGE__SEARCH__URL=%PAPERMERGE__SEARCH__URL%"" && set ""PAPERMERGE__MAIN__GOTENBERG_URL=%PAPERMERGE__MAIN__GOTENBERG_URL%"" && set ""PAPERMERGE__OCR__ENABLED=false"" && poetry env use 3.13 && poetry install -E pg && poetry run task migrate && %INDEX_SCHEMA_CMD% && poetry run task server --host 127.0.0.1 --port %DEV_BE_PORT%"

echo Waiting for backend (migrations + poetry install may take a few minutes)...
set /a WAIT_COUNT=0
:wait_backend
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:%DEV_BE_PORT%/api/version/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL%==0 goto backend_ready
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 120 (
  echo [warn] Backend not responding on port %DEV_BE_PORT% after 4 minutes.
  echo        Check the papermerge-be-dev window for errors, then refresh the UI.
  goto start_frontend
)
timeout /t 2 /nobreak >nul
goto wait_backend
:backend_ready
echo Backend is ready.

:start_frontend
set "VITE_DEV_API_URL=http://127.0.0.1:%DEV_BE_PORT%"
echo Starting frontend on http://127.0.0.1:%DEV_FE_PORT%
start "papermerge-fe-dev" cmd /k "cd /d ""%ROOT_DIR%frontend"" && set ""VITE_DEV_API_URL=%VITE_DEV_API_URL%"" && yarn workspace ui dev --host 127.0.0.1 --port %DEV_FE_PORT%"

echo.
echo Backend:  http://127.0.0.1:%DEV_BE_PORT%
echo Frontend: http://127.0.0.1:%DEV_FE_PORT%
echo Docker DB:    127.0.0.1:5432
echo Docker Redis: 127.0.0.1:6379
echo Solr:         http://127.0.0.1:8983/solr/#/papermerge
echo.
echo Start container deps first:
echo   copy .env.dev .env
echo   docker compose up -d db redis solr index_worker gotenberg
echo   docker compose exec index_worker poetry run paper-cli index index
echo.
echo Auth bypass is ON for this run only.
echo.
echo If you start the frontend manually (yarn workspace ui dev), ensure the native
echo backend is already listening on port %DEV_BE_PORT%, or set:
echo   VITE_DEV_API_URL=http://127.0.0.1:%DEV_BE_PORT%
echo For docker app only: VITE_DEV_API_URL=http://127.0.0.1:12000

endlocal
