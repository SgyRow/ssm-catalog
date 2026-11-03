"""Pydantic schemas for the МСП (Measures of Social Support) feature."""
from __future__ import annotations

import uuid
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------- #
# Types (виды МСП)
# --------------------------------------------------------------------------- #
class MspTypeSectionBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class MspTypeSectionRead(MspTypeSectionBase):
    id: UUID
    sort_order: int


class NewMspType(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    description: str | None = None
    sections: list[MspTypeSectionBase] = Field(default_factory=list)


class MspTypeRead(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    sections: list[MspTypeSectionRead] = Field(default_factory=list)


class NewMspTypeSection(BaseModel):
    title: str = Field(min_length=1, max_length=300)


# --------------------------------------------------------------------------- #
# Measures (меры МСП)
# --------------------------------------------------------------------------- #
class MspSectionInput(BaseModel):
    """A section value supplied when creating/updating a measure.

    ``type_section_id`` references the section of the type. ``title`` is
    optional: when omitted it is taken from the linked type section. An empty
    ``body`` means the section is not needed and is not stored.
    """

    type_section_id: UUID | None = None
    title: str = Field(default="", max_length=300)
    body: str | None = None


class MspSectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type_section_id: UUID | None
    title: str
    body: str | None
    sort_order: int


class NewMsp(BaseModel):
    parent_id: UUID
    title: str = Field(min_length=1, max_length=500)
    msp_type_id: UUID
    sections: list[MspSectionInput] = Field(default_factory=list)


class UpdateMsp(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    sections: list[MspSectionInput] | None = None


class MspRead(BaseModel):
    id: UUID
    node_id: UUID
    title: str
    msp_type_id: UUID
    msp_type_name: str
    sections: list[MspSectionRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
