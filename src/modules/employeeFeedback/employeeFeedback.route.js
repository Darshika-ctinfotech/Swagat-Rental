import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  createEmployeeFeedback,
  deleteEmployeeFeedback,
  getEmployeeFeedback,
  listEmployeeFeedback,
} from "./employeeFeedback.controller.js";
import {
  createEmployeeFeedbackValidation,
  listEmployeeFeedbackValidation,
} from "./employeeFeedback.validation.js";

const router = Router();

router.post(
  "/",
  createEmployeeFeedbackValidation,
  handleValidationErrors,
  createEmployeeFeedback
);

router.get(
  "/",
  authGuard,
  listEmployeeFeedbackValidation,
  handleValidationErrors,
  listEmployeeFeedback
);
router.get("/:id", authGuard, getEmployeeFeedback);
router.delete("/:id", authGuard, deleteEmployeeFeedback);

export default router;
