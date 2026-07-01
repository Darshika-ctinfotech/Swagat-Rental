import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  createClientFeedback,
  deleteClientFeedback,
  getClientFeedback,
  listClientFeedback,
} from "./clientFeedback.controller.js";
import {
  createClientFeedbackValidation,
  listClientFeedbackValidation,
} from "./clientFeedback.validation.js";

const router = Router();

router.post(
  "/",
  createClientFeedbackValidation,
  handleValidationErrors,
  createClientFeedback
);

router.get(
  "/",
  authGuard,
  listClientFeedbackValidation,
  handleValidationErrors,
  listClientFeedback
);
router.get("/:id", authGuard, getClientFeedback);
router.delete("/:id", authGuard, deleteClientFeedback);

export default router;
