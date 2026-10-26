import logging
from ldap3 import Server, Connection, ALL
from auth_server.config import Settings


logger = logging.getLogger(__name__)

settings = Settings()


class LDAPAuth:
    name: str = 'ldap'

    def __init__(self,
        url: str,
        username: str,
        password: str,
        user_dn_format: str,
        email_attr: str = 'mail',
        use_ssl: bool = True,
    ):
        self._username = username
        self._password = password
        self._url = url
        self._user_dn_format = user_dn_format
        self._use_ssl = use_ssl
        self._email_attr = email_attr
        self._conn = None

    async def signin(self):
        return self._signin()

    def _signin(self):
        server = Server(self._url, use_ssl=self._use_ssl, get_info=ALL)
        user_dn = self.get_user_dn()
        self._conn = Connection(server, user_dn, self._password)

        if not self._conn.bind():
            # this may happen from multiple reasons:
            # 1. user simply provided wrong credentials
            # 2. auth_server configuration issues
            # 3. server side problem
            logger.info(
                f"LDAP conn.bind() returned falsy value: {self._conn}"
            )
            raise Exception("LDAP conn.bind() returned falsy value")

        return self._conn

    async def user_email(self) -> str | None:
        if self._conn is None:
            self._conn = await self.signin()

        return self._user_email()

    def _user_email(self) -> str | None:
        user_dn = self.get_user_dn()
        search_filter = f'(uid={self._username})'
        attributes = [
            'uid', self._email_attr
        ]
        msg = "User entry not found:" \
              f"user_dn: {user_dn} " \
              f"search filter: {search_filter}" \
              f"attributes: {attributes}"
        if self._conn.search(
            user_dn,
            search_filter,
            attributes=attributes
        ):
            if len(self._conn.entries) == 0:
                logger.info(msg)
                return None

            result = self._conn.entries[0]

            if not result:
                logger.info("conn.search returned an empty entry")
                logger.info(msg)
                return None

            if result[self._email_attr] is None:
                logger.info("con.search empty email attr")
                logger.info(msg)
                return None

            return result[self._email_attr].value
        else:
            logger.info("conn.search returned falsy value")
            logger.info(msg)

        return None

    def get_user_dn(self) -> str:
        return self._user_dn_format.format(username=self._username)


def get_client(username: str, password: str) -> LDAPAuth:
    return LDAPAuth(
        url=settings.papermerge__auth__ldap_url,
        username=username,
        password=password,
        user_dn_format=settings.papermerge__auth__ldap_user_dn_format,
        email_attr=settings.papermerge__auth__ldap_email_attr,
        use_ssl=settings.papermerge__auth__ldap_use_ssl
    )


def get_default_email(username: str) -> str:
    domain = settings.papermerge__auth__ldap_user_email_domain_fallback
    return f"{username}@{domain}"


