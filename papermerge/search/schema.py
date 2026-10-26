from typing import Optional

from pydantic import BaseModel, ConfigDict
from salinic import types
from salinic.field import KeywordField, StringField, TextField, UUIDField
from salinic.schema import Schema
from typing_extensions import Annotated

FOLDER = "folder"
PAGE = "page"


class SearchIndex(Schema):
    """Search Index Schema"""

    model_config = ConfigDict(arbitrary_types_allowed=True, lang_field_name="lang")

    id: Annotated[
        str, UUIDField(primary_key=True, general_search=True)
    ]  # page id | node_id

    # document ID to whom this page belongs
    document_id: Annotated[
        Optional[str], TextField(index=False, general_search=True, group=True)
    ] = None

    lang: Annotated[str, KeywordField()] = "en"

    user_id: Annotated[Optional[str], StringField(index=True)] = None

    group_id: Annotated[Optional[str], StringField(index=True)] = None

    title: Annotated[
        str, TextField(general_search=True, multi_lang=True)
    ]  # document or folder title

    # text is None in case folder entity
    text: Annotated[Optional[str], TextField(general_search=True, multi_lang=True)] = (
        None
    )

    # None in case of folder entity
    page_number: types.OptionalNumeric = None

    tags: Annotated[Optional[list[str]], KeywordField(multi_value=True)] = []

    def __str__(self):
        return (
            f"IndexEntity(id={self.id}, title={self.title}, "
            f"document_id={self.document_id},"
            f"number={self.page_number},"
            f"text=|{self.text}|,"
            f"type={self.entity_type})"
        )


class SearchResultItem(BaseModel):
    id: str
    title: str
    lang: str
    tags: list[str] = []


class DocumentPage(SearchResultItem):
    page_number: int
    document_id: str
    entity_type: str = "document"

    def __hash__(self):
        return hash(self.model_dump_json())


class Folder(SearchResultItem):
    entity_type: str = "folder"

    def __hash__(self):
        return hash(self.model_dump_json())


class PaginatedResponse(BaseModel):
    page_size: int
    page_number: int
    num_pages: int
    items: list[Folder | DocumentPage]

    model_config = ConfigDict(from_attributes=True)


def coerce_search_item(item) -> Folder | DocumentPage:
    """Normalize salinic or plain hits into API response models."""
    if isinstance(item, DocumentPage):
        return item
    if isinstance(item, Folder):
        return item

    document_id = getattr(item, "document_id", None)
    if document_id:
        return DocumentPage(
            id=item.id,
            title=item.title,
            lang=item.lang,
            tags=list(getattr(item, "tags", None) or []),
            page_number=item.page_number,
            document_id=document_id,
        )

    return Folder(
        id=item.id,
        title=item.title,
        lang=item.lang,
        tags=list(getattr(item, "tags", None) or []),
    )
