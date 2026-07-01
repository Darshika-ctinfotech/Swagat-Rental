import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as InventoryModel from "./inventory.model.js";
import { randomBytes, randomUUID } from "crypto";
import * as InventorySystemModel from "./inventorySystem.model.js";
import * as UserModel from "../user/user.model.js";

const normalizeSpecJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const randomAlphaNum = (length) => {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHANUM[bytes[i] % ALPHANUM.length];
  }
  return result;
};

const buildCategoryPrefix = (categoryName) => {
  const raw = String(categoryName || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "");
  const prefix = raw.slice(0, 3).toUpperCase();
  return (prefix + "XXX").slice(0, 3);
};

const generateUniqueSerialNumber = async (
  conn,
  { asset_category_id, prefix, used = new Set() }
) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const serial = `${prefix}-${randomAlphaNum(6)}`;
    if (used.has(serial)) continue;

    const existing = await InventoryModel.findAssetByIdentity(conn, {
      asset_category_id,
      serial_number: serial,
    });

    if (existing) continue;

    used.add(serial);
    return serial;
  }

  throw new ApiError([
    STATUS_CODES.INTERNAL_SERVER_ERROR,
    "Unable to generate unique serial number",
  ]);
};

const parseJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    return null;
  }
};

const normalizeFingerprint = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

const resolveClientFromPayload = async (conn, rawClientId) => {
  if (rawClientId === undefined || rawClientId === null) {
    return { clientId: null, client: null };
  }

  if (typeof rawClientId === "number" && Number.isFinite(rawClientId)) {
    const client = await UserModel.getClientByIdTx(conn, rawClientId);
    return { clientId: rawClientId, client };
  }

  const trimmed = String(rawClientId).trim();
  if (!trimmed) {
    return { clientId: null, client: null };
  }

  if (/^\d+$/.test(trimmed)) {
    const numericId = Number(trimmed);
    const client = await UserModel.getClientByIdTx(conn, numericId);
    return { clientId: numericId, client };
  }

  const client = await UserModel.getClientByUniqueIdTx(conn, trimmed);
  return { clientId: client?.id || null, client };
};

const buildCompactSystemInfo = (systemInfo, fallbackDeviceType = null) => {
  const root =
    systemInfo?.system_info && typeof systemInfo.system_info === "object"
      ? systemInfo.system_info
      : systemInfo && typeof systemInfo === "object"
        ? systemInfo
        : {};

  const osInfo = root?.osInfo || {};
  const compact = {
    device_type: root?.device_type || fallbackDeviceType || null,
    os: root?.os || osInfo?.distro || osInfo?.platform || null,
    hostname: root?.hostname || osInfo?.hostname || osInfo?.fqdn || null,
  };

  return { system_info: compact };
};

const normalizeCategoryName = (value) => {
  if (value === null || value === undefined) return null;
  const name = String(value).trim();
  if (!name) return null;
  return name.toLowerCase();
};

const normalizeAssetField = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

const buildAssetPayloadsFromFrontend = (assets = []) => {
  if (!Array.isArray(assets)) return [];
  return assets
    .map((asset) => ({
      type: normalizeCategoryName(asset?.category),
      brand: normalizeAssetField(asset?.brand),
      model: normalizeAssetField(asset?.model),
      serial_number: normalizeAssetField(asset?.serial || asset?.serial_number),
      manufacturer: normalizeAssetField(asset?.manufacturer),
      size: normalizeAssetField(asset?.size),
      spec_json: asset?.spec_json ?? null,
    }))
    .filter((item) => item.type);
};

const ensureCategoryId = async (conn, categoryMap, categoryName) => {
  const normalized = normalizeCategoryName(categoryName);
  if (!normalized) return null;
  let categoryId = categoryMap.get(normalized);
  if (!categoryId) {
    categoryId = await InventoryModel.createAssetCategory(conn, normalized, null, 1);
    categoryMap.set(normalized, categoryId);
  }
  return categoryId;
};

// export const listInventoryTypes = async () => {
//   return withTransaction(async (conn) => {
//     return await InventoryModel.listInventoryTypes(conn);
//   });
// };

export const listAssetCategories = async (query) => {
  return withTransaction(async (conn) => {
    const result = await InventoryModel.listAssetCategories(conn, query);
    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const createAssetCategory = async (payload) => {
  return withTransaction(async (conn) => {
    const name = payload.name?.trim();
    if (!name) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Category name is required"]);
    }

    const existing = await InventoryModel.getAssetCategoryByNameTx(conn, name);
    if (existing && !existing.is_deleted) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Category already exists"]);
    }

    if (existing && existing.is_deleted) {
      await InventoryModel.updateAssetCategoryDynamic(conn, existing.asset_category_id, {
        name,
        display_name: payload.display_name,
        is_active: payload.is_active ?? 1,
        is_deleted: 0,
      });
      return await InventoryModel.getInventoryTypeByIdTx(conn, existing.asset_category_id);
    }

    const categoryId = await InventoryModel.createAssetCategory(
      conn,
      name,
      payload.display_name,
      payload.is_active ?? 1
    );

    return await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
  });
};

export const updateAssetCategory = async (categoryId, payload) => {
  return withTransaction(async (conn) => {
    const category = await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
    if (!category || category.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Category not found"]);
    }

    const updateData = {};
    if (payload.name !== undefined) {
      updateData.name = payload.name?.trim();
    }
    if (payload.display_name !== undefined) {
      updateData.display_name = payload.display_name?.trim();
    }
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active ? 1 : 0;
    }

    await InventoryModel.updateAssetCategoryDynamic(conn, categoryId, updateData);
    return await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
  });
};

export const deleteAssetCategory = async (categoryId) => {
  return withTransaction(async (conn) => {
    const category = await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
    if (!category || category.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Category not found"]);
    }

    const isUsed = await InventoryModel.hasAssetsForCategoryTx(conn, categoryId);
    if (isUsed) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "This category is used in assets",
      ]);
    }

    await InventoryModel.updateAssetCategoryDynamic(conn, categoryId, {
      is_deleted: 1,
      is_active: 0,
    });

    return { id: categoryId };
  });
};

export const listInventories = async (query) => {
  return withTransaction(async (conn) => {
    const result = await InventoryModel.listInventories(conn, query);

    const isPaginationRequested =
      query?.page !== undefined || query?.limit !== undefined;

    if (!isPaginationRequested) {
      return { items: result.rows };
    }

    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getInventoryById = async (inventoryId) => {
  return withTransaction(async (conn) => {
    const inventory = await InventoryModel.getInventoryByIdTx(conn, inventoryId);

    if (!inventory || inventory.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.inventoryNotFound]);
    }
    const spec = inventory.spec_json;
    let parsedSpec = spec;
    if (typeof spec === "string") {
      const trimmed = spec.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          parsedSpec = JSON.parse(trimmed);
        } catch (err) {
          parsedSpec = spec;
        }
      }
    }

    return {
      ...inventory,
      spec_json: parsedSpec,
    };
  });
};

export const createInventory = async (payload, user) => {
  return withTransaction(async (conn) => {
    const type = await InventoryModel.getInventoryTypeByIdTx(
      conn,
      payload.asset_category_id
    );
    if (!type || type.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Inventory type not found"]);
    }

    const quantity = Number(payload.quantity || 1);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid quantity"]);
    }

    const addedBy = user?.admin_id ?? user?.employee_id ?? null;
    if (!addedBy) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }
    const addedByRole = user?.role === "sub_admin" ? "sub_admin" : "admin";
    const assetColumns = await InventoryModel.getAssetsColumnSetTx(conn);

    const isSerialNumberAvailable = Boolean(payload.is_serial_number_available);

    const assetsDetails = Array.isArray(payload.assets_details)
      ? payload.assets_details
      : [];

    let serialNumbers = [];

    if (isSerialNumberAvailable) {
      if (!assetsDetails.length) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "assets_details is required when is_serial_number_available is true",
        ]);
      }

      if (assetsDetails.length !== quantity) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "assets_details length must match quantity",
        ]);
      }

      serialNumbers = assetsDetails
        .map((item) => String(item?.serial_number || "").trim())
        .filter(Boolean);

      if (serialNumbers.length !== quantity) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "serial_number is required for each asset in assets_details",
        ]);
      }

      const unique = new Set(serialNumbers);
      if (unique.size !== serialNumbers.length) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "Duplicate serial numbers are not allowed",
        ]);
      }

      const existing = await InventoryModel.listAssetsBySerials(
        conn,
        [payload.asset_category_id],
        serialNumbers
      );
      if (existing.length) {
        const taken = existing
          .map((row) => row.serial_number)
          .filter(Boolean)
          .slice(0, 10)
          .join(", ");
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          `Serial number already exists: ${taken}`,
        ]);
      }
    } else {
      if (assetsDetails.length && assetsDetails.length !== 1) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "assets_details must be an array of length 1 when is_serial_number_available is false",
        ]);
      }

      const template = assetsDetails[0] || payload;
      const baseInventory = {
        asset_category_id: payload.asset_category_id,
        brand: template.brand ?? payload.brand ?? null,
        model: template.model ?? payload.model ?? null,
        manufacturer: template.manufacturer ?? payload.manufacturer ?? null,
        spec_json: normalizeSpecJson(template.spec_json ?? payload.spec_json),
        is_available:
          (template.is_available ?? payload.is_available) === undefined
            ? 1
            : template.is_available ?? payload.is_available
              ? 1
              : 0,
        status: template.status ?? payload.status ?? "in_stock",
        added_by: addedBy,
        added_by_role: addedByRole,
      };

      const prefix = buildCategoryPrefix(type.name);
      const used = new Set();
      for (let i = 0; i < quantity; i++) {
        const serial = await generateUniqueSerialNumber(conn, {
          asset_category_id: payload.asset_category_id,
          prefix,
          used,
        });
        serialNumbers.push(serial);
      }

      const assetIds = [];
      for (let i = 0; i < quantity; i++) {
        const assetId = await InventoryModel.createInventory(conn, {
          ...baseInventory,
          serial_number: serialNumbers[i] || null,
        }, assetColumns);
        assetIds.push(assetId);
      }

      return {
        created_count: assetIds.length,
        asset_ids: assetIds,
        serial_numbers: serialNumbers,
      };
    }

    // serials provided: create exactly as per assets_details items
    const assetIds = [];
    for (let i = 0; i < quantity; i++) {
      const item = assetsDetails[i] || {};
      const assetId = await InventoryModel.createInventory(conn, {
        asset_category_id: payload.asset_category_id,
        brand: item.brand ?? payload.brand ?? null,
        model: item.model ?? payload.model ?? null,
        serial_number: serialNumbers[i] || null,
        manufacturer: item.manufacturer ?? payload.manufacturer ?? null,
        spec_json: normalizeSpecJson(item.spec_json ?? payload.spec_json),
        is_available:
          (item.is_available ?? payload.is_available) === undefined
            ? 1
            : item.is_available ?? payload.is_available
              ? 1
              : 0,
        status: item.status ?? payload.status ?? "in_stock",
        added_by: addedBy,
        added_by_role: addedByRole,
      }, assetColumns);
      assetIds.push(assetId);
    }

    return {
      created_count: assetIds.length,
      asset_ids: assetIds,
      serial_numbers: serialNumbers,
    };
  });
};

export const updateInventory = async (inventoryId, payload) => {
  return withTransaction(async (conn) => {
    const inventory = await InventoryModel.getInventoryByIdForUpdate(
      conn,
      inventoryId
    );

    if (!inventory || inventory.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.inventoryNotFound]);
    }

    const updateData = {};

    if (payload.asset_category_id !== undefined) {
      const type = await InventoryModel.getInventoryTypeByIdTx(
        conn,
        payload.asset_category_id
      );
      if (!type || type.is_deleted) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, "Inventory type not found"]);
      }
      updateData.asset_category_id = payload.asset_category_id;
    }

    if (payload.brand !== undefined) updateData.brand = payload.brand;
    if (payload.model !== undefined) updateData.model = payload.model;
    if (payload.serial_number !== undefined)
      updateData.serial_number = payload.serial_number;
    if (payload.manufacturer !== undefined)
      updateData.manufacturer = payload.manufacturer;
    if (payload.spec_json !== undefined)
      updateData.spec_json = normalizeSpecJson(payload.spec_json);
    if (payload.is_available !== undefined)
      updateData.is_available = payload.is_available ? 1 : 0;
    if (payload.status !== undefined) updateData.status = payload.status;

    if (Object.keys(updateData).length) {
      await InventoryModel.updateInventoryDynamic(conn, inventoryId, updateData);
    }

    return await getInventoryById(inventoryId);
  });
};

export const createSystemInventory = async (payload, user) => {
  return withTransaction(async (conn) => {
    const hasActorIdentity =
      user?.admin_id !== undefined || user?.employee_id !== undefined;
    const role = String(user?.role || "").toLowerCase();
    const isAllowedRole = ["admin", "super_admin", "sub_admin"].includes(role);

    if (!hasActorIdentity || !isAllowedRole) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }

    const rawClientId = payload.client_id;
    const rawSystemInfo = payload.system_info || payload.json;
    const systemInfo = parseJsonObject(rawSystemInfo);
    const assetList = Array.isArray(payload.assets) ? payload.assets : null;
    const systemUid = payload.system_uid || null;
    const hardwareFingerprint = normalizeFingerprint(payload.hardware_fingerprint);
    const deviceType =
      payload.device_type ||
      systemInfo?.device_type ||
      systemInfo?.os ||
      systemInfo?.osInfo?.distro ||
      systemInfo?.osInfo?.platform ||
      null;

    if (!systemInfo) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid payload"]);
    }

    let clientId = null;
    if (rawClientId !== undefined && rawClientId !== null && String(rawClientId).trim() !== "") {
      const resolved = await resolveClientFromPayload(conn, rawClientId);
      clientId = resolved.clientId;
      if (!resolved.client) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
      }
    }
    const isClientAssigned = clientId !== null;

    let system = null;
    if (systemUid) {
      system = await InventorySystemModel.getSystemByUidTx(conn, systemUid);
    }
    if (!system && hardwareFingerprint) {
      system = await InventorySystemModel.getSystemByHardwareFingerprintTx(
        conn,
        hardwareFingerprint
      );
    }

    if (system && !system.is_deleted) {
      throw new ApiError([STATUS_CODES.CONFLICT, "System already registered"]);
    }

    const systemUuid = payload.system_uuid || randomUUID();
    const fullSnapshotPayload = assetList
      ? { system_info: systemInfo, assets: assetList }
      : { system_info: systemInfo };

    const systemPayload = {
      system_uid: systemUid,
      system_uuid: systemUuid,
      client_id: clientId,
      device_type: deviceType,
      installed_by_employee_id:
        payload.installed_by_employee_id !== undefined &&
          payload.installed_by_employee_id !== null &&
          String(payload.installed_by_employee_id).trim() !== ""
          ? Number(payload.installed_by_employee_id)
          : null,
      installation_date: payload.installation_date || new Date(),
      status:
        payload.status === "underservice"
          ? "under_service"
          : payload.status || "active",
      is_active: 1,
      // Store full system_info payload so details API can show osInfo/mac_addres etc.
      system_info: JSON.stringify(systemInfo),
      hardware_fingerprint: hardwareFingerprint,
    };

    const latestSnapshot = JSON.stringify(fullSnapshotPayload);

    if (!system) {
      const created = await InventorySystemModel.createSystemTx(conn, systemPayload);
      system = {
        id: created.id,
        system_uid: created.system_uid,
        system_uuid: created.system_uuid,
        client_id: clientId,
      };
    } else {
      if (system.is_deleted) {
        systemPayload.is_deleted = 0;
      }
      await InventorySystemModel.updateSystemDynamicTx(conn, system.id, systemPayload);
    }

    system.system_uid = await InventorySystemModel.ensureSystemUidTx(
      conn,
      system.id,
      system.system_uid
    );

    const previousSnapshot = await InventorySystemModel.getSystemSnapshotBySystemIdTx(
      conn,
      system.id
    );

    await InventorySystemModel.insertSystemSnapshotTx(conn, {
      system_id: system.id,
      system_uuid: systemUuid,
      original_snapshot_json:
        previousSnapshot?.latest_snapshot_json || latestSnapshot || null,
      latest_snapshot_json: latestSnapshot,
      diff_json: null,
      changed_at: null,
      is_changed: 0,
    });

    const assetIds = [];

    if (assetList && assetList.length) {
      const categoryMap = await InventoryModel.getAssetCategoryMap(conn);
      const payloads = buildAssetPayloadsFromFrontend(assetList);
      const assetColumns = await InventoryModel.getAssetsColumnSetTx(conn);

      const categoryIdByName = new Map();
      for (const asset of payloads) {
        if (!categoryIdByName.has(asset.type)) {
          const categoryId = await ensureCategoryId(conn, categoryMap, asset.type);
          if (categoryId) categoryIdByName.set(asset.type, categoryId);
        }
      }

      for (const asset of payloads) {
        const categoryId = categoryIdByName.get(asset.type);
        if (!categoryId) continue;

        let assetId = null;
        if (asset.serial_number) {
          const existing = await InventoryModel.findAssetByIdentity(conn, {
            asset_category_id: categoryId,
            serial_number: asset.serial_number,
          });
          assetId = existing?.asset_id || null;
        }

        // For system-inventory creation, if serial exists we treat the asset as installed in this system.
        // If system is not assigned to a client (office inventory), mark assets as used_in_system and keep
        // them available for internal tracking.
        const shouldLinkToSystem = Boolean(asset.serial_number);
        const installedStatus = isClientAssigned ? "rented" : "used_in_system";
        const installedIsAvailable = isClientAssigned ? 0 : 1;
        const updateData = {
          asset_category_id: categoryId,
          brand: asset.brand || null,
          model: asset.model || null,
          serial_number: asset.serial_number || null,
          manufacturer: asset.manufacturer || null,
          size: asset.size || null,
          spec_json: normalizeSpecJson(asset.spec_json),
          is_available: shouldLinkToSystem ? installedIsAvailable : 1,
          status: shouldLinkToSystem ? installedStatus : "in_stock",
        };

        if (assetId) {
          if (shouldLinkToSystem) {
            const activeLink =
              await InventorySystemModel.getActiveSystemAssetLinkByAssetIdTx(
                conn,
                assetId
              );
            if (activeLink && Number(activeLink.system_id) !== Number(system.id)) {
              throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "Asset already assigned to another system",
              ]);
            }
          }
          await InventoryModel.updateInventoryDynamic(conn, assetId, updateData);
        } else {
          assetId = await InventoryModel.createInventory(conn, updateData, assetColumns);
        }

        if (shouldLinkToSystem) {
          await InventorySystemModel.upsertSystemAssetTx(conn, {
            system_id: system.id,
            asset_id: assetId,
            installed_at: new Date(),
          });
        }

        assetIds.push(assetId);
      }
    }

    return {
      system_id: system.id,
      system_uid: system.system_uid,
      system_uuid: systemUuid,
      asset_ids: assetIds,
    };
  });
};

export const listSystemInventories = async (query, user) => {
  const hasActorIdentity =
    user?.admin_id !== undefined || user?.employee_id !== undefined;
  const role = String(user?.role || "").toLowerCase();
  const isAllowedRole = ["admin", "super_admin", "sub_admin"].includes(role);

  if (!hasActorIdentity || !isAllowedRole) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  return withTransaction(async (conn) => {
    const { search, status, client_id, device_type, page, limit } = query || {};

    // const resolvedClientId =
    //   client_id === undefined || client_id === null || client_id === ""
    //     ? null // default: only unassigned systems
    //     : String(client_id).toLowerCase() === "all"
    //       ? undefined
    //       : String(client_id).toLowerCase() === "null"
    //       ? null
    //       : Number(client_id);

    const result = await InventorySystemModel.getSystemInventoryListTx(conn, {
      search: search || undefined,
      status: status || undefined,
      client_id: null,
      device_type: device_type || undefined,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getSystemInventoryDetails = async (systemId, user) => {
  const hasActorIdentity =
    user?.admin_id !== undefined || user?.employee_id !== undefined;
  const role = String(user?.role || "").toLowerCase();
  const isAllowedRole = ["admin", "super_admin", "sub_admin"].includes(role);

  if (!hasActorIdentity || !isAllowedRole) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  return withTransaction(async (conn) => {
    const details = await InventorySystemModel.getSystemInventoryDetailsTx(
      conn,
      systemId
    );

    if (!details) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "System not found"]);
    }

    const rawInfo = details?.system?.system_info;
    if (typeof rawInfo === "string") {
      const trimmed = rawInfo.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed.system_info &&
            typeof parsed.system_info === "object" &&
            Object.keys(parsed).length === 1
          ) {
            // Backward compatibility for older stored shape: { system_info: {...} }
            details.system.system_info = parsed.system_info;
          } else {
            details.system.system_info = parsed;
          }
        } catch (err) {
          // keep original string if not valid json
        }
      }
    }

    return details;
  });
};
