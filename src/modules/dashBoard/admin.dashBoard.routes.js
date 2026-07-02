import express from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { getDashboardAnalytics } from "./admin.dashBoard.controller.js";

const router = express.Router();

router.get("/dashboard", authGuard, getDashboardAnalytics);

export default router;