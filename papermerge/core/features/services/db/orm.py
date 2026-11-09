import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base

GOSUSLUGI_SLUG = "gosuslugi"
GOSUSLUGI_ID = uuid.UUID("0a1b2c3d-4e5f-4789-8abc-def012345678")
GOSUSLUGI_TITLE = "Госуслуги"
GOSUSLUGI_URL = "https://www.gosuslugi.ru/"


class ExternalService(Base):
    __tablename__ = "external_services"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    slug: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=func.now(),
        nullable=False,
    )
