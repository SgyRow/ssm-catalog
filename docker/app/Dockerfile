# ---------------------------------------------------------------------------
# Stage 1: frontend bundle
# ---------------------------------------------------------------------------
FROM node:20.19 AS frontend_build

# Apply latest security updates. Retry to tolerate transient mirror failures.
RUN set -eux; \
    attempts=0; max_attempts=5; \
    until [ "$attempts" -ge "$max_attempts" ]; do \
        if apt-get update && apt-get upgrade -y; then break; fi; \
        attempts=$((attempts + 1)); \
        echo "apt-get failed (attempt ${attempts}/${max_attempts}), retrying..."; \
        sleep $((attempts * 5)); \
    done; \
    [ "$attempts" -lt "$max_attempts" ] || (echo "apt-get failed"; exit 1); \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build_frontend_app
COPY frontend/ .

RUN set -eux; \
    attempts=0; max_attempts=5; \
    until [ "$attempts" -ge "$max_attempts" ]; do \
      if corepack enable && \
         yarn set version 4.9.2 && \
         yarn install --immutable && \
         mkdir -p node_modules && \
         for d in packages/*; do \
           [ -d "$d" ] || continue; \
           name="$(basename "$d")"; \
           ln -sfn "/build_frontend_app/$d" "node_modules/$name"; \
         done && \
         yarn workspace ui build; then break; \
      fi; \
      attempts=$((attempts + 1)); \
      echo "yarn build failed (attempt ${attempts}/${max_attempts}), retrying..."; \
      sleep $((attempts * 5)); \
    done; \
    [ "$attempts" -lt "$max_attempts" ] || (echo "yarn build failed"; exit 1)

# ---------------------------------------------------------------------------
# Stage 2: auth-server (local sources under auth-server/)
# ---------------------------------------------------------------------------
FROM node:24.5-alpine AS auth_ui_build

RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

ENV UI_DIR=/auth_ui
WORKDIR ${UI_DIR}

COPY auth-server/ui2/ ./

RUN yarn install && yarn build

# Auth-server Python sources + built UI (Poetry env created in the final stage).
FROM alpine:3.21 AS auth_server

WORKDIR /app
COPY auth-server/poetry.lock auth-server/pyproject.toml auth-server/README.md /app/
COPY auth-server/auth_server/ /app/auth_server/

COPY --from=auth_ui_build /auth_ui/dist /usr/share/nginx/html

# ---------------------------------------------------------------------------
# Stage 3: runtime (nginx + core API + auth-server under supervisord)
# ---------------------------------------------------------------------------
FROM python:3.13-alpine AS papermerge_core

ENV CORE_APP=/core_app
ENV PAPERMERGE__DATABASE__URL=sqlite:////db/db.sqlite3
ENV PAPERMERGE__AUTH__USERNAME=admin
ENV PAPERMERGE__AUTH__EMAIL=admin@example.com
ENV PAPERMERGE__MAIN__API_PREFIX=""
ENV PAPERMERGE__OCR__LANG_CODES="deu,eng,rus"
ENV PAPERMERGE__OCR__DEFAULT_LANG_CODE="rus"
ENV PAPERMERGE__OCR__AUTOMATIC="false"
ENV TZ=Asia/Vladivostok

RUN set -eux; \
    attempts=0; max_attempts=5; \
    until [ "$attempts" -ge "$max_attempts" ]; do \
        if apk update && apk add --no-cache linux-headers python3-dev \
            gcc \
            curl \
            libc-dev \
            supervisor \
            imagemagick \
            nginx \
            postgresql-client \
            libpq-dev \
            poppler-utils \
            tzdata && \
            apk upgrade --no-cache; then break; \
        fi; \
        attempts=$((attempts + 1)); \
        echo "apk failed (attempt ${attempts}/${max_attempts}), retrying..."; \
        sleep $((attempts * 5)); \
    done; \
    [ "$attempts" -lt "$max_attempts" ] || (echo "apk install failed"; exit 1); \
    rm -rf /var/cache/apk/*

RUN pip install --upgrade poetry==2.0.1

# Vendored binary — download once and place at docker/app/bin/env2js.amd64
# (GitHub CDN may time out during `docker build` on slow networks).
COPY docker/app/bin/env2js.amd64 /bin/env2js
RUN chmod +x /bin/env2js

COPY poetry.lock pyproject.toml README.md LICENSE ${CORE_APP}/

WORKDIR ${CORE_APP}
RUN poetry install --no-root -E pg

COPY docker/app/entrypoint.sh /entrypoint.sh
COPY docker/app/bundles/supervisor/* docker/app/logging.yaml /etc/papermerge/
COPY docker/app/bundles/auth/post-login-redirect.snippet.html /etc/papermerge/
COPY docker/app/bundles/nginx/* /etc/nginx/
COPY docker/app/core.js.tmpl /etc/papermerge/
COPY alembic.ini ${CORE_APP}/
COPY ./papermerge ${CORE_APP}/papermerge/

COPY docker/app/scripts/ /usr/bin/
RUN for f in /entrypoint.sh /usr/bin/*.sh; do \
        sed -i '1s/^\xEF\xBB\xBF//' "$f"; \
        sed -i 's/\r$//' "$f"; \
        chmod +x "$f"; \
    done

# Auth-server artefacts (same Python process, separate Poetry env).
COPY --from=auth_server /app/ /auth_server_app/
COPY --from=auth_server /usr/share/nginx/html/ /usr/share/nginx/html/auth_server/

# Frontend bundle (served directly by nginx).
COPY --from=frontend_build /build_frontend_app/apps/ui/dist/ /usr/share/nginx/html/ui

RUN set -eux; \
    cd /auth_server_app/ && poetry install -E pg; \
    cd /core_app/ && poetry install -E pg -E cloud; \
    poetry -C /auth_server_app cache clear --all pypi; \
    poetry -C /core_app cache clear --all pypi; \
    rm -rf /root/.cache/pip /tmp/*

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["server"]
