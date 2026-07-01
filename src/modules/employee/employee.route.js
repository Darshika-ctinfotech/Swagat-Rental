import { Router } from "express";
import {
  createEmployee,
  deleteEmployee,
  getMyDevices,
  getMyDevicesByClientId,
  getMyProfile,
  getEmployee,
  getEmployeeDevices,
  listEmployees,
  updateMyProfile,
  updateEmployee,
  blockEmployee,
  listServiceRequests,
  getServiceRequestById,
  markServiceRequestAsCompleted,
  changePassword,
  recordVisit,
  getAllClients,
} from "./employee.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { fieldsAWS } from "../../utils/aws.util.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  blockEmployeeValidation,
  createEmployeeValidation,
  recordVisitValidation,
  updateMyProfileValidation,
  updateEmployeeValidation,
} from "./employee.validation.js";
import { getSystem } from "../system/system.controller.js";
import { changePasswordValidation } from "../admin/admin.validation.js";

const router = Router();

router.post("/", authGuard, createEmployeeValidation, handleValidationErrors, createEmployee);
router.get("/me", authGuard, getMyProfile);
router.post(
  "/change-password",
  authGuard,
  changePasswordValidation,
  handleValidationErrors,
  changePassword
);
router.get("/me/devices", authGuard, getMyDevices);
router.get("/client-wise/devices/:clientId", authGuard, getMyDevicesByClientId);
router.get("/service-requests", authGuard, listServiceRequests);
router.get("/service-requests/:id", authGuard, getServiceRequestById);
router.put(
  "/profile",
  authGuard,
  fieldsAWS("employee-documents", [
    { name: "profile_image", maxCount: 1 },
    { name: "aadhar_card", maxCount: 10 },
    { name: "other_documents", maxCount: 10 },
    { name: "police_verifications", maxCount: 10 },
    { name: "selfie", maxCount: 1 },
  ]),
  updateMyProfileValidation,
  handleValidationErrors,
  updateMyProfile
);
router.get("/clients", authGuard, getAllClients);
router.get("/", authGuard, listEmployees);
router.get("/:id", authGuard, getEmployee);
router.get("/:id/devices", authGuard, getEmployeeDevices);
router.put("/:id", authGuard, updateEmployeeValidation, handleValidationErrors, updateEmployee);
router.patch("/:id/block", authGuard, blockEmployeeValidation, handleValidationErrors, blockEmployee);
router.delete("/:id", authGuard, deleteEmployee);

router.get("/systems/:id", authGuard, getSystem);
router.post("/service-requests/:id/mark-completed", authGuard, fieldsAWS("service-requests", [{ name: "resolved_video_proof", maxCount: 1 }]), markServiceRequestAsCompleted);

router.post(
  "/record-visit",
  authGuard,
  fieldsAWS("employee-visits", [{ name: "video_proof", maxCount: 1 }]),
  recordVisitValidation,
  handleValidationErrors,
  recordVisit
);
export default router;
