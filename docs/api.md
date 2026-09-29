# API reference

All endpoints are under `/api`. The frontend and API share an origin through Vite's development proxy or the production reverse proxy. Responses are JSON except exports and successful logout. Errors use `{ "message": "..." }`; validation errors also include Zod field issues.

## Authentication

1. `GET /auth/session` establishes an anonymous session if necessary and returns `{ user, csrfToken }`.
2. `POST /auth/login` accepts `{ email, password }`, rotates the session cookie and returns a new `{ user, csrfToken }`.
3. `POST /auth/logout` revokes the server-side session and returns 204.

Every POST, PUT and PATCH requires the exact configured `Origin` and an `X-CSRF-Token` matching the current session. Send cookies with requests. Do not store passwords or session tokens in local storage. Anonymous access is limited to session initialization, login and `/health`.

`POST /auth/change-password` requires a signed-in session, the existing CSRF and Origin checks, and is limited to five attempts per 15 minutes. Send `{ "currentPassword": "...", "newPassword": "..." }`; the new password must contain 16–128 characters and differ from the current password. Success returns 204, keeps the current session and revokes all other sessions. A wrong current password returns a generic 401 error. The password update, session revocation and `AUTH_PASSWORD_CHANGED` audit event occur in one transaction; no password or hash is included in the response or audit record.

## Estimates

Normal creation starts at `POST /projects/:projectId/estimates`, with `estimateDate` (calendar date, `YYYY-MM-DD`) and estimate fields in the body. The scoped endpoint derives the Client from the Project and rejects relationship IDs in the body. It verifies that the Project and Client are active. The API copies Client and Project names, contact/address details and Project code into estimate snapshot fields. The immutable Client Number is resolved from the linked Client for display and exports. Draft relationship changes through the compatibility update endpoint validate the new relationship and refresh active snapshots. Existing unlinked estimates retain their saved snapshot text and remain readable and exportable through global endpoints.

Estimate input accepts `markupPercent` from 0 to 100 with at most two decimal places; omission defaults to 0. It is applied to the rounded line-item subtotal before tax. Responses include `markupPercent` and totals for `baseSubtotal`, `markupAmount`, `subtotalAfterMarkup`, `tax`, and `total` (the final amount). Existing records use 0% markup.

The backend assigns immutable codes to newly created records: Client Number `ODN-CLI-0001`, Project code `ODN-PRJ-0001`, and Estimate number `ODN-EST-0001`. Existing identifiers are retained. Client `clientCode` is returned as the read-only Client Number. Caller-supplied codes and the retired registration/VAT fields fail Client write validation. Retired Client registration/VAT values and estimate snapshot values remain physically stored but are omitted from normal responses. Project completion dates are omitted from normal request and response bodies; the existing database column is retained temporarily.

## Clients, Projects and Dashboard

All routes require authentication. Administrators and estimators can create or edit Clients and Projects; viewers have read access. Client activity is administrator-only. Writes use the existing Origin and CSRF checks.

| Method     | Path                             | Behavior                                                        |
| ---------- | -------------------------------- | --------------------------------------------------------------- |
| GET        | `/dashboard`                     | Active counts, approved totals by currency, recent 10 estimates |
| GET / POST | `/clients`                       | Paginated search / create Client                                |
| GET / PUT  | `/clients/:id`                   | Read / update Client                                            |
| PATCH      | `/clients/:id/status`            | `{ "active": false }` deactivates; `true` reactivates           |
| GET        | `/clients/:id/projects`          | Paginated Projects for this Client                              |
| POST       | `/clients/:clientId/projects`    | Create Project under active Client                              |
| GET        | `/clients/:id/estimates`         | Paginated related Estimates                                     |
| GET        | `/clients/:id/activity`          | Safe activity summary; administrator only                       |
| GET / PUT  | `/projects/:id`                  | Read / update Project without changing its owner                |
| PATCH      | `/projects/:id/status`           | `{ "status": "ARCHIVED" }` or `ACTIVE`                          |
| GET / POST | `/projects/:projectId/estimates` | List Project estimates / create under that Project              |

Client, Project and activity list queries accept validated `search`, `page`, `pageSize` (1–100), `sort` (`name` or `createdAt`), `direction` (`asc` or `desc`), and optional `active` (`true` or `false`). Identifiers are trimmed and normalized to uppercase; email is trimmed and lowercased. Empty optional identifiers are stored as null and do not conflict. Client list/detail responses include counts and decimal-string estimate totals grouped by currency.

Project list responses include each Project's estimate count and latest updated estimate value, if any. `GET /projects/:projectId/estimates` also accepts an optional `status` filter (`DRAFT`, `SENT`, `APPROVED`, or `REJECTED`) alongside `search` and `page`.

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

Project-scoped create payload example for `POST /projects/:projectId/estimates`:

```json
{
  "estimateDate": "2026-09-27",
  "currency": "LKR",
  "taxPercent": 0,
  "notes": "Validity: 30 days",
  "items": [
    { "description": "Concrete", "unit": "m³", "quantity": 2.5, "rate": 1000 }
  ]
}
```

The legacy global `POST /estimates` remains for compatibility, but requires valid `clientId` and `projectId` in addition to these fields. A draft update through `PUT /estimates/:id` uses the global fields plus `version`; moving it to a different Project requires the matching Client ID and refreshes relationship snapshots. Server-owned fields such as `id`, `number`, `status`, `totals`, item IDs and timestamps are not accepted in content writes. The server always calculates totals. Returned monetary totals are decimal strings; input quantities and rates are bounded numbers.

New Estimate creation requires `description`: a trimmed, nonblank string of at most 150 characters, separate from the Project name. On Draft update, `description` is optional and changes only if explicitly included; the application edit form requires it before saving. Existing null descriptions remain readable and exportable with the display-only fallback `Estimate {number}`. Estimate responses and dashboard recent-estimate entries include nullable `description`. Client Estimate rows snapshot this value or the fallback when selected; explicit Draft refresh takes its latest value.

Status transitions: DRAFT → SENT, SENT → DRAFT / APPROVED / REJECTED, REJECTED → DRAFT. Approval/rejection requires an administrator. Approved estimates are immutable. Marking an estimate SENT does not send email.

## Client Estimates

Client Estimates are saved customer summaries separate from detailed Estimates. All routes require authentication. Administrators and Estimators may create and edit Drafts; Viewers may read and export. Status transitions and Administrator-only approval follow the existing Estimate rules. Mutations require Origin and CSRF verification. Export routes are rate limited.

| Method     | Path                                    | Behavior                                                     |
| ---------- | --------------------------------------- | ------------------------------------------------------------ |
| GET / POST | `/projects/:projectId/client-estimates` | Paginated Project list / create a Draft under that Project   |
| GET / PUT  | `/client-estimates/:id`                 | Read a saved snapshot / edit a Draft with expected `version` |
| PATCH      | `/client-estimates/:id/status`          | Change status with `{ "status": "SENT", "version": 1 }`      |
| GET        | `/client-estimates/:id/export/pdf`      | Download the branded A4 PDF                                  |
| GET        | `/client-estimates/:id/export/excel`    | Download the editable `.xlsx` workbook                       |

Create body: `{ "clientEstimateDate": "2026-09-28", "title": "Customer summary", "notes": "", "items": [{ "sourceEstimateId": "UUID" }] }`. Draft updates use the same fields plus `version`. An item may additionally set `refreshSnapshot: true` on a Draft update to replace that row's saved number, description, and final-total snapshots. The server owns the Client Estimate number, all snapshots, quantity 1, rate, amount, grand total, status, and relationships. It rejects extra fields, duplicates, missing selections, mixed currencies, and sources outside the exact Project and Client. Existing saved rows are otherwise frozen even when a source Estimate changes. The project list uses 20 records per page; `GET` accepts `page`.

## Construction Estimate PDF template settings

Only Administrators can read or update the template settings. `GET /settings/pdf-template` returns the current settings, including a `logoDataUrl` when a custom logo is saved. `PUT /settings/pdf-template` accepts the full settings object and records a `PDF_TEMPLATE_UPDATED` audit event. Text, colors, enumerated options, watermark opacity, and optional PNG/JPEG logo data are validated. Send `logoDataUrl: null` to use the built-in Odan logo. The request limit for these settings endpoints is 2 MiB; logo images are limited to 1 MiB.

`POST /settings/pdf-template/preview?length=short|long` accepts the same settings object and returns an inline A4 PDF sample without saving the settings. Preview requests are rate limited. Normal Construction Estimate PDF exports use the latest saved template; Client Estimate PDFs and Excel exports are unchanged. All writes and previews retain the existing Origin and CSRF checks.

## Response codes

- 400: invalid JSON, input or identifier.
- 401: no valid authenticated session.
- 403: role, Origin or CSRF check failed.
- 404: missing route or estimate.
- 409: stale version, non-draft content update or invalid status transition.
- 413: request body exceeds 128 KiB (2 MiB for PDF template settings).
- 429: rate limit exceeded; observe response rate-limit headers.
- 500: unexpected error; details remain in server logs.
