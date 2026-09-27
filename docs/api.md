# API reference

All endpoints are under `/api`. The frontend and API share an origin through Vite's development proxy or the production reverse proxy. Responses are JSON except exports and successful logout. Errors use `{ "message": "..." }`; validation errors also include Zod field issues.

## Authentication

1. `GET /auth/session` establishes an anonymous session if necessary and returns `{ user, csrfToken }`.
2. `POST /auth/login` accepts `{ email, password }`, rotates the session cookie and returns a new `{ user, csrfToken }`.
3. `POST /auth/logout` revokes the server-side session and returns 204.

Every POST, PUT and PATCH requires the exact configured `Origin` and an `X-CSRF-Token` matching the current session. Send cookies with requests. Do not store passwords or session tokens in local storage. Anonymous access is limited to session initialization, login and `/health`.

`POST /auth/change-password` requires a signed-in session, the existing CSRF and Origin checks, and is limited to five attempts per 15 minutes. Send `{ "currentPassword": "...", "newPassword": "..." }`; the new password must contain 16–128 characters and differ from the current password. Success returns 204, keeps the current session and revokes all other sessions. A wrong current password returns a generic 401 error. The password update, session revocation and `AUTH_PASSWORD_CHANGED` audit event occur in one transaction; no password or hash is included in the response or audit record.

## Estimates

New estimates require `clientId`, `projectId`, and `estimateDate` (calendar date, `YYYY-MM-DD`). The selected Project must belong to an active Client and be active itself. The API copies Client name/email and Project name/site address into estimate snapshot fields. Draft relationship changes refresh those snapshots. Existing unlinked estimates retain their saved snapshot text and remain readable and exportable.

## Clients, Projects and Dashboard

All routes require authentication. Administrators and estimators can create or edit Clients and Projects; viewers have read access. Client activity is administrator-only. Writes use the existing Origin and CSRF checks.

| Method     | Path                          | Behavior                                                        |
| ---------- | ----------------------------- | --------------------------------------------------------------- |
| GET        | `/dashboard`                  | Active counts, approved totals by currency, recent 10 estimates |
| GET / POST | `/clients`                    | Paginated search / create Client                                |
| GET / PUT  | `/clients/:id`                | Read / update Client                                            |
| PATCH      | `/clients/:id/status`         | `{ "active": false }` deactivates; `true` reactivates           |
| GET        | `/clients/:id/projects`       | Paginated Projects for this Client                              |
| POST       | `/clients/:clientId/projects` | Create Project under active Client                              |
| GET        | `/clients/:id/estimates`      | Paginated related Estimates                                     |
| GET        | `/clients/:id/activity`       | Safe activity summary; administrator only                       |
| GET / PUT  | `/projects/:id`               | Read / update Project without changing its owner                |
| PATCH      | `/projects/:id/status`        | `{ "status": "ARCHIVED" }` or `ACTIVE`                          |

Client, Project and activity list queries accept validated `search`, `page`, `pageSize` (1–100), `sort` (`name` or `createdAt`), `direction` (`asc` or `desc`), and optional `active` (`true` or `false`). Identifiers are trimmed and normalized to uppercase; email is trimmed and lowercased. Empty optional identifiers are stored as null and do not conflict. Client list/detail responses include counts and decimal-string estimate totals grouped by currency.

| Method | Path                         | Behavior                                                             |
| ------ | ---------------------------- | -------------------------------------------------------------------- |
| GET    | `/estimates?search=&page=1`  | List records, 20 per page; returns `{ data, total, page, pageSize }` |
| GET    | `/estimates/:id`             | Get an estimate with ordered items and server-calculated totals      |
| POST   | `/estimates`                 | Create a draft; administrator or estimator; returns 201              |
| PUT    | `/estimates/:id`             | Replace draft content using the expected `version`                   |
| PATCH  | `/estimates/:id/status`      | Change status using `{ status, version }`                            |
| GET    | `/estimates/:id/export/pdf`  | Download an A4 PDF                                                   |
| GET    | `/estimates/:id/export/xlsx` | Download a formula-enabled Excel workbook                            |
| GET    | `/audit`                     | Return the latest 100 audit events; administrator only               |

Create payload example:

```json
{
  "clientId": "11111111-1111-4111-8111-111111111111",
  "projectId": "22222222-2222-4222-8222-222222222222",
  "estimateDate": "2026-09-27",
  "currency": "LKR",
  "taxPercent": 0,
  "notes": "Validity: 30 days",
  "items": [
    { "description": "Concrete", "unit": "m³", "quantity": 2.5, "rate": 1000 }
  ]
}
```

An update uses the same fields plus `version`. Server-owned fields such as `id`, `number`, `status`, `totals`, item IDs and timestamps are not accepted in content writes. The server always calculates totals. Returned monetary totals are decimal strings; input quantities and rates are bounded numbers.

Status transitions: DRAFT → SENT, SENT → DRAFT / APPROVED / REJECTED, REJECTED → DRAFT. Approval/rejection requires an administrator. Approved estimates are immutable. Marking an estimate SENT does not send email.

## Response codes

- 400: invalid JSON, input or identifier.
- 401: no valid authenticated session.
- 403: role, Origin or CSRF check failed.
- 404: missing route or estimate.
- 409: stale version, non-draft content update or invalid status transition.
- 413: request body exceeds 128 KiB.
- 429: rate limit exceeded; observe response rate-limit headers.
- 500: unexpected error; details remain in server logs.
