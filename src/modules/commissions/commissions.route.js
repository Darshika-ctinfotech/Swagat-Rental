import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  createCommission,
  deleteCommission,
  getCommission,
  getCommissionSummary,
  listCommissions,
  markCommissionPaid,
  updateCommission,
  updateCommissionStatus,
} from "./commissions.controller.js";
import {
  commissionIdValidation,
  createCommissionValidation,
  listCommissionsValidation,
  markCommissionPaidValidation,
  updateCommissionStatusValidation,
  updateCommissionValidation,
} from "./commissions.validation.js";

const router = Router();

router.post(
  "/",
  authGuard,
  createCommissionValidation,
  handleValidationErrors,
  createCommission
);
router.get(
  "/",
  authGuard,
  listCommissionsValidation,
  handleValidationErrors,
  listCommissions
);
router.get(
  "/summary",
  authGuard,
  listCommissionsValidation,
  handleValidationErrors,
  getCommissionSummary
);
router.get(
  "/:id",
  authGuard,
  commissionIdValidation,
  handleValidationErrors,
  getCommission
);
router.put(
  "/:id",
  authGuard,
  commissionIdValidation,
  updateCommissionValidation,
  handleValidationErrors,
  updateCommission
);
router.patch(
  "/:id/status",
  authGuard,
  commissionIdValidation,
  updateCommissionStatusValidation,
  handleValidationErrors,
  updateCommissionStatus
);
router.patch(
  "/:id/mark-paid",
  authGuard,
  commissionIdValidation,
  markCommissionPaidValidation,
  handleValidationErrors,
  markCommissionPaid
);
router.delete(
  "/:id",
  authGuard,
  commissionIdValidation,
  handleValidationErrors,
  deleteCommission
);

export default router;
