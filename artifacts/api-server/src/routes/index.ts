import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import deployingRouter from "./workspace.js";
import projectsRouter from "./projects.js";
import streamRouter from "./stream.js";
import proxyRouter from "./proxy.js";
import runtimeRouter from "./runtime.js";
import authRouter from "./auth.js";
import nodesRouter from "./nodes.js";
import ideRouter from "./ide.js";

const router: IRouter = Router();

router.use(authRouter);
router.use(runtimeRouter);
router.use(nodesRouter);
router.use(ideRouter);
router.use(healthRouter);
router.use(deployingRouter);
router.use(projectsRouter);
router.use(streamRouter);
router.use(proxyRouter);

export default router;
