import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import suppliersRouter from "./suppliers";
import quotesRouter from "./quotes";
import ordersRouter from "./orders";
import marketplaceRouter from "./marketplace";
import meRouter from "./me";
import storageRouter from "./storage";
import adminRouter from "./admin";
import contactRouter from "./contact";
import sitemapRouter from "./sitemap";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(suppliersRouter);
router.use(quotesRouter);
router.use(ordersRouter);
router.use(marketplaceRouter);
router.use(meRouter);
router.use(storageRouter);
router.use(adminRouter);
router.use(contactRouter);
router.use(sitemapRouter);

export default router;
