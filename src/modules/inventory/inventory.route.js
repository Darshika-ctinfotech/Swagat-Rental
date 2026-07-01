import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import {
  createAssetCategory,
  createInventory,
  deleteAssetCategory,
  getInventoryDetail,
  getSystemInventoryDetails,
  listAssetCategories,
  listSystemInventories,
  listInventories,
  systemInventory,
  // listInventoryTypes,
  updateAssetCategory,
  updateInventory,
} from "./inventory.controller.js";
import {
  assetCategoryUpdateStatusValidation,
  assetCategoryUpdateValidation,
  assetCategoryValidation,
  createInventoryValidation,
  listSystemInventoriesValidation,
  systemInventoryDetailsValidation,
  systemInventoryValidation,
  updateInventoryValidation,
} from "./inventory.validation.js";

const router = Router();

router.get("/types", authGuard, listAssetCategories);
router.get("/asset-categories", authGuard, listAssetCategories);
router.post(
  "/asset-categories",
  authGuard,
  assetCategoryValidation,
  handleValidationErrors,
  createAssetCategory
);
router.put(
  "/asset-categories/:id",
  authGuard,
  assetCategoryUpdateValidation,
  handleValidationErrors,
  updateAssetCategory
);
router.put(
  "/asset-categories/status/:id",
  authGuard,
  assetCategoryUpdateStatusValidation,
  handleValidationErrors,
  updateAssetCategory
);
router.delete(
  "/asset-categories/:id",
  authGuard,
  deleteAssetCategory
);

router.get("/inventory", authGuard, listInventories);
router.post("/inventory", authGuard, createInventoryValidation, handleValidationErrors, createInventory);
router.get("/inventory/:id", authGuard, getInventoryDetail);
router.put("/inventory/:id", authGuard, updateInventoryValidation, handleValidationErrors, updateInventory);

router.get(
  "/system-inventory-list",
  authGuard,
  listSystemInventoriesValidation,
  handleValidationErrors,
  listSystemInventories
);
router.get(
  "/system-inventory/:system_id",
  authGuard,
  systemInventoryDetailsValidation,
  handleValidationErrors,
  getSystemInventoryDetails
);
router.post("/system-inventory", authGuard, systemInventoryValidation, handleValidationErrors, systemInventory);
export default router;
