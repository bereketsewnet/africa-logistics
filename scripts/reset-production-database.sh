#!/usr/bin/env bash
# Rebuild Afri Logistics and make a deliberately empty production start.
# This permanently deletes every record in the africa_logistics database and
# every file in the application's uploads volume. It is intentionally guarded.
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

confirm_value="ERASE_AFRICA_LOGISTICS_PRODUCTION"
env_file="africa-logistic-backend/.env"

if [[ "${CONFIRM_AFRI_PRODUCTION_RESET:-}" != "$confirm_value" ]]; then
  echo "Refusing to reset production. Run exactly:"
  echo "  CONFIRM_AFRI_PRODUCTION_RESET=$confirm_value ./scripts/reset-production-database.sh"
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Configure production environment values first."
  exit 1
fi
if ! grep -qx 'NODE_ENV=production' "$env_file"; then
  echo "NODE_ENV=production is required in $env_file."
  exit 1
fi
if ! grep -Eq '^JWT_SECRET=.{32,}$' "$env_file" || ! grep -Eq '^CONFIG_ENCRYPTION_KEY=.{32,}$' "$env_file"; then
  echo "Strong JWT_SECRET and CONFIG_ENCRYPTION_KEY values are required before reset."
  exit 1
fi
if ! grep -qx 'INITIAL_ADMIN_PHONE=+251904734191' "$env_file"; then
  echo "INITIAL_ADMIN_PHONE must be +251904734191 before this first production reset."
  exit 1
fi
if ! grep -Eq '^INITIAL_ADMIN_PASSWORD=.+$' "$env_file"; then
  echo "INITIAL_ADMIN_PASSWORD is required to create the first administrator."
  exit 1
fi

echo "Building the production backend and frontend images..."
docker compose build africa_backend africa_frontend

echo "Ensuring MySQL is available..."
docker compose up -d mysql

echo "Dropping and recreating the africa_logistics database..."
docker compose exec -T mysql mysql -uroot -e 'DROP DATABASE IF EXISTS `africa_logistics`; CREATE DATABASE `africa_logistics` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;'
docker compose exec -T mysql sh -c 'mysql -uroot africa_logistics < /docker-entrypoint-initdb.d/01_backup.sql'

echo "Removing legacy uploaded files..."
docker compose run --rm --no-deps --entrypoint sh africa_backend -c 'find /app/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'

echo "Starting fresh application containers..."
docker compose up -d --force-recreate africa_backend africa_frontend caddy

echo "Waiting for migrations and the initial administrator..."
for attempt in {1..30}; do
  user_count="$(docker compose exec -T mysql mysql -uroot -N -e 'SELECT COUNT(*) FROM africa_logistics.users;' 2>/dev/null || true)"
  if [[ "$user_count" == "1" ]]; then
    admin_count="$(docker compose exec -T mysql mysql -uroot -N -e "SELECT COUNT(*) FROM africa_logistics.users WHERE role_id = 1 AND phone_number = '+251904734191';" 2>/dev/null || true)"
    if [[ "$admin_count" == "1" ]]; then
      echo "Production reset verified: exactly one user exists and it is the initial admin."
      echo "Log in as Abdi, change the initial password immediately, then remove INITIAL_ADMIN_PASSWORD from $env_file."
      exit 0
    fi
  fi
  sleep 2
done

echo "The containers started, but the expected one-admin verification did not finish."
echo "Inspect logs with: docker compose logs --tail=200 africa_backend"
exit 1
