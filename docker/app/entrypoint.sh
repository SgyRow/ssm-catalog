#!/bin/sh
# Entry point for the monolithic Papermerge image.
# Commands:
#   server   Р Р†Р вЂљРІР‚Сњ default. Run init (migrations + bootstrap admin/roles) then supervisord.
#   init     Р Р†Р вЂљРІР‚Сњ just the init steps (useful for one-shot jobs).
#   migrate  Р Р†Р вЂљРІР‚Сњ only alembic migrations.
#   *        Р Р†Р вЂљРІР‚Сњ exec the given command (debug/shell).

set -u

CMD="${1:-server}"

# Default DB location for the legacy sqlite fallback; harmless for postgres.
mkdir -p /db

_run_core() {
    cd /core_app && poetry run "$@"
}

_run_auth() {
    cd /auth_server_app && poetry run "$@"
}

exec_migrate() {
    echo "[init] Applying alembic migrations..."
    _run_core task migrate
}

exec_perms_sync() {
    echo "[init] Syncing permissions from code..."
    _run_core paper-cli perms sync
}

exec_createsuperuser() {
    echo "[init] Ensuring superuser '${PAPERMERGE__AUTH__USERNAME:-admin}' exists..."
    # auth-cli exits non-zero if the user already exists; treat that as success
    # so `docker compose up` stays idempotent across restarts.
    _run_auth auth-cli users create --superuser || \
        echo "[init] Superuser already present, skipping."
}

exec_seed_roles() {
    echo "[init] Ensuring built-in roles (admin, moderator, employee)..."
    _run_core paper-cli roles create-admin --exists-ok
    _run_core paper-cli roles seed-test-roles
}

exec_assign_admin_role() {
    admin_username="${PAPERMERGE__AUTH__USERNAME:-admin}"
    echo "[init] Assigning 'admin' role to superuser '${admin_username}'..."
    _run_core paper-cli users assign-role "${admin_username}" admin
}

exec_portal_bootstrap() {
    echo "[init] Ensuring legal portal root (group + folder)..."
    _run_core paper-cli portal init || echo "[init] portal init failed (see logs)"
}

exec_library_catalog_bootstrap() {
    echo "[init] Ensuring library catalog root..."
    _run_core paper-cli library init-catalog || echo "[init] library init-catalog failed (see logs)"
}

exec_trash_purge() {
    echo "[init] Purging expired trash (retention policy)..."
    _run_core paper-cli library purge-trash || echo "[init] library purge-trash failed (see logs)"
}

exec_index_schema_apply() {
    if [ -n "${PAPERMERGE__SEARCH__URL:-}" ]; then
        echo "[init] Applying search index schema (PAPERMERGE__SEARCH__URL set)..."
        _run_core paper-cli index-schema apply
    fi
}

exec_init() {
    exec_migrate
    exec_perms_sync
    exec_createsuperuser
    exec_seed_roles
    exec_assign_admin_role
    exec_portal_bootstrap
    exec_library_catalog_bootstrap
    exec_trash_purge
    exec_index_schema_apply
}

# Reset nginx/supervisor config symlinks on every start so the image can be
# re-run after config changes without a stale link.
rm -f /etc/nginx/nginx.conf
rm -f /etc/papermerge/supervisord.conf
ln -s /etc/nginx/nginx.default.conf      /etc/nginx/nginx.conf
ln -s /etc/papermerge/supervisord.default.conf /etc/papermerge/supervisord.conf

render_runtime_configs() {
    # Auth-server runtime config. We render it inline here so we don't depend
    # on any additional tool (historical setup used `roco` which broke under
    # click>=8.2, and the upstream `env2js` binary only supports a hardcoded
    # whitelist of OCR-related vars). Defaults mirror the retired `roco`
    # behaviour so existing deployments don't need to set new env vars.
    LOGIN_PROVIDER="${PAPERMERGE__AUTH__LOGIN_PROVIDER:-db}"
    REGISTRATION_ENABLED="${PAPERMERGE__AUTH__REGISTRATION_ENABLED:-true}"
    cat > /usr/share/nginx/html/auth_server/papermerge-runtime-config.js <<EOF
window.__PAPERMERGE_RUNTIME_CONFIG__ = {
  login_provider: "${LOGIN_PROVIDER}",
  registration_enabled: ${REGISTRATION_ENABLED},
  oidc_client_id: "${PAPERMERGE__AUTH__OIDC_CLIENT_ID:-}",
  oidc_authorize_url: "${PAPERMERGE__AUTH__OIDC_AUTHORIZE_URL:-}",
  oidc_redirect_url: "${PAPERMERGE__AUTH__OIDC_REDIRECT_URL:-}",
  oidc_logout_url: "${PAPERMERGE__AUTH__OIDC_LOGOUT_URL:-}",
  oidc_scope: "${PAPERMERGE__AUTH__OIDC_SCOPE:-}",
  remote_logout_endpoint: "${PAPERMERGE__AUTH__REMOTE_LOGOUT_ENDPOINT:-}"
};
EOF

    # Core UI runtime config. Rendered inline (same pattern as auth-server)
    # so we can expose timezone without relying on env2js's OCR-only whitelist.
    UI_TIMEZONE="${PAPERMERGE__MAIN__TIMEZONE:-Asia/Vladivostok}"
    cat > /usr/share/nginx/html/ui/papermerge-runtime-config.js <<EOF
window.__PAPERMERGE_RUNTIME_CONFIG__ = {
  timezone: "${UI_TIMEZONE}"
};
EOF

    APP_TITLE="${PAPERMERGE__MAIN__APP_TITLE:-Электронная библиотека Хабаровского центра социальной поддержки населения}"
    AUTH_BRAND_TITLE="${PAPERMERGE__AUTH__BRAND_TITLE:-${APP_TITLE}}"
    AUTH_LOGIN_SUBTITLE="${PAPERMERGE__AUTH__LOGIN_SUBTITLE:-Электронная библиотека}"

    # Escape replacement strings once so we can use them safely in sed.
    APP_TITLE_SED=$(printf '%s' "${APP_TITLE}" | sed 's/[&|]/\\&/g')
    AUTH_BRAND_TITLE_SED=$(printf '%s' "${AUTH_BRAND_TITLE}" | sed 's/[&|]/\\&/g')
    AUTH_LOGIN_SUBTITLE_SED=$(printf '%s' "${AUTH_LOGIN_SUBTITLE}" | sed 's/[&|]/\\&/g')

    # Inject the <script> tag that loads the runtime config into each SPA's
    # index.html. We match on `</title>` because UI/auth-server titles can be
    # customised (previous rule used "Papermerge" which silently broke for
    # branded builds).
    for html_dir in /usr/share/nginx/html/ui /usr/share/nginx/html/auth_server; do
        html="${html_dir}/index.html"
        [ -f "$html" ] || continue
        # Keep UI and auth-server page titles branded consistently.
        sed -i "s|<title>.*</title>|<title>${APP_TITLE_SED}</title>|" "$html"
        if ! grep -q '/papermerge-runtime-config.js' "$html"; then
            sed -i 's|</title>|</title>\n    <script type="module" src="/papermerge-runtime-config.js"></script>|' \
                "$html"
        fi
    done

    # Auth-server is shipped as prebuilt static files from upstream image.
    # We localise visible UI labels and common error messages at runtime so
    # branding survives image upgrades without forking auth-server.
    find /usr/share/nginx/html/auth_server -type f \
      \( -name '*.html' -o -name '*.js' -o -name '*.json' \) 2>/dev/null \
      | while IFS= read -r file; do
            sed -i "s|Papermerge DMS|${AUTH_BRAND_TITLE_SED}|g" "$file"
            sed -i "s|Open Source Document Management System for Digital Archives|${AUTH_LOGIN_SUBTITLE_SED}|g" "$file"

            # Auth errors first — label replacements below turn "Username" in
            # "Username or password incorrect" into a mixed RU/EN message.
            sed -i "s|Invalid credentials|Неверные учетные данные|g" "$file"
            sed -i "s|Invalid username or password|Неверное имя пользователя или пароль|g" "$file"
            sed -i "s|Username or password incorrect|Неверное имя пользователя или пароль|g" "$file"
            sed -i "s|username or password incorrect|Неверное имя пользователя или пароль|g" "$file"
            sed -i "s|Имя пользователя or password incorrect|Неверное имя пользователя или пароль|g" "$file"
            sed -i "s|or password incorrect|или пароль неверный|g" "$file"
            sed -i "s|User is not active|Пользователь не активирован|g" "$file"
            sed -i "s|Account is disabled|Учетная запись отключена|g" "$file"
            sed -i "s|Unauthorized|Не авторизован|g" "$file"
            sed -i "s|Forbidden|Доступ запрещен|g" "$file"
            sed -i "s|Something went wrong|Произошла ошибка|g" "$file"

            # Generic auth form labels.
            sed -i "s|Username|Имя пользователя|g" "$file"
            sed -i "s|Password|Пароль|g" "$file"
            sed -i "s|Your password|Введите пароль|g" "$file"
            sed -i "s|Sign in|Войти|g" "$file"
            sed -i "s|Login|Войти|g" "$file"
        done

    # Some auth UI builds only ship de/en locales. If the browser asks for ru,
    # nginx falls back to index.html and i18n may silently keep stale defaults.
    # Ensure the ru locale file exists and matches our customised strings.
    AUTH_I18N_DIR="/usr/share/nginx/html/auth_server/localization/auth-server"
    if [ -f "${AUTH_I18N_DIR}/en.json" ]; then
        # Always refresh ru.json from en.json so both locales stay in sync
        # after runtime replacements (brand strings, labels, common errors).
        cp -f "${AUTH_I18N_DIR}/en.json" "${AUTH_I18N_DIR}/ru.json"
    fi

    # Force auth form labels for all shipped locales used by the login page.
    # This avoids fallback to old upstream labels when a locale file is absent
    # or when browser language differs from expected.
    mkdir -p "${AUTH_I18N_DIR}"
    cat > "${AUTH_I18N_DIR}/en.json" <<'EOF'
{
  "username": "Имя пользователя",
  "password": "Пароль",
  "your password": "Введите пароль",
  "signin": "Войти",
  "confirm password": "Подтвердите пароль",
  "register": "Зарегистрироваться",
  "create account": "Создать аккаунт",
  "already have account": "Уже есть аккаунт? Войти",
  "name": "Имя",
  "last name": "Фамилия",
  "email": "Почта",
  "continue": "Продолжить",
  "complete your profile": "Заполните профиль",
  "passwords do not match": "Пароли не совпадают",
  "Passwords do not match": "Пароли не совпадают",
  "Username already taken": "Имя пользователя уже занято",
  "Email already in use": "Этот адрес электронной почты уже используется",
  "registration failed": "Ошибка регистрации",
  "profile update failed": "Ошибка сохранения профиля"
}
EOF
    cp -f "${AUTH_I18N_DIR}/en.json" "${AUTH_I18N_DIR}/ru.json"
    cp -f "${AUTH_I18N_DIR}/en.json" "${AUTH_I18N_DIR}/de.json"

    # After POST /token the login SPA must hard-navigate into the UI. The
    # snippet must not reload when nginx already served this page because
    # /verify rejected an expired access_token cookie — that loops forever.
    AUTH_HTML="/usr/share/nginx/html/auth_server/index.html"
    AUTH_POST_LOGIN_SNIPPET="/etc/papermerge/post-login-redirect.snippet.html"
    if [ -f "$AUTH_HTML" ] && [ -f "$AUTH_POST_LOGIN_SNIPPET" ]; then
        # Replace any previously injected copy so a stale reload loop cannot
        # survive an image update.
        if grep -q 'id="post-login-redirect"' "$AUTH_HTML"; then
            sed -i '/<script id="post-login-redirect">/,/<\/script>/d' "$AUTH_HTML"
        fi
        sed -i "/<\\/body>/r ${AUTH_POST_LOGIN_SNIPPET}" "$AUTH_HTML"
    fi
}

case "$CMD" in
    init)
        exec_init
        ;;
    migrate)
        exec_migrate
        ;;
    createsuperuser)
        exec_createsuperuser
        ;;
    server)
        exec_init
        echo "[init] Rendering runtime configs..."
        render_runtime_configs
        exec /usr/bin/supervisord -c /etc/papermerge/supervisord.conf
        ;;
    server_without_init)
        echo "[init] Rendering runtime configs..."
        render_runtime_configs
        exec /usr/bin/supervisord -c /etc/papermerge/supervisord.conf
        ;;
    create_token.sh|list_users.sh)
        shift
        exec "$CMD" "$@"
        ;;
    *)
        exec "$@"
        ;;
esac
