import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import deployingRouter from "./workspace.js";
import projectsRouter from "./projects.js";
import streamRouter from "./stream.js";
import proxyRouter from "./proxy.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deployingRouter);
router.use(projectsRouter);
router.use(streamRouter);
router.use(proxyRouter);

export default router;
