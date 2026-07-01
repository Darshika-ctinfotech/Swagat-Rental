import { Router } from "express";

import authRoutes from "../modules/auth/auth.route.js";
import employeeAuthRoutes from "../modules/employeeAuth/employeeAuth.route.js";
import userRoutes from "../modules/user/user.route.js";
import adminRoutes from "../modules/admin/admin.route.js";
import employeeRoutes from "../modules/employee/employee.route.js";
import systemRoutes from "../modules/system/system.route.js";
import inventoryRoutes from "../modules/inventory/inventory.route.js";
import helpRoutes from "../modules/help/help.route.js";
import employeeHelpRoutes from "../modules/employeeHelp/employeeHelp.route.js";
import clientFeedbackRoutes from "../modules/clientFeedback/clientFeedback.route.js";
import employeeFeedbackRoutes from "../modules/employeeFeedback/employeeFeedback.route.js";
import leadsRoutes from "../modules/leads/leads.route.js";
import commissionRoutes from "../modules/commissions/commissions.route.js";
import systemCostQuoteRoutes from "../modules/systemCostQuote/systemCostQuote.route.js";
import birthdayRoutes from "../modules/birthday/birthday.route.js"
// import chatRoutes from "../modules/chat/chat.route.js";

const router = Router();
    
router.use("/auth", authRoutes);
router.use("/employee-auth", employeeAuthRoutes);
router.use("/clients", userRoutes);
router.use("/admin", adminRoutes);
router.use("/employees", employeeRoutes);
router.use("/assets", inventoryRoutes);
router.use("/help", helpRoutes);
router.use("/employee-help", employeeHelpRoutes);
router.use("/client-feedback", clientFeedbackRoutes);
router.use("/employee-feedback", employeeFeedbackRoutes);
router.use("/leads", leadsRoutes);
router.use("/commissions", commissionRoutes);
router.use("/system-cost-quotes", systemCostQuoteRoutes);
router.use("/", systemRoutes);
router.use('/birthday', birthdayRoutes)
// router.use("/chat", chatRoutes);



export default router;
