# Changelog

## 1.1.5 - 2025-08-11

- Update `auth_server.db.api.create_user` to defer constraint check
- Remove references to Sqlite (use only Postgresql)

## 1.1.4 - 2025-08-11

- Updates dependencies (FE + BE)

## 1.1.3 - 2025-04-30

- Fixes i18n caching problem by restructuring ui2/public/localization/ folder

## 1.1 - 2025-04-23

- Adds i18n

## 1.0.2 - 2025-02-01

- Fixes "No Visual Feedback on Wrong Credentials" [Issue#579](https://github.com/papermerge/papermerge-core/issues/579)

## 1.0.1 - 2024-11-20

- Update favicon

## 1.0 - 2024-11-16

- Use python 3.13
- Restructure project to use similar layout as core
- Use Mantine + vite for UI
- Use Docker alpine images
- Use typer for CLI interface

## 0.9.0 - 2024-04-07

- Support for scopes/permissions/groups

## 0.8.0 - 2024-03-03

- OIDC support

## 0.7.0 - 2024-02-18

- Refactoring - all sql functions to have session as first arg
- Adjust oauth2 so that github or google providers can use used separately
- Support for OpenLDAP (RFC 4510) authentication

## 0.6.4 - 2024-01-29

- Fix create_token.sh throws an error [Issue#314](https://github.com/papermerge/papermerge-core/issues/314)

## 0.6.3 - 2024-01-xx

- Fix create_user to work with MySql/MariaDB/sqlite [Issue#579](https://github.com/ciur/papermerge/issues/579)

## 0.6.2 - 2024-01-01

- disable DB connection pooling

## 0.6.1 - 2023-12-23

- install app in poetry environment (i.e. remove --no-root flag)

## 0.6.0 - 2023-12-23

- add `create_token` command
