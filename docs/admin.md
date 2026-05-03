# Admin & Moderation

Reality Compiler ships with an in-app admin console at `/admin` for trust
& safety operations. This document covers how to grant admin access, what
tools the console exposes, and the safety guarantees behind every action.

## Granting admin access

Admin access is determined entirely by the **Clerk user's
`publicMetadata.role` field**. There is no separate admin table — every
API request decides admin status from the live Clerk session claims.

To promote a user to admin:

1. Open the [Clerk dashboard](https://dashboard.clerk.com/) for the
   project's instance.
2. Navigate to **Users → select the user → Metadata → Public**.
3. Edit the JSON and add (or merge) the `role` key:

   ```json
   {
     "role": "admin"
   }
   ```

4. Save. The user must sign out and sign back in (or wait for their
   session token to refresh — usually a minute) before the change takes
   effect.

To revoke admin access, remove the `role` field (or set it to anything
other than `"admin"`) and have the user re-authenticate.

> Public metadata is exposed in the Clerk session JWT. We never trust
> client-supplied values — the API validates the role from the signed
> session claims on every request via `requireAdmin` middleware.

## What admins can do

The admin shell lives at `/admin` (the link appears in the user menu
once `role: "admin"` is set). It contains five sections:

| Section       | Capabilities                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------- |
| **Dashboard** | At-a-glance counts: open reports, suspended users, listing/order status, last 24 h activity. |
| **Listings**  | Search and filter every marketplace listing (active / hidden / removed). Hide, restore, or remove (soft-delete) any listing. |
| **Orders**    | Search every order regardless of buyer/designer. Open detail view with full status history, attach internal notes, issue partial or full Stripe refunds. |
| **Users**     | Search Clerk users by email/name/handle. View per-user listings, orders, and audit log. Suspend or unsuspend accounts with a required reason. |
| **Reports**   | Triage user-submitted reports. Mark as investigating, resolved, or dismissed; record resolution notes. |

## Reports

Any signed-in user can submit a report from:

- **Listing detail page** — the "Report" button opens a modal that
  classifies the listing reason (spam, IP violation, unsafe design,
  prohibited content, harassment, other) and accepts free-text notes.
- **Designer profile page** — same modal, targeting the designer.

Reports are stored in the `reports` table with `status = open` and an
`admin.report.create` audit row. Admins triage them from
`/admin/reports`.

## Suspension semantics

Suspending a user writes `suspendedAt`, `suspendedBy`, and
`suspensionReason` to `user_profiles`. The auth middleware
(`requireAuth`) checks `suspendedAt` on every request; non-admin users
with a non-null `suspendedAt` receive an HTTP 403 with `code:
"FORBIDDEN"` and a human message.

Admins themselves are never blocked by this check, so a suspended
admin would still have access — admins should be demoted in Clerk
first, then suspended if needed.

You cannot suspend your own account.

## Listing moderation

Listings have three statuses:

| Status   | Visible publicly? | Soft-deleted? |
| -------- | ----------------- | ------------- |
| active   | Yes               | No            |
| hidden   | No                | No            |
| removed  | No                | Yes (`deleted_at` set, surfaces as a tombstone in past orders) |

Public marketplace queries filter on `status = 'active' AND deleted_at
IS NULL`. Hide is reversible at any time. Remove is reversible by
admins (status flips back to `active` and `deleted_at` is cleared) but
should be treated as a hard takedown for policy violations.

## Refunds

Refunds go through Stripe (`stripe.refunds.create`). The admin form
accepts an optional partial amount in dollars; leaving it blank refunds
the remaining unrefunded balance. A reason (free text) is captured in
the audit log.

Stripe webhook events asynchronously update `paymentStatus` and
`refundedAmount` on the order — the immediate response from
`POST /admin/orders/:id/refund` reflects the Stripe API result, but
the order's `paymentStatus` may still read `paid` until the webhook
fires (typically within seconds).

## Audit log

Every admin mutation records a row in `audit_log` via the
`recordAudit()` helper:

| Action                          | Target type           |
| ------------------------------- | --------------------- |
| `admin.listing.hide`            | `marketplace_listing` |
| `admin.listing.restore`         | `marketplace_listing` |
| `admin.listing.remove`          | `marketplace_listing` |
| `admin.order.note`              | `order`               |
| `admin.order.refund_initiated`  | `order`               |
| `admin.user.suspend`            | `user`                |
| `admin.user.unsuspend`          | `user`                |
| `admin.report.create`           | `report`              |
| `admin.report.update`           | `report`              |

Each row stores the actor's Clerk userId, before/after JSON snapshots,
the request id (for log correlation), and a UTC timestamp. Audit rows
are append-only and surfaced inline on the order- and user-detail
pages.

## Public probe

`GET /admin/me` is intentionally public-auth. It returns
`{ isAdmin: false }` for guests and non-admins so the SPA can decide
whether to render the admin link without producing alarming 403s in
the network panel. All other `/admin/*` endpoints require both a valid
Clerk session and `role === "admin"`.

## Legacy cron token

`POST /admin/purge-deleted` is the one exception — it is gated by an
`X-Admin-Token` header that must match the `ADMIN_API_TOKEN`
environment variable. It is invoked by the scheduled job that hard-
deletes accounts after their soft-delete grace period and is **not**
exposed to the admin UI.
