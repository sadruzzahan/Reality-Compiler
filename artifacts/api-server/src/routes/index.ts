import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import suppliersRouter from "./suppliers";
import quotesRouter from "./quotes";
import ordersRouter from "./orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(suppliersRouter);
router.use(quotesRouter);
router.use(ordersRouter);

export default router;
