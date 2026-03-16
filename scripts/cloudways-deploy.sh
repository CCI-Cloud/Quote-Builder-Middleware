#!/bin/bash

set -e

npm ci
npm run build

if pm2 describe quote-builder-middleware >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs --update-env
fi

pm2 save
