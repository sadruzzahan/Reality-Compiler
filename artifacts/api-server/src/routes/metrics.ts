import { Router, type Request, type Response } from "express";
import { register } from "../lib/metrics";

const router: Router = Router();

router.get("/", async (req: Request, res: Response) => {
  const expected = process.env["METRICS_TOKEN"];
  if (!expected) {
    res.status(404).type("text/plain").send("Not Found");
    return;
  }
  const auth = req.header("authorization");
  if (auth !== `Bearer ${expected}`) {
    res.status(401).type("text/plain").send("Unauthorized");
    return;
  }
  try {
    const body = await register.metrics();
    res.set("Content-Type", register.contentType).send(body);
  } catch {
    res.status(500).type("text/plain").send("metrics error");
  }
});

export default router;
