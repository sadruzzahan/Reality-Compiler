import { Router, type IRouter } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { streamObject } from "../lib/objectStorage";
import { notFound } from "../lib/errors";

const router: IRouter = Router();

router.get(
  "/storage/objects/{*key}",
  asyncHandler(async (req, res) => {
    const raw = req.params.key;
    const key = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
    if (!key || key.includes("..")) throw notFound("Object");
    await streamObject(key, res);
  }),
);

export default router;
