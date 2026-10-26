from enum import Enum
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class FileServer(str, Enum):
    LOCAL = 'local'
    S3 = 's3'

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    papermerge__main__logging_cfg: Path | None = Path("/etc/papermerge/logging.yaml")
    papermerge__main__media_root: Path = Path("media")
    papermerge__main__api_prefix: str = ''
    papermerge__main__prefix: str = ''
    papermerge__main__app_title: str = Field(
        default="Электронная библиотека Хабаровского центра социальной поддержки населения",
        description="Display title for optional UI branding.",
    )
    papermerge__main__cors_origins: str = Field(
        default="*",
        description="Comma-separated allowed CORS origins, or '*'.",
    )
    papermerge__main__soft_delete: bool = Field(
        default=True,
        description="Deprecated: nodes are always soft-deleted to trash.",
    )
    papermerge__main__trash_retention_days: int = Field(
        default=30,
        description="Default retention window (days) before auto-purge; overridden by library_settings.",
    )
    papermerge__main__office_web_viewer_base_url: str | None = Field(
        default=None,
        description="Optional Office Web Viewer base URL for iframe previews.",
    )
    papermerge__main__gotenberg_url: str | None = Field(
        default="http://127.0.0.1:3000",
        description="Gotenberg base URL for DOCX→PDF conversion on upload.",
    )
    papermerge__main__gotenberg_timeout_seconds: float = Field(
        default=300.0,
        description="HTTP timeout (seconds) for Gotenberg DOCX conversion.",
    )
    papermerge__main__file_server: FileServer = FileServer.LOCAL
    papermerge__main__cf_sign_url_private_key: str | None = None
    papermerge__main__cf_sign_url_key_id: str | None = None
    papermerge__main__cf_domain: str | None = None
    papermerge__main__timezone: str = 'Asia/Vladivostok'
    papermerge__main__cache_enabled: bool = False
    papermerge__database__url: str = "sqlite:////db/db.sqlite3"
    papermerge__redis__url: str | None = None
    papermerge__ocr__enabled: bool = Field(
        default=False,
        description="When false, OCR is disabled: no scheduling, no UI config, no worker.",
    )
    papermerge__ocr__default_lang_code: str = 'rus'
    papermerge__ocr__lang_codes: str = Field(
        default="deu,eng,rus",
        description="Comma-separated OCR language codes shown in the UI. "
                    "Must match languages available in the OCR worker (tesseract).",
    )
    papermerge__ocr__multi_lang_codes: str = Field(
        default="eng+rus",
        description="OCR language set used for automatic multilingual OCR runs.",
    )
    papermerge__preview__page_size_sm: int = 200  # pixels
    # When is OCR triggered ?
    # `ocr__automatic` = True means that OCR will be performed without
    #   end user intervention i.e. via background scheduler like celery scheduler
    # `ocr__automatic` = False means that OCR will be performed only
    #   if requested by end user. In this case user can choose to
    #   start schedule OCR on upload; also in this case use can choose to
    #   scheduler OCR later on any document.
    papermerge__ocr__automatic: bool = False
    papermerge__search__url: str | None = None
    papermerge__security__secret_key: str = Field(
        default="",
        description="Shared JWT signing secret; must match auth-server "
        "(PAPERMERGE__SECURITY__SECRET_KEY).",
    )
    papermerge__security__token_algorithm: str = Field(
        default="HS256",
        description="JWT signing algorithm; must match auth-server.",
    )
    # Development-only switch: when enabled, API requests without token
    # are treated as authenticated as `papermerge__dev__auth_bypass_username`.
    papermerge__dev__auth_bypass_enabled: bool = False
    papermerge__dev__auth_bypass_username: str = "admin"
    papermerge__library__catalog_root_node_id: str | None = Field(
        default=None,
        description="Optional UUID of the library catalog root folder for public browsing.",
    )

    @model_validator(mode="after")
    def default_lang_in_lang_codes(self) -> "Settings":
        if not self.papermerge__ocr__enabled:
            return self
        codes = {
            c.strip()
            for c in self.papermerge__ocr__lang_codes.split(",")
            if c.strip()
        }
        if self.papermerge__ocr__default_lang_code not in codes:
            raise ValueError(
                f"papermerge__ocr__default_lang_code "
                f"'{self.papermerge__ocr__default_lang_code}' must be present in "
                f"papermerge__ocr__lang_codes '{self.papermerge__ocr__lang_codes}'"
            )
        if not self.papermerge__ocr__multi_lang_codes.strip():
            raise ValueError("papermerge__ocr__multi_lang_codes must not be empty")
        return self

    def cors_origins_list(self) -> list[str]:
        raw = (self.papermerge__main__cors_origins or "*").strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()

def get_settings():
    # lazy load setting

    return settings
