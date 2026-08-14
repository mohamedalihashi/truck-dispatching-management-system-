# TruckDispatch API

Live Express + Prisma + PostgreSQL API. Base URL (local): `http://127.0.0.1:4000/api`

## Roles

| Role | Purpose |
|------|---------|
| `admin` | Users, fleet, payments, earnings, reports, audits, settings |
| `dispatcher` | Quote cargo, assign drivers/trucks, monitor trips |
| `customer` | Book cargo, review quotes, follow status, pay, confirm delivery |
| `driver` | Accept jobs, status updates, POD upload |

> One driver account = one truck.

## Health

```bash
curl http://127.0.0.1:4000/api/health
```

Returns `status` (`ok` | `degraded` | `error`), `integrations` (cloudinary, waafiPay, sms, email), and `missing` keys when not configured.

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | Multipart when driver docs/truck images |
| POST | `/auth/register/verify` | Email OTP (if enabled) |
| POST | `/auth/login` | |
| POST | `/auth/login/verify` | |
| POST | `/auth/resend-code` | |
| POST | `/auth/forgot-password` | |
| POST | `/auth/reset-password` | |
| POST | `/auth/change-password` | Auth required |
| GET | `/auth/me` | Auth required |
| PATCH | `/auth/me` | Auth required |
| POST | `/auth/me/avatar` | Auth required |
| GET | `/auth/permissions` | Auth required |
| POST | `/auth/logout` | Auth required |

## Cargo requests

| Method | Path |
|--------|------|
| GET | `/cargo-requests` |
| GET | `/cargo-requests/summary` |
| POST | `/cargo-requests` |
| PATCH | `/cargo-requests/:id` |
| PATCH | `/cargo-requests/:id/quote` |
| POST | `/cargo-requests/:id/accept-quote` |
| POST | `/cargo-requests/:id/reject-quote` |
| PATCH | `/cargo-requests/:id/assign` |
| DELETE | `/cargo-requests/:id` |

## Trips

| Method | Path |
|--------|------|
| GET | `/trips` |
| GET | `/trips/summary` |
| GET | `/trips/feedback` |
| PATCH | `/trips/:id/status` |
| POST | `/trips/:id/accept` |
| POST | `/trips/:id/reject` |
| POST | `/trips/:id/proof` |
| POST | `/trips/:id/feedback` |
| POST | `/trips/:id/confirm-delivery` |

## Trucks, users, payments

| Method | Path |
|--------|------|
| GET/POST/PATCH/DELETE | `/trucks`, `/trucks/:id` |
| GET | `/trucks/types` |
| GET/POST/PATCH/DELETE | `/users`, `/users/:id` |
| POST | `/users/:id/verify-driver` |
| GET | `/payments/waafi/config` |
| POST | `/payments/waafi/purchase` |
| PATCH | `/payments/:id` |
| GET | `/earnings`, `/earnings/me`, `/earnings/summary` |
| POST | `/earnings/:id/payout` |

## Admin & reports

| Method | Path |
|--------|------|
| GET | `/admin/payments`, `/admin/settings`, `/admin/audit-logs` |
| GET | `/admin/sms-notifications` |
| POST | `/admin/sms-notifications/:id/resend` |
| GET | `/reports/dashboard`, `/reports/revenue`, `/reports/performance` |
| GET | `/reports/shipments`, `/reports/summary` |

## Public feedback

| Method | Path |
|--------|------|
| GET/POST | `/public/feedback/:token` |

## Realtime (Socket.io)

Available when the API runs as a long-lived Node server (not Vercel serverless).

- `system.ready`
- `join` (client → room)

On Vercel, Socket becomes a no-op; clients should poll via React Query.

## Auth header

```
Authorization: Bearer <jwt>
```
