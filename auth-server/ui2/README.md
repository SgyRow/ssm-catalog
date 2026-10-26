# Auth-Server Frontend

## Build and dev scripts

- `dev` – start development server
- `build` – build production version of the app
- `preview` – locally preview production build

### Testing scripts

- `typecheck` – checks TypeScript types
- `lint` – runs ESLint
- `prettier:check` – checks files with Prettier
- `vitest` – runs vitest tests
- `vitest:watch` – starts vitest watch
- `test` – runs `vitest`, `prettier:check`, `lint` and `typecheck` scripts

### Other scripts

- `prettier:write` – formats all files with Prettier



## Dev Notes

### Upgrade Yarn

```
 $ yarn set version stable
```

The above command will do change files [like in this commit](https://github.com/papermerge/auth-server/pull/53/commits/e33332588e6ae9ba737ae821a8a43f72b614e9b6)

Note that currently used yarn version is listed in `.yarnrc.yaml`


## Interactive Upgrade of All FE deps

```
yarn upgrade-interactive
```
