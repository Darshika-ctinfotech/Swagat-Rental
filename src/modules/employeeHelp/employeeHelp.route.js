import { Router } from "express";
import {
    createEmployeeHelp,
    listEmployeeHelp,
    getEmployeeHelp,
    updateEmployeeHelp,
    deleteEmployeeHelp,
} from "./employeeHelp.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
    createEmployeeHelpValidation,
    updateEmployeeHelpValidation,
    listEmployeeHelpValidation,
} from "./employeeHelp.validation.js";

const router = Router();

// Create employee help request (authenticated)
router.post("/", authGuard, createEmployeeHelpValidation, handleValidationErrors, createEmployeeHelp);

// List all employee help requests (authenticated)
router.get("/", authGuard, listEmployeeHelpValidation, handleValidationErrors, listEmployeeHelp);

// Get specific employee help request (authenticated)
router.get("/:id", authGuard, getEmployeeHelp);

// Update employee help request (authenticated)
router.patch("/:id", authGuard, updateEmployeeHelpValidation, handleValidationErrors, updateEmployeeHelp);

// Delete employee help request (authenticated)
router.delete("/:id", authGuard, deleteEmployeeHelp);

export default router;
