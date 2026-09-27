# Odan Construction Estimate Management System

An independent construction estimate workspace with secure sign-in, role permissions, estimate editing and approval, audit logs, A4 PDF exports, and formula-enabled Excel workbooks.

## Requirements

- Node.js 22 or later and npm
- PostgreSQL 18 installed locally, with database `odan_estimation` at `localhost:5432`
- Chrome or Chromium for PDF generation and browser tests

The React frontend and Express backend run directly with Node.js and npm. PostgreSQL is provided by the installed service. The database must be dedicated to this application.

## Windows Command Prompt setup

Open **Command Prompt** in this repository:

```cmd
cd /d "F:\Odan Construction\Estimation Web\odan-construction-estimates"
npm ci
if not exist backend\.env copy backend\.env.example backend\.env
notepad backend\.env
```

In `backend/.env`, replace `YOUR_USERNAME` and `YOUR_PASSWORD` in `DATABASE_URL` with your PostgreSQL account. If either contains URL special characters such as `@`, `:`, `/`, or `#`, percent-encode that value. Keep the database name, host, and port as shown:

```dotenv
DATABASE_URL=postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/odan_estimation?schema=public
```

The `.env` file is ignored by Git. The frontend never reads database credentials. The database must exist and the configured account must be able to create tables. If you need to create it, connect to PostgreSQL as an administrator from Command Prompt:

```cmd
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5432 -U postgres -d postgres
```

At the `postgres=#` prompt, replace `YOUR_USERNAME` with the PostgreSQL role you entered in `backend/.env`:

```sql
CREATE DATABASE odan_estimation OWNER YOUR_USERNAME;
\q
```

If the database already exists, keep its data and skip `CREATE DATABASE`. PostgreSQL prompts for the administrator password; do not pass passwords as command-line arguments.

Then run these commands in the project Command Prompt:

```cmd
npm run db:generate
npm run db:migrate
npm run db:seed
npm run browser:use -- "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run dev
```

Open http://127.0.0.1:43187. The seeded administrator email and password are in `backend/.env` under `ODAN_SEED_EMAIL` and `ODAN_SEED_PASSWORD`. Set a unique administrator password of at least 16 characters before running `db:seed`. The seed does not reset an existing administrator's password or overwrite existing estimates.

If Chrome is installed elsewhere, provide its absolute executable path to `browser:use`. `npm run browser:install` downloads a separate Chromium copy into this project's ignored cache when network access allows.

## Commands

Run these from this repository in Command Prompt:

```cmd
npm run dev
npm run build
npm test
npm run test:integration
npm run test:e2e
npm run db:migrate
npm run db:seed
```

`npm run dev` serves the frontend at `127.0.0.1:43187` and API at `127.0.0.1:43188`. Frontend changes reload automatically; restart the combined command after backend changes. Integration and browser tests require the configured database; browser tests also require Chrome or Chromium. Stop `npm run dev` before running `test:e2e` because Playwright starts its own servers.

## Recover access to an existing account

From Command Prompt in this repository, run:

```cmd
cd /d "F:\Odan Construction\Estimation Web\odan-construction-estimates"
npm run user:recover -w backend
```

At the interactive prompts, enter the **existing account email** (for example, `YOUR_ADMIN_EMAIL@example.com`), then enter and confirm a new password of 16–128 characters. Password entry is masked; never put a password in a command argument, redirected file or terminal history. The command only resets an existing account identified by its normalized email. It does not create users or change roles. It revokes every session for that account, so sign in again with the new password. It records a password-free audit event. An unknown email receives a generic error.

## Project structure

```text
odan-construction-estimates/
├── frontend/           React, TypeScript, Vite
├── backend/            Express, Prisma schema, migrations and seed
├── docs/               Architecture, API and operations
├── e2e/                Playwright workflows
├── scripts/            Browser selection and port checks
├── .gitignore
├── README.md
└── package.json
```

The API and migration wrapper read `DATABASE_URL` only from this project's `backend/.env`. Authentication uses server-side sessions, CSRF checks and role permissions. See the [API reference](docs/api.md), [architecture](docs/architecture.md), [operations](docs/operations.md), and [verification results](docs/verification.md).
