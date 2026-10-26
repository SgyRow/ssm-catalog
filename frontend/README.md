# Frontend

Server's REST API base URL is read from `.env.development.local`:

```
VITE_BASE_URL=http://localhost:8000/
```

Authentication is handled by the regular `auth-server` login flow; the legacy
`VITE_REMOTE_USER` / `Remote-*` header mode has been removed.

Start the dev server (port 5173):

```
yarn dev
```

## List FE Workspaces

```
yarn workspaces list
```

Run dev server for a specific workspace:

```
yarn workspace ui dev
```

## Build Frontend

```
yarn install
yarn workspace ui build
```
