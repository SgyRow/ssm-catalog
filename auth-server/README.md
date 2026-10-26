# Authentication Server

Auth server is standalone microservice that provides
authentication capabilities, and it is used as default authentication service
for Papermerge DMS.

Following authentication methods are supported:

* database - authenticate against user credentials from the database's
  core_user table
* oidc - authenticate against OIDC provider
* ldap - authenticate with LDAP

When authentication succeeds, auth server responds with a valid
cryptographically signed JWT access token.

JWT token is delivered to the client as http response payload (json format)
and as cookie.

## Usage

To start backend server:
```
  $ poetry run task server
```
To start frontend (in dev mode):
```
  $ cd ui2
  $ yarn dev
```
The login UI in `ui2/` is built inside `docker/app/Dockerfile` and served
by the app container. For a local UI build:

```
 $ cd ui2
 $ yarn build
```

In order to enable authentication via OIDC provider you need to
provide following environment variables:

* `PAPERMERGE__AUTH__OIDC_CLIENT_SECRET`
* `PAPERMERGE__AUTH__OIDC_CLIENT_ID`
* `PAPERMERGE__AUTH__OIDC_ACCESS_TOKEN_URL`
* `PAPERMERGE__AUTH__OIDC_USER_INFO_URL`
* `PAPERMERGE__AUTH__OIDC_INTROSPECT_URL`

You need to provider all five values.

`PAPERMERGE__AUTH__OIDC_REDIRECT_URI` should be:

    <http|https>://<your domain>/oidc/callback

Above value should be same as in field "Authorized redirect URI" when
registering oauth2 client.


Application providers one single endpoint `POST /token` which return jwt access
token. There two valid options for using `POST /token` endpoint:

1. non-empty request body with user credentials (application/json)
2. empty request body, but non-empty valid request params

In case 1. application will authenticate again user credentials in database
(TBD: or againt LDAP credentials, if LDAP configurations are present).
Here is an example of POST request with user credentials:

    $ curl -v -XPOST http://localhost:8000/token -H 'Content-Type: application/json' \
        -d '{"username": "username", "password":"password"}'

In case 2. i.e. when POST body is empty, then application using information from
request parameters will authenticate against one of the available OAuth 2.0
providers:

    $ curl -v -XPOST "http://localhost:8000/token?provider=google&code=123 ..."

On successful login "access_token" will be provided in response body.

You can decode JWT payload with:

    $ echo -n payload | base64 -d

## Configurations

This section lists all configuration environment variables.

### Security

* `PAPERMERGE__SECURITY__SECRET` (**required**)
* `PAPERMERGE__SECURITY__TOKEN_ALGORITHM` default value "HS256"
* `PAPERMERGE__SECURITY__TOKEN_EXPIRE_MINUTES` default value is 60

Possible values for token algorithm are:

* HS256
* HS384
* HS512
* RS256
* RS384
* RS512
* ES256
* ES384
* ES512

### Database

* `PAPERMERGE__DATABASE__URL` (optional)

Default value is "sqlite:////db/db.sqlite3". PostgreSql and MySql/MariaDB are
supported as well.  For PostgreSql scheme is `postgresql` and for MySql/MariaDB
scheme is `mysql`.

Database URL should be as described in [sql alchemy documentation](https://docs.sqlalchemy.org/en/20/core/engines.html#database-urls)
Keep in mind that papermerge-core uses [dj-database-url](https://pypi.org/project/dj-database-url/),
which means that many scheme described in sqlalchemy docs will not
work for papermerge-core.


### OIDC Auth

* `PAPERMERGE__AUTH__OIDC_CLIENT_SECRET`
* `PAPERMERGE__AUTH__OIDC_CLIENT_ID`
* `PAPERMERGE__AUTH__OIDC_ACCESS_TOKEN_URL`
* `PAPERMERGE__AUTH__OIDC_USER_INFO_URL`
* `PAPERMERGE__AUTH__OIDC_INTROSPECT_URL`
