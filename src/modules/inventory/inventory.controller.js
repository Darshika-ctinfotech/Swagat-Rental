import { apiHandler, apiResponse, ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import ROLES from "../../constants/roles.js";
import Msg from "../../utils/messages.util.js";
import * as InventoryService from "./inventory.service.js";

const assertAdminOrSubAdmin = (req) => {
  const role = req.user?.role;
  const hasIdentity =
    req.user?.admin_id !== undefined || req.user?.employee_id !== undefined;

  if (
    !hasIdentity ||
    (role !== ROLES.ADMIN &&
      role !== ROLES.SUPER_ADMIN &&
      role !== ROLES.SUB_ADMIN)
  ) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }
};

export const listAssetCategories = apiHandler(async (req, res) => {
  const { search, is_active, page, limit } = req.query;
  const result = await InventoryService.listAssetCategories({
    search: search || undefined,
    is_active:
      is_active === undefined ? undefined : String(is_active) === "true",
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Asset categories fetched successfully."],
    "AssetCategories",
    result,
    res,
    "object"
  );
});

export const createAssetCategory = apiHandler(async (req, res) => {
  const category = await InventoryService.createAssetCategory(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, "Asset category created successfully."],
    "AssetCategory",
    category,
    res,
    "object"
  );
});

export const updateAssetCategory = apiHandler(async (req, res) => {
  const categoryId = Number(req.params.id);
  const category = await InventoryService.updateAssetCategory(categoryId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, "Asset category updated successfully."],
    "AssetCategory",
    category,
    res,
    "object"
  );
});

export const deleteAssetCategory = apiHandler(async (req, res) => {
  const categoryId = Number(req.params.id);
  const result = await InventoryService.deleteAssetCategory(categoryId);

  return apiResponse(
    [STATUS_CODES.OK, "Asset category deleted successfully."],
    "AssetCategory",
    result,
    res,
    "object"
  );
});

export const listInventories = apiHandler(async (req, res) => {
  const { asset_category_id, status, page, limit, search, q } = req.query;
  const freeSearch =
    typeof (search ?? q) === "string" ? (search ?? q).trim() : undefined;

  const isPaginationRequested =
    Object.prototype.hasOwnProperty.call(req.query, "page") ||
    Object.prototype.hasOwnProperty.call(req.query, "limit");

  const result = await InventoryService.listInventories({
    asset_category_id: asset_category_id ? Number(asset_category_id) : undefined,
    status: status || undefined,
    search: freeSearch || undefined,
    page: isPaginationRequested ? Number(page) || 1 : undefined,
    limit: isPaginationRequested ? Number(limit) || 20 : undefined,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.inventoriesFetched],
    "Inventories",
    result,
    res,
    "object"
  );
});

export const getInventoryDetail = apiHandler(async (req, res) => {
  const inventoryId = Number(req.params.id);

  const inventory = await InventoryService.getInventoryById(inventoryId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.inventoryFetched],
    "Inventory",
    inventory,
    res,
    "object"
  );
});

export const createInventory = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const inventory = await InventoryService.createInventory(req.body, req.user);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.inventoryCreated],
    "Inventory",
    inventory,
    res,
    "object"
  );
});

export const updateInventory = apiHandler(async (req, res) => {
  const inventoryId = Number(req.params.id);

  const inventory = await InventoryService.updateInventory(inventoryId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.inventoryUpdated],
    "Inventory",
    inventory,
    res,
    "object"
  );
});

export const systemInventory = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await InventoryService.createSystemInventory(req.body, req.user);

  return res.status(STATUS_CODES.CREATED).json({
    success: true,
    message: Msg.systemInfoStored || "System info stored successfully.",
    code: STATUS_CODES.CREATED,
    ...result,
  });
});

export const listSystemInventories = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await InventoryService.listSystemInventories(req.query, req.user);

  return apiResponse(
    [STATUS_CODES.OK, "Office inventories fetched successfully"],
    "SystemInventories",
    result,
    res,
    "object"
  );
});

export const getSystemInventoryDetails = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const systemId = Number(req.params.system_id);
  if (!Number.isInteger(systemId) || systemId <= 0) {
    throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid system_id"]);
  }

  const result = await InventoryService.getSystemInventoryDetails(systemId, req.user);

  return apiResponse(
    [STATUS_CODES.OK, "Office inventory details fetched"],
    "OfficeInventory",
    result,
    res,
    "object"
  );
});
