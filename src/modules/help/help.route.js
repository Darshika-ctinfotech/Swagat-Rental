import { Router } from "express";
import {
    createHelp,
    listHelp,
    getHelp,
    updateHelp,
    deleteHelp,
} from "./help.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
    createHelpValidation,
    updateHelpValidation,
    listHelpValidation,
} from "./help.validation.js";

const router = Router();

// Create help request (public or authenticated)
router.post("/", createHelpValidation, handleValidationErrors, createHelp);

// List all help requests (authenticated)
router.get("/", authGuard, listHelpValidation, handleValidationErrors, listHelp);

// Get specific help request (authenticated)
router.get("/:id", authGuard, getHelp);

// Update help request (authenticated)
router.patch("/:id", authGuard, updateHelpValidation, handleValidationErrors, updateHelp);

// Delete help request (authenticated)
router.delete("/:id", authGuard, deleteHelp);

export default router;
