import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  createSystemCostQuote,
  deleteSystemCostQuote,
  getSystemCostQuote,
  getSystemCostQuoteSummary,
  listSystemCostQuotes,
  updateSystemCostQuote,
} from "./systemCostQuote.controller.js";
import {
  createSystemCostQuoteValidation,
  listSystemCostQuotesValidation,
  systemCostQuoteIdValidation,
  updateSystemCostQuoteValidation,
} from "./systemCostQuote.validation.js";

const router = Router();

router.post(
  "/",
  authGuard,
  createSystemCostQuoteValidation,
  handleValidationErrors,
  createSystemCostQuote
);
router.get(
  "/",
  authGuard,
  listSystemCostQuotesValidation,
  handleValidationErrors,
  listSystemCostQuotes
);
router.get(
  "/summary",
  authGuard,
  listSystemCostQuotesValidation,
  handleValidationErrors,
  getSystemCostQuoteSummary
);
router.get(
  "/:id",
  authGuard,
  systemCostQuoteIdValidation,
  handleValidationErrors,
  getSystemCostQuote
);
router.put(
  "/:id",
  authGuard,
  systemCostQuoteIdValidation,
  updateSystemCostQuoteValidation,
  handleValidationErrors,
  updateSystemCostQuote
);
router.delete(
  "/:id",
  authGuard,
  systemCostQuoteIdValidation,
  handleValidationErrors,
  deleteSystemCostQuote
);

export default router;
