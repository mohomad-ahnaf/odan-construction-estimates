# API reference

All endpoints are under `/api`. The frontend and API share an origin through Vite's development proxy or the production reverse proxy. Responses are JSON except exports and successful logout. Errors use `{ "message": "..." }`; validation errors also include Zod field issues.

## Authentication

1. `GET /auth/session` establishes an anonymous session if necessary and returns `{ user, csrfToken }`.
2. `POST /auth/login` accepts `{ email, password }`, rotates the session cookie and returns a new `{ user, csrfToken }`.
3. `POST /auth/logout` revokes the server-side session and returns 204.

Every POST, PUT and PATCH requires the exact configured `Origin` and an `X-CSRF-Token` matching the current session. Send cookies with requests. Do not store passwords or session tokens in local storage. Anonymous access is limited to session initialization, login and `/health`.

## Estimates

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
  "title": "Residence foundation",
  "clientName": "Example client",
  "clientEmail": "client@example.com",
  "siteAddress": "Example site",
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
