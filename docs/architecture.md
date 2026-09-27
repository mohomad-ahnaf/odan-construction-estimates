# Architecture

This repository is independent. It reads only its own configuration, uses uniquely named cookies and database credentials, and binds to dedicated loopback ports. No existing application is used as a template or dependency.

The React application uses React Router for navigation, TanStack Query for server state, and React Hook Form with Zod for form validation. Components, pages, API helpers and types are separate. The API is the authority for all prices, permissions and status transitions.

The Express request path is routes → controllers → services → repositories → Prisma → PostgreSQL. Middleware handles request IDs, structured logs, security headers, rate limits, sessions, CSRF and errors. Repositories commit estimate changes and their audit events in the same transaction.

## Domain decisions

- This is a single-company workspace. Authenticated users can view all estimates. Administrators and estimators can create and edit drafts; only administrators can approve or reject sent estimates. Viewers can read and export.
- Draft → Sent; Sent → Draft / Approved / Rejected; Rejected → Draft. Approved estimates are immutable. “Mark as sent” records status; it does not send email.
- Updates require an expected version. A stale update returns HTTP 409. Content changes are permitted only while the stored status is DRAFT.
- Quantities have up to three decimals, rates two decimals. Decimal arithmetic rounds each line half-up to two decimals, sums rounded lines, then rounds tax once. The workbook uses the same formulas and includes cached totals.
- Currencies are LKR, USD, GBP and EUR; amounts are never aggregated across currencies. Seed prices are illustrative, not market rates.
- Lists are paginated (20 records). The audit screen shows the latest 100 events. Estimate line items are limited to 100.

## Security

Passwords use Argon2id (64 MiB, 3 passes, parallelism 1). Opaque session cookies contain 256-bit random tokens; only token hashes are stored in PostgreSQL. Sessions rotate on sign-in and are deleted on logout. Authenticated sessions expire after eight hours; anonymous CSRF sessions after 30 minutes. Expired rows are cleaned periodically.

Unsafe requests require both an exact configured Origin and a session-bound CSRF token, including login. Cookies are HTTP-only, SameSite=Strict, scoped to /api, and Secure in production. Responses carry Helmet headers and private API responses are not cached. Logs redact credentials, cookies and CSRF tokens.

PDF text is HTML-escaped, scripts and network requests are blocked during rendering, and Chromium sandboxing remains enabled. Excel user strings are strings, never formulas. Export requests are rate limited. Audit events record actor IDs, entity IDs and actions without storing secrets.

Before a public deployment use HTTPS, an unprivileged database runtime role, restricted database networking, encrypted backups, monitoring, and a secret manager or protected local configuration. The included in-memory rate limiter is for a single API process; use a shared limiter store before horizontal scaling. Deployment behind a proxy requires a deliberately configured trusted proxy, not a blanket trust setting.

## Sources

- [Express production security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Prisma migration CLI](https://docs.prisma.io/docs/cli/migrate) — this repository pins Prisma 6.19 and uses its `migrate deploy` workflow.
- [Puppeteer PDF options](https://pptr.dev/api/puppeteer.pdfoptions)
