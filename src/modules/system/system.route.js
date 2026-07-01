import { Router } from "express";
import {
  addPcInfo,
  employeeSystemAssignmentAuth,
  addSystemSnapshot,
  assignBulkSystem,
  assignSystem,
  blockSystem,
  createSystem,
  deleteSystem,
  getSystem,
  getSystemStatusByUid,
  getSystemInfo,
  listSystems,
  systemHeartbeat,
  unassignSystem,
  updateSystem,
  updateSystemApprovalStatus,
  updateSystemStatus,
} from "./system.controller.js";
import {
  addPcInfoValidation,
  addSystemSnapshotValidation,
  assignBulkSystemValidation,
  assignSystemValidation,
  createSystemValidation,
  employeeSystemAssignmentAuthValidation,
  systemHeartbeatValidation,
  updateSystemApprovalStatusValidation,
  updateSystemStatusValidation,
  updateSystemValidation,
} from "./system.validation.js";
// import { handleValidationErrors } from "../../middlewares/validator.middleware.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";

const router = Router();

router.get("/system-info", getSystemInfo);
router.post(
  "/systems/heartbeat",
  systemHeartbeatValidation,
  handleValidationErrors,
  systemHeartbeat
);
router.post(
  "/employee-authenticate",
  employeeSystemAssignmentAuthValidation,
  handleValidationErrors,
  employeeSystemAssignmentAuth
);
router.post(
  "/user/registerSystem",
  authGuard,
  addPcInfoValidation,
  handleValidationErrors,
  addPcInfo
);
router.post("/user/systemSnapshot", addSystemSnapshotValidation, handleValidationErrors, addSystemSnapshot);
router.post("/systems", authGuard, createSystemValidation, handleValidationErrors, createSystem);
router.get("/systems", authGuard, listSystems);
router.post("/systems/:id/assign", authGuard, assignSystemValidation, handleValidationErrors, assignSystem);
router.post("/systems/:id/unassign", authGuard, unassignSystem);
router.patch("/systems/:id/status", authGuard, updateSystemStatusValidation, handleValidationErrors, updateSystemStatus);

router.patch("/ststems/:id/change-approval", authGuard, updateSystemApprovalStatusValidation, handleValidationErrors, updateSystemApprovalStatus);

router.get("/systems/:id", authGuard, getSystem);
router.put("/systems/:id", authGuard, updateSystemValidation, handleValidationErrors, updateSystem);
router.delete("/systems/:id", authGuard, deleteSystem);

router.patch("/systems/:id/block", authGuard, blockSystem);

router.post("/systems/bulk-assign", authGuard, assignBulkSystemValidation, handleValidationErrors, assignBulkSystem);

export default router;
