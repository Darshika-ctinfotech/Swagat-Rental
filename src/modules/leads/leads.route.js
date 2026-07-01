import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  createLead,
  deleteLead,
  getLead,
  listLeads,
  updateLead,
  updateLeadStatus,
} from "./leads.controller.js";
import {
  createLeadValidation,
  leadIdValidation,
  listLeadsValidation,
  updateLeadStatusValidation,
  updateLeadValidation,
} from "./leads.validation.js";

const router = Router();

router.post("/", createLeadValidation, handleValidationErrors, createLead);
router.get("/", authGuard, listLeadsValidation, handleValidationErrors, listLeads);
router.get("/:id", authGuard, leadIdValidation, handleValidationErrors, getLead);
router.put(
  "/:id",
  authGuard,
  leadIdValidation,
  updateLeadValidation,
  handleValidationErrors,
  updateLead
);
router.patch(
  "/:id/status",
  authGuard,
  leadIdValidation,
  updateLeadStatusValidation,
  handleValidationErrors,
  updateLeadStatus
);
router.delete(
  "/:id",
  authGuard,
  leadIdValidation,
  handleValidationErrors,
  deleteLead
);

export default router;
