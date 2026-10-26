from uuid import UUID

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base

from papermerge.core.features.library_ts.constants import LIBRARY_SETTINGS_ROW_ID


class LibrarySettings(Base):
    """Single-row settings: root folder for the public library catalog."""

    __tablename__ = "library_settings"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=LIBRARY_SETTINGS_ROW_ID
    )
    catalog_root_node_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(
            "nodes.id",
            use_alter=True,
            name="library_settings_catalog_root_node_id_fkey",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    trash_retention_days: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        doc="Days before trashed nodes are permanently removed; null uses env default.",
    )
