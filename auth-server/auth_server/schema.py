from uuid import UUID
from enum import Enum
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class User(BaseModel):
    id: UUID
    username: str
    password: str
    email: str
    home_folder_id: UUID
    inbox_folder_id: UUID
    is_superuser: bool = False
    scopes: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

    model_config = ConfigDict(from_attributes=True)


class TokenData(BaseModel):
    sub: str  # same as `user_id`
    preferred_username: str  # standard claim for `username`
    email: str
    scopes: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class AuthProvider(str, Enum):
    OIDC = "oidc"
    LDAP = "ldap"
    DB = "db"


class UserCredentials(BaseModel):
    username: str
    password: str
    provider: AuthProvider = AuthProvider.DB

    model_config = ConfigDict(from_attributes=True)


class RegisterCredentials(BaseModel):
    username: str
    password: str
    password_confirm: str

    model_config = ConfigDict(from_attributes=True)

    @field_validator("username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        return value.strip()


class RegisterProfile(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_name_fields(cls, value: str) -> str:
        return value.strip()


class Group(BaseModel):
    id: UUID
    name: str

    # Config
    model_config = ConfigDict(from_attributes=True)


class Role(BaseModel):
    id: UUID
    name: str

    # Config
    model_config = ConfigDict(from_attributes=True)


class Permission(BaseModel):
    id: UUID
    name: str  # e.g. "Can create tags"
    codename: str  # e.g. "tag.create"

    # Config
    model_config = ConfigDict(from_attributes=True)
