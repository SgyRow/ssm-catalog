import uuid

from pydantic import BaseModel, ConfigDict, Field


class SharedNode(BaseModel):
    id: uuid.UUID
    node_id: uuid.UUID
    user_id: uuid.UUID | None = None
    group_id: uuid.UUID | None = None
    recipient_role_id: uuid.UUID | None = None
    owner_id: uuid.UUID
    role_id: uuid.UUID

    # Config
    model_config = ConfigDict(from_attributes=True)


class CreateSharedNode(BaseModel):
    node_ids: list[uuid.UUID]
    role_ids: list[uuid.UUID]
    user_ids: list[uuid.UUID]
    group_ids: list[uuid.UUID]
    recipient_role_ids: list[uuid.UUID] = Field(
        default_factory=list,
        description=(
            "Account roles: every user assigned one of these roles receives the share."
        ),
    )

    # Config
    model_config = ConfigDict(from_attributes=True)


class Role(BaseModel):
    name: str
    id: uuid.UUID
    # Config
    model_config = ConfigDict(frozen=True)


class User(BaseModel):
    username: str
    id: uuid.UUID
    roles: list[Role]


class Group(BaseModel):
    name: str
    id: uuid.UUID
    roles: list[Role]


class AudienceRole(BaseModel):
    """Everyone assigned this account role (users_roles) is a recipient."""

    name: str
    id: uuid.UUID
    roles: list[Role]


class UserUpdate(BaseModel):
    id: uuid.UUID
    role_ids: list[uuid.UUID]


class GroupUpdate(BaseModel):
    id: uuid.UUID
    role_ids: list[uuid.UUID]


class AudienceRoleUpdate(BaseModel):
    id: uuid.UUID
    role_ids: list[uuid.UUID]


class SharedNodeAccessDetails(BaseModel):
    id: uuid.UUID  # Node ID
    users: list[User] = Field(default_factory=list)
    groups: list[Group] = Field(default_factory=list)
    audience_roles: list[AudienceRole] = Field(default_factory=list)


class SharedNodeAccessUpdate(BaseModel):
    id: uuid.UUID  # Node ID
    users: list[UserUpdate] = Field(default_factory=list)
    groups: list[GroupUpdate] = Field(default_factory=list)
    audience_roles: list[AudienceRoleUpdate] = Field(default_factory=list)


class SharedNodeAccessUpdateResponse(BaseModel):
    id: uuid.UUID  # Node ID
    # is node still shared after access update ?
    is_shared: bool
