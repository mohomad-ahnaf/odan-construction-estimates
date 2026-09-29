# Architecture

This repository is independent. It reads only its own configuration, uses uniquely named cookies and database credentials, and binds to dedicated loopback ports. No existing application is used as a template or dependency.

The React application uses React Router for navigation, TanStack Query for server state, and React Hook Form with Zod for form validation. Components, pages, API helpers and types are separate. The API is the authority for all prices, permissions and status transitions.

The Express request path is routes → controllers → services → repositories → Prisma → PostgreSQL. Middleware handles request IDs, structured logs, security headers, rate limits, sessions, CSRF and errors. Repositories commit estimate, Client and Project changes and their audit events in the same transaction.

## Domain decisions

- This is a single-company workspace. Authenticated users can view all estimates. Administrators and estimators can create and edit drafts; only administrators can approve or reject sent estimates. Viewers can read and export.
- Draft → Sent; Sent → Draft / Approved / Rejected; Rejected → Draft. Approved estimates are immutable. “Mark as sent” records status; it does not send email.
- Updates require an expected version. A stale update returns HTTP 409. Content changes are permitted only while the stored status is DRAFT.
- Quantities have up to three decimals, rates two decimals. Decimal arithmetic rounds each line half-up to two decimals, sums rounded lines, then rounds tax once. The workbook uses the same formulas and includes cached totals.
- Currencies are LKR, USD, GBP and EUR; amounts are never aggregated across currencies. Seed prices are illustrative, not market rates.
- Lists are paginated (20 records). The audit screen shows the latest 100 events. Estimate line items are limited to 100.
- Clients contain Projects; Projects contain Estimates. New estimates start from an active Project. The form displays its active Client and Project as read-only context and requires an estimate date. The API validates the relationship and copies Client and Project names, contact/address details and Project code into estimate snapshots on creation and on a Draft relationship change. The immutable Client Number is resolved from the linked Client. Historical unlinked estimates retain their snapshot text and remain viewable/exportable in the global register; the application does not link them automatically. Dashboard totals are calculated in the API with decimal arithmetic and grouped by currency.
- A detailed Estimate has a separate nullable description. New creates require a trimmed, nonblank description of at most 150 characters; older null values remain unchanged. Client Estimate row descriptions snapshot the source description, or a display-only `Estimate {number}` fallback, and change only through explicit Draft refresh. The Project name remains separate.
- New Client Numbers, Project codes and Estimate numbers are allocated with separate PostgreSQL sequences inside creation transactions. Existing codes are retained. API write schemas reject caller-supplied codes, and update repositories never change them. Retired registration/VAT database columns and estimate snapshots remain intact but are no longer used by normal workflows.
- Project completion dates are no longer used in normal API or UI flows. The physical nullable column remains so existing values are preserved until a separately reviewed removal migration.

Client Estimates sit beside detailed Estimates within a Project. They use their own PostgreSQL sequence and additive `ClientEstimate` / `ClientEstimateItem` tables. Each saved row holds the selected source Estimate's number, title, currency and complete final total (including its markup and tax); quantity stays 1. The Client and Project names/codes are also copied at creation. Draft edits preserve existing row snapshots unless a user explicitly refreshes one. Create, update and status changes write an audit event in the same database transaction. Exports log separate safe audit events and use the shared PDF browser manager or ExcelJS.

## Security

Passwords use Argon2id (64 MiB, 3 passes, parallelism 1). Opaque session cookies contain 256-bit random tokens; only token hashes are stored in PostgreSQL. Sessions rotate on sign-in and are deleted on logout. Authenticated sessions expire after eight hours; anonymous CSRF sessions after 30 minutes. Expired rows are cleaned periodically.

Unsafe requests require both an exact configured Origin and a session-bound CSRF token, including login. Cookies are HTTP-only, SameSite=Strict, scoped to /api, and Secure in production. Responses carry Helmet headers and private API responses are not cached. Logs redact credentials, cookies and CSRF tokens.

PDF text is HTML-escaped, scripts and network requests are blocked during rendering, and Chromium sandboxing remains enabled. Excel user strings are strings, never formulas. Export requests are rate limited. Audit events record actor IDs, entity IDs and actions without storing secrets.

Before a public deployment use HTTPS, an unprivileged database runtime role, restricted database networking, encrypted backups, monitoring, and a secret manager or protected local configuration. The included in-memory rate limiter is for a single API process; use a shared limiter store before horizontal scaling. Deployment behind a proxy requires a deliberately configured trusted proxy, not a blanket trust setting.

## Sources

- [Express production security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Prisma migration CLI](https://docs.prisma.io/docs/cli/migrate) — this repository pins Prisma 6.19 and uses its `migrate deploy` workflow.
- [Puppeteer PDF options](https://pptr.dev/api/puppeteer.pdfoptions)
