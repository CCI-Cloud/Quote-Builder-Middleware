# Quote Builder Middleware

Small Express middleware service for Quote Builder extraction requests.

## Local development

```bash
npm install
npm run dev
```

Required environment variables are listed in `.env.example`.

## Build

This service does not compile assets, so the build step is a syntax validation pass:

```bash
npm run build
```

## PM2

Start the app with PM2 using the included config:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Or use the deployment helper on the server:

```bash
bash scripts/cloudways-deploy.sh
```

## Cloudways deployment outline

1. Push this project to a GitHub repository.
2. In Cloudways, create a Node.js application and connect it to the GitHub repo.
3. Set the app root to this project and configure environment variables from `.env.example`.
4. Use these deployment commands:

```bash
bash scripts/cloudways-deploy.sh
```
