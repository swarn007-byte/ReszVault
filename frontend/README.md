# ReszVault Frontend

React and Vite power the PDF and GitHub research workspace. Follow the [repository setup](../README.md#local-development-with-hot-reload) to start Django and PostgreSQL, then run `npm ci` and `npm run dev` in this directory. The app opens at [http://localhost:5175](http://localhost:5175).

Vite proxies API requests to Django on port `8000`. `RESZVAULT_API_TARGET` overrides the proxy target for local development. The [local Docker image](Dockerfile) serves the build through [NGINX](nginx.conf) and proxies API requests to Django. The hosted frontend uses [Vercel rewrites](vercel.json).

- `npm run build` runs the TypeScript checks and production build.
- `npm run test:e2e` starts the test servers and runs the PDF chat browser test. Start PostgreSQL and apply Django migrations first.
