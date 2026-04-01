# ─── Africa Logistics Backend ────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 3000

CMD ["node_modules/.bin/tsx", "src/server.ts"]
