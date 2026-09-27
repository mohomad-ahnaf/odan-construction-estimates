# Operations

## Configuration

`backend/.env` is the only application configuration file. Set `DATABASE_URL` to the dedicated `odan_estimation` PostgreSQL database. For the installed Windows service, its host is `localhost` and port is `5432`. Set `ODAN_ORIGIN` to the exact browser origin; development uses `http://127.0.0.1:43187`. The backend reads its own file directly and does not search parent directories. The frontend receives no database credentials.

The account in `DATABASE_URL` needs database access and permission to apply Prisma migrations. Keep the URL in the ignored `.env` file or a protected equivalent when deploying. Special characters in the username and password must be percent-encoded. Do not put credentials in commands, source files, or browser storage.

The installed PostgreSQL service runs separately from Node.js. The frontend and backend run directly through `npm run dev`. The application does not provision, start, or stop the PostgreSQL service. Use the [README](../README.md) for Windows Command Prompt setup.

## Migrations and deployment

Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed` after configuring the database. Migration SQL is versioned in `backend/prisma/migrations`. Do not use `db push` for deployment. Use the same `backend/.env` for source and compiled API.

For production, use `NODE_ENV=production`, an HTTPS `ODAN_ORIGIN`, and a matching reverse proxy. The API binds to loopback. Serve `frontend/dist` and route `/api` to the API on the same origin; route other frontend paths to `index.html`. Secure cookies require HTTPS. Build with `npm run build`, apply migrations, then run `npm start -w backend`.

## Users and backups

The initial administrator is created by `npm run db:seed`; set `ODAN_SEED_EMAIL` and a unique `ODAN_SEED_PASSWORD` of at least 16 characters in `backend/.env` first. Seed operations do not overwrite existing passwords or estimates.

Additional accounts can be provisioned by an operator with `npm run user:create -w backend`, which reads JSON from stdin with `email`, `name`, `role` (`ADMIN`, `ESTIMATOR`, `VIEWER`), and a 16–128 character password. There is no public registration endpoint.

Back up `odan_estimation` with the installed PostgreSQL 18 tools and periodically test restoration. Keep backups protected and outside Git. A previous project database snapshot, if present, is retained only in this repository's ignored `.cache` directory for migration safety; it is not used by the application.

### Client and Project migration backup

Before applying the Client and Project migration or reconciling existing estimates, make a fresh custom-format backup from **Command Prompt** in this repository. Replace only the username placeholder; PostgreSQL prompts for the password, which must not be placed in the command or a script.

```cmd
if not exist .cache\backups mkdir .cache\backups
"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -p 5432 -U YOUR_DATABASE_USERNAME -W -F c -f ".cache\backups\odan_estimation-manual.dump" odan_estimation
"C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list ".cache\backups\odan_estimation-manual.dump" >NUL
```

Keep the resulting archive protected. The `.cache/` directory is ignored by Git; it is not a substitute for a separate, tested backup copy. Apply the versioned migration with `npm run db:generate` and `npm run db:migrate` only after the backup succeeds.

### Operator-assisted historical reconciliation

Phase 1 adds nullable `Estimate.clientId`, `Estimate.projectId`, and `Estimate.estimateDate`. It does not infer Clients or Projects from similar names or titles. Existing estimate content and financial snapshots remain unchanged. New-estimate API requirements will be enabled with the Client/Project selection form in Phase 2.

Run these commands from Command Prompt in the repository:

```cmd
npm run reconcile:report -w backend
notepad .cache\reconciliation\report.json
notepad .cache\reconciliation\plan.json
npm run reconcile:preview -w backend
npm run reconcile:apply -w backend
```

The report lists each unlinked estimate's internal ID, number, client name, title, and site address. The plan template is created only if no plan exists. Replace its placeholder references after checking each estimate with an operator who knows the real Client and Project. A `new:KEY` reference creates a record defined in `newClients` or `newProjects`; an `id:UUID` reference selects an existing record. For example, a new Client and Project can be specified as follows, using the actual estimate ID from the ignored report:

```json
{
  "newClients": [
    {
      "key": "clientA",
      "name": "Confirmed client",
      "email": "contact@example.com"
    }
  ],
  "newProjects": [
    {
      "key": "projectA",
      "clientRef": "new:clientA",
      "projectName": "Confirmed project",
      "status": "ACTIVE"
    }
  ],
  "links": [
    {
      "estimateId": "REPLACE_WITH_REPORT_UUID",
      "clientRef": "new:clientA",
      "projectRef": "new:projectA"
    }
  ]
}
```

Client emails are normalized to lowercase; registration and VAT numbers and project codes are normalized to uppercase and checked for duplicates. The preview reads and validates the plan without changing the database. Apply prints the same preview, verifies a backup archive in `.cache/backups`, and requires an interactive `APPLY` confirmation. It creates selected records and updates **only** the two estimate relationship columns in one transaction, with audit events. It never fills historical `estimateDate` or rewrites the estimate's snapshot fields. Existing Clients and Projects cannot be hard-deleted while referenced; Clients can be deactivated and Projects archived when management APIs are added in Phase 2. Both `.cache/` and `.data/` remain ignored by Git.

## Browser and diagnostics

Run `npm run browser:use -- "C:\Program Files\Google\Chrome\Application\chrome.exe"` from Command Prompt to select an installed Chrome binary. A machine-specific selection is saved to ignored `.cache/browser.json`. Alternatively, run `npm run browser:install` to download Chromium into this project's cache. Puppeteer and Playwright use that selection for PDF and browser tests.

- The API health endpoint is `/api/health`. Startup connects to PostgreSQL before listening.
- Logs are structured JSON with request IDs and redacted session and CSRF values.
- HTTP 409 means a record version or status changed. Reload before retrying.
- HTTP 403 on a write may indicate a role restriction, stale CSRF token, or incorrect origin.
- Authentication, estimate changes, status changes and exports create audit events.
- The included rate limiter is for one API process; use a shared store when running multiple instances.

On Windows, Git may report a sandbox-created folder as having different ownership. For this repository only, use `git -c safe.directory="<absolute path to this repository>" status` (or the desired Git command). No global Git trust setting is required.
