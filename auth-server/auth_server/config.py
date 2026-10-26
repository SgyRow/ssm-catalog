import logging

from functools import lru_cache
from enum import Enum

from pydantic_settings import BaseSettings


logger = logging.getLogger(__name__)


class Algs(str, Enum):
    HS256 = "HS256"
    HS384 = "HS384"
    HS512 = "HS512"
    RS256 = "RS256"
    RS384 = "RS384"
    RS512 = "RS512"
    ES256 = "ES256"
    ES384 = "ES384"
    ES512 = "ES512"


class Settings(BaseSettings):
    papermerge__security__secret_key: str
    papermerge__security__token_algorithm: Algs = Algs.HS256
    papermerge__security__token_expire_minutes: int = 360
    papermerge__security__cookie_name: str = "access_token"

    # database where to read user table from
    papermerge__database__url: str
    papermerge__auth__oidc_client_secret: str | None = None
    papermerge__auth__oidc_client_id: str | None = None
    papermerge__auth__oidc_access_token_url: str | None = None
    papermerge__auth__oidc_user_info_url: str | None = None
    # https://datatracker.ietf.org/doc/html/rfc7662
    papermerge__auth__oidc_introspect_url: str | None = None

    papermerge__auth__ldap_url: str | None = None  # e.g. ldap.trusel.net
    papermerge__auth__ldap_use_ssl: bool = True
    # e.g. uid={username},ou=People,dc=ldap,dc=trusel,dc=net
    papermerge__auth__ldap_user_dn_format: str | None = None
    # LDAP Entry attribute name for the email
    papermerge__auth__ldap_email_attr: str = "mail"
    # if there is an error retrieving ldap_email_attr, the
    # fallback user email will be set to username@<email-domain-fallback>
    papermerge__auth__ldap_user_email_domain_fallback: str = "example-ldap.com"

    papermerge__auth__registration_enabled: bool = True


@lru_cache()
def get_settings():
    return Settings()
