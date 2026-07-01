import { Router } from "express";
import {
  assignDevice,
  createDevice,
  deleteDevice,
  storeSystemInfo,
  getDevice,
  listDevices,
  unassignDevice,
  updateDevice,
  updateDeviceStatus,
} from "./device.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  assignDeviceValidation,
  createDeviceValidation,
  systemInfoValidation,
  updateDeviceStatusValidation,
  updateDeviceValidation,
} from "./device.validation.js";

const router = Router();

router.post("/system-info", systemInfoValidation, handleValidationErrors, storeSystemInfo);
router.post("/", authGuard, createDeviceValidation, handleValidationErrors, createDevice);
router.get("/", authGuard, listDevices);
router.post("/:id/assign", authGuard, assignDeviceValidation, handleValidationErrors, assignDevice);
router.post("/:id/unassign", authGuard, unassignDevice);
router.patch("/:id/status", authGuard, updateDeviceStatusValidation, handleValidationErrors, updateDeviceStatus);
router.get("/:id", authGuard, getDevice);
router.put("/:id", authGuard, updateDeviceValidation, handleValidationErrors, updateDevice);
router.delete("/:id", authGuard, deleteDevice);

export default router;
