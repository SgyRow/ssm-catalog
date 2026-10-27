from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AdvancedSearchItem(BaseModel):
    id: UUID
    title: str
    ctype: Literal["folder", "document"]
    created_at: datetime
    updated_at: datetime
    tags: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class AdvancedSearchResponse(BaseModel):
    page_size: int
    page_number: int
    num_pages: int
    items: list[AdvancedSearchItem]
