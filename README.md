# Unifesto

Event platform: Spaces host events, attendees discover, register, pay and check in.

```
unifesto/
├── backend/        # NestJS API + Prisma (api.unifesto.app)
├── mobile/         # Expo attendee app ("Unifesto"), the production app
├── websites/
│   ├── apex/       # platform-admin dashboard
│   ├── space/      # Space operator app (space.unifesto.app)
│   └── web/        # public site: event & space pages, blog, careers
├── docs/           # feature plans
└── Caddyfile · docker-compose.yml · deploy.sh
```

Each project keeps its **own install**: run `npm install` inside `backend/`,
`mobile/`, or the website you're working on. The root has no `package.json`
on purpose, so run Expo commands (`prebuild`, `run:ios`, ...) from `mobile/`.

## Run locally

```bash
cd backend && npm run start:dev          # API
cd mobile && npm start                   # Expo dev server (dev client)
cd websites/space && npm run dev         # :3001
cd websites/apex && npm run dev          # :3000 (same for web)
```

Needs Node 20+. For mobile native builds, Xcode / Android Studio or EAS
(`mobile/eas.json`).

## Mobile app

`mobile/` is improved **in place**, one step at a time. There is no parallel
rewrite. Styling is `StyleSheet`-based:

- `mobile/src/theme/tokens.ts`: semantic colour tokens (dark + staged light)
- `mobile/src/components/ui/`: token-driven primitives (`Text`, `Button`,
  `Card`, `Badge`). New and migrated screens use these; legacy components
  are replaced screen by screen.

## Deploy

`docker-compose.yml` runs Caddy, the backend (plus a one-shot
`backend-migrate`) and three websites (apex, space, web). `deploy.sh` syncs the repo to the
server over SSH and rebuilds:

```bash
./deploy.sh                 # whole stack
./deploy.sh backend space   # just these services
```
