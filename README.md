# Dental Clinic CRM

Production-ready CRM for a single dental clinic. Built with Next.js 15, NestJS, Prisma, and PostgreSQL.

## Monorepo Structure

```
dental-crm/
├── apps/api         # NestJS REST API
├── apps/web         # Next.js 15 frontend
└── packages/shared  # Shared Zod schemas, enums, TypeScript types
```

## Phase 1 — Quick Start (Local Dev)

### Prerequisites
- Node.js v18+
- A free cloud Postgres (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com))

### 1. Install dependencies
```bash
cd dental-crm
npm install
```

### 2. Configure the API
```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL to your cloud Postgres connection string
# Also set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (min 32 chars each)
```

### 3. Configure the web app
```bash
cp apps/web/.env.example apps/web/.env
# NEXT_PUBLIC_API_URL defaults to http://localhost:3001 — no changes needed for local dev
```

### 4. Run the database migration
```bash
cd apps/api
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Seed the database
```bash
npx ts-node prisma/seed.ts
```

Seed users created (all use password `Dental@2024!`):
| Role | Email |
|------|-------|
| Super Admin | superadmin@clinic.com |
| Clinic Manager | manager@clinic.com |
| Reception | reception@clinic.com |
| Sales Consultant | sales@clinic.com |
| Dentist | dentist@clinic.com |

### 6. Start the API
```bash
# From apps/api
npm run start:dev
# API: http://localhost:3001/api
# Swagger docs: http://localhost:3001/api/docs
```

### 7. Start the web app
```bash
# From apps/web
npm run dev
# Web: http://localhost:3000
```

### 8. Run unit tests
```bash
# From apps/api
npm run test
```

---

## Docker (Production)

Requires Docker Desktop installed.

```bash
# Generate dev TLS certs
bash scripts/generate-dev-certs.sh

# Copy and configure env files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Build and start all services (postgres, minio, api, web, nginx)
docker compose up --build

# Run migrations inside the api container
docker compose exec api npx prisma migrate deploy
docker compose exec api npx ts-node apps/api/prisma/seed.ts
```

---

## API Endpoints (Phase 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | Public | Login |
| POST | /api/auth/refresh | Cookie | Refresh access token |
| POST | /api/auth/logout | Bearer | Logout |
| GET | /api/auth/me | Bearer | Current user |
| GET | /api/users | Admin/Manager | List users |
| POST | /api/users | Admin/Manager | Create user |
| PATCH | /api/users/:id | Admin/Manager | Update user |
| DELETE | /api/users/:id | Admin/Manager | Deactivate user |
| GET | /api/health | Public | Health check |

Full Swagger documentation: http://localhost:3001/api/docs

---

## Phases

- **Phase 1** ✅ Architecture, Auth, Basic UI (current)
- **Phase 2** ⏳ Patient CRM, Pipeline, Dashboard
- **Phase 3** ⏳ WhatsApp & Facebook Integration
- **Phase 4** ⏳ Calendar, Calling, Finance
- **Phase 5** ⏳ Reports, AI, Optimization, Full Deployment
