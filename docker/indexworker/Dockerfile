FROM python:3.13-slim

ENV TZ=Asia/Vladivostok

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev \
        curl \
        procps \
        tzdata && \
    ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime && \
    echo "${TZ}" > /etc/timezone && \
    rm -rf /var/lib/apt/lists/*

ENV CORE_APP=/core_app
WORKDIR ${CORE_APP}

RUN pip install --no-cache-dir poetry==2.0.1

COPY poetry.lock pyproject.toml README.md LICENSE ./
COPY alembic.ini ./
COPY papermerge ./papermerge/

RUN poetry install -E pg

CMD ["poetry", "run", "celery", "-A", "papermerge.celery_app", "worker", "-Q", "i3", "-c", "2", "--loglevel=info"]
