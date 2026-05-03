import { Router, type IRouter } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { ApiError } from "../lib/errors";
import { purgeDeletedAccounts } from "../lib/accountDeletion";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Admin endpoint that hard-deletes user data soft-deleted >30 days ago.
 * Authenticated via `x-admin-token` header matching `ADMIN_API_TOKEN`.
 *
 * Schedule it via your platform's cron (e.g. Replit Scheduled Deployment)
 * with a request like:
 *   curl -X POST -H "x-admin-token: $ADMIN_API_TOKEN" \
 *     https://<host>/api/admin/purge-deleted
 */
router.post(
  "/admin/purge-deleted",
  asyncHandler(async (req, res) => {
    const expected = process.env["ADMIN_API_TOKEN"];
    if (!expected) {
      throw new ApiError(
        "INTERNAL",
        "ADMIN_API_TOKEN is not configured on the server.",
      );
    }
    const provided = String(req.headers["x-admin-token"] ?? "");
    if (provided !== expected) {
      throw new ApiError("UNAUTHENTICATED", "Invalid admin token");
    }

    const summary = await purgeDeletedAccounts();
    logger.info({ summary }, "admin purge completed");
    res.json(summary);
  }),
);

export default router;
