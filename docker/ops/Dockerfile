FROM postgres:16.1-alpine

RUN apk add --no-cache bash dcron tzdata

COPY docker/ops/entrypoint.sh docker/ops/run-backup.sh /ops/
RUN sed -i '1s/^\xEF\xBB\xBF//' /ops/*.sh && \
    sed -i 's/\r$//' /ops/*.sh && \
    chmod +x /ops/*.sh

ENTRYPOINT ["/ops/entrypoint.sh"]
