# Afri Logistics VPS Deployment Guide

This handover package contains the complete application source, frontend production build, Docker/Caddy configuration, database backup files, assets, and current `.env` configuration. Keep it private because the `.env` files contain passwords and API keys.

## Package contents

- `africa-logistic-frontend/` — React website, dashboards, public assets, and rebuilt `dist/` folder.
- `africa-logistic-backend/` — Fastify API, database migration code, OTP/email/payment services.
- `ai-assistance/` — optional AI-assistance/RAG service.
- `init/01_backup.sql` and `africa_logistics_backup.sql` — database backups.
- `docker-compose.yml` and `Caddyfile` — production services and HTTPS proxy.
- `migrate_to_new_vps.sh` — Debian/Ubuntu migration helper.

The archive excludes only `node_modules`, Python caches, test output, and `.git` history. The frontend production build is included because the frontend Dockerfile serves `africa-logistic-frontend/dist` directly.

## Deploy on a new Ubuntu/Debian VPS

1. Point DNS for `afri-logistics.com` and `backend.afri-logistics.com` to the new server IP. Open ports 80 and 443.
2. Copy the ZIP privately to the VPS and extract it:

```bash
sudo apt-get update
sudo apt-get install -y unzip
sudo mkdir -p /opt/afri-logistics
sudo unzip afri-logistics-vps-handover.zip -d /opt/afri-logistics
sudo chown -R "$USER":"$USER" /opt/afri-logistics
cd /opt/afri-logistics
chmod +x migrate_to_new_vps.sh
./migrate_to_new_vps.sh
```

3. Install backend dependencies and start the Docker services:

```bash
cd /opt/afri-logistics/africa-logistic-backend
npm ci
cd /opt/afri-logistics
docker compose up -d --build
docker compose ps
```

The frontend build is already included. If you change frontend code on the VPS, rebuild it before rebuilding Docker:

```bash
cd /opt/afri-logistics/africa-logistic-frontend
npm ci
npm run build
cd /opt/afri-logistics
docker compose up -d --build
```

## Configuration checklist

Before going live, review the private `.env` files:

- Frontend: set `VITE_API_BASE_URL` to the public backend `/api` URL.
- Backend: set frontend/API URLs, a new strong `JWT_SECRET`, MySQL credentials, Gmail SMTP App Password, Twilio credentials, VAPID keys, and Telegram bot token as needed.
- AI assistance: review Gemini key, database URL, and CORS origins.
- Replace credentials that were exposed during transfer.

## Restore database

On a fresh Docker MySQL deployment, `init/01_backup.sql` is imported automatically. To restore a backup manually:

```bash
docker compose up -d mysql
docker compose exec -T mysql mysql -uroot africa_logistics < africa_logistics_backup.sql
```

## Verify deployment

```bash
docker compose ps
docker compose logs --tail=100 africa_backend
curl -fsS https://backend.afri-logistics.com/api/health
```

Test homepage links, login, registration, email delivery, one real SMS OTP, order flow, admin dashboard, and the Telegram Mini App. Never run `docker compose down -v` unless you intentionally want to delete the MySQL database volume.
