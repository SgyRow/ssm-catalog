from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CitizenCategoryOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    sort_order: int = 0
    folder_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitizenCategoryCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    description: str | None = None
    sort_order: int = 0


class CitizenCategoryUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    sort_order: int | None = None


class CitizenCategoryFolderOut(BaseModel):
    node_id: UUID
    title: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SetFolderCategoriesIn(BaseModel):
    category_ids: list[UUID]
