# Performance Validation Baseline

This document defines repeatable checks for preview/open performance after changes.

## Scope

- `GET /api/documents/{id}/last-version/`
- `GET /api/document-versions/{id}/download`
- Frontend preview bootstrap and first page render

## Required Metrics

- Frontend:
  - `getDocLastVersion.meta_ms`
  - `getDocLastVersion.download_ms`
  - `getDocLastVersion.total_ms`
  - `bootstrap_complete.ms`
  - `pdf_batch_render.parse_ms`
  - `pdf_batch_render.total_ms`
- Backend:
  - `last_doc_version_ready.elapsed_ms`
  - `download_document_version_ready`
  - queue lag for `ocr`, `s3preview`, `path_tmpl`

## Test Profiles

- Small PDF: 1-5 pages
- Medium PDF: 20-50 pages
- Large PDF: 100+ pages

## Acceptance Targets

- `last-version` p95 < 250ms on warm cache
- `time_to_first_preview` p95 < 800ms
- no persistent viewer flicker
- no 5xx errors in hot path

## Regression Procedure

1. Open each profile document 5 times.
2. Record frontend metrics from browser console.
3. Record backend logs with correlation ID.
4. Compare p50/p95 to previous baseline.
5. Reject rollout if p95 regresses by >20% without explicit approval.
