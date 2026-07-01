import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as SystemModel from "./system.model.js";
import * as InventoryModel from "../inventory/inventory.model.js";
import * as UserModel from "../user/user.model.js";
import * as EmployeeModel from "../employee/employee.model.js";
import {
  sendDeviceAssignedEmail,
  sendDeviceUnassignedEmail,
} from "../../utils/email.util.js";
import { comparePassword } from "../../utils/password.utils.js";
import { JWT_EXPIRY, JWT_SECRET } from "../../constants.js";

const normalizeFullResponse = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const normalizeSpecJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const extractAssetSize = (asset = {}) => {
  const parseNumber = (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const direct = Number(raw);
    if (Number.isFinite(direct)) return direct;

    // Supports values like "25 Inch", "500GB", "15.6 in", etc.
    const matched = raw.match(/-?\d+(\.\d+)?/);
    if (!matched) return null;

    const parsed = Number(matched[0]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const direct = parseNumber(asset?.size);
  if (direct !== null) return direct;

  const spec = asset?.spec_json;
  if (!spec || typeof spec !== "object") return null;

  return (
    parseNumber(spec.size) ??
    parseNumber(spec.sizeGB) ??
    parseNumber(spec.size_gb) ??
    parseNumber(spec.sizeMB) ??
    parseNumber(spec.size_mb) ??
    parseNumber(spec.vramMB) ??
    parseNumber(spec.vram_mb) ??
    null
  );
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

const normalizeFingerprint = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

const extractMacAddress = (systemInfo) => {
  if (!systemInfo || typeof systemInfo !== "object") return null;

  const root =
    systemInfo?.system_info && typeof systemInfo.system_info === "object"
      ? systemInfo.system_info
      : systemInfo;

  const direct =
    root?.mac_address ||
    root?.mac_addres ||
    systemInfo?.mac_address ||
    systemInfo?.mac_addres ||
    null;

  if (direct !== null && direct !== undefined) {
    const normalized = String(direct).trim();
    return normalized ? normalized : null;
  }

  const network = Array.isArray(root?.network) ? root.network : [];
  const primary = pickPrimaryNetwork(network);
  const fromNetwork = primary?.mac || null;
  if (!fromNetwork) return null;

  const normalized = String(fromNetwork).trim();
  return normalized ? normalized : null;
};

const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedCategoryMap = null;
let cachedCategoryMapAt = 0;

const getAssetCategoryMapCached = async (conn) => {
  const now = Date.now();
  if (cachedCategoryMap && now - cachedCategoryMapAt < CATEGORY_CACHE_TTL_MS) {
    return cachedCategoryMap;
  }
  cachedCategoryMap = await InventoryModel.getAssetCategoryMap(conn);
  cachedCategoryMapAt = now;
  return cachedCategoryMap;
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

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const resolveEmployeeFromPayload = async (conn, payload = {}) => {
  const hasInstalledEmployeeId = hasValue(payload.installed_by_employee_id);
  const hasEmployeeUniqueId = hasValue(payload.employee_id);

  if (!hasInstalledEmployeeId && !hasEmployeeUniqueId) {
    return { employeeId: null, employee: null, provided: false };
  }

  let employeeById = null;
  let employeeByUnique = null;

  if (hasInstalledEmployeeId) {
    const raw = String(payload.installed_by_employee_id).trim();
    if (!/^\d+$/.test(raw)) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "installed_by_employee_id must be a valid numeric employee id",
      ]);
    }
    employeeById = await EmployeeModel.getEmployeeByIdTx(conn, Number(raw));
    if (!employeeById) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }
  }

  if (hasEmployeeUniqueId) {
    const raw = String(payload.employee_id).trim();
    if (/^\d+$/.test(raw)) {
      employeeByUnique = await EmployeeModel.getEmployeeByIdTx(conn, Number(raw));
    } else {
      employeeByUnique = await EmployeeModel.getEmployeeByUniqueIdTx(conn, raw);
    }
    if (!employeeByUnique) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }
  }

  if (employeeById && employeeByUnique && employeeById.id !== employeeByUnique.id) {
    throw new ApiError([
      STATUS_CODES.BAD_REQUEST,
      "installed_by_employee_id and employee_id refer to different employees",
    ]);
  }

  const employee = employeeById || employeeByUnique;
  return { employeeId: employee.id, employee, provided: true };
};

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  );
  return `{${entries.join(",")}}`;
};

const hashSystemInfo = (systemInfo) => {
  if (!systemInfo) return null;
  const { time, currentLoad, mem, battery, ...stableInfo } = systemInfo;
  const signature = stableStringify(stableInfo);
  return createHash("sha256").update(signature).digest("hex");
};

const normalizeAssetsForHash = (assets = []) => {
  if (!Array.isArray(assets)) return [];
  const normalized = assets.map((asset) => ({
    category: normalizeCategoryName(asset?.category),
    brand: normalizeAssetField(asset?.brand),
    model: normalizeAssetField(asset?.model),
    serial: normalizeAssetField(asset?.serial),
    manufacturer: normalizeAssetField(asset?.manufacturer),
    size: normalizeAssetField(asset?.size),
    spec_json: asset?.spec_json ?? null,
  }));

  const keyForSort = (item) =>
    [
      item.category || "",
      item.brand || "",
      item.model || "",
      item.serial || "",
      item.manufacturer || "",
      item.size ?? "",
      stableStringify(item.spec_json),
    ].join("|");

  return normalized.sort((a, b) => {
    const keyA = keyForSort(a);
    const keyB = keyForSort(b);
    return keyA.localeCompare(keyB);
  });
};

const hashSystemPayload = (systemInfo, assets = []) => {
  if (!systemInfo) return null;
  const signature = stableStringify({
    system_info: systemInfo,
    assets: normalizeAssetsForHash(assets),
  });
  return createHash("sha256").update(signature).digest("hex");
};

const diffSnapshotValues = (prevValue, nextValue, path = "") => {
  if (prevValue === nextValue) return [];

  const isPrevObject =
    prevValue !== null &&
    typeof prevValue === "object" &&
    !Array.isArray(prevValue);
  const isNextObject =
    nextValue !== null &&
    typeof nextValue === "object" &&
    !Array.isArray(nextValue);

  if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
    if (!Array.isArray(prevValue) || !Array.isArray(nextValue)) {
      return [path || "$"];
    }

    const maxLength = Math.max(prevValue.length, nextValue.length);
    const changes = [];
    for (let i = 0; i < maxLength; i += 1) {
      const nextPath = `${path}[${i}]`;
      if (i >= prevValue.length || i >= nextValue.length) {
        changes.push(nextPath);
      } else {
        changes.push(
          ...diffSnapshotValues(prevValue[i], nextValue[i], nextPath),
        );
      }
    }
    return changes;
  }

  if (!isPrevObject || !isNextObject) {
    return [path || "$"];
  }

  const keys = new Set([...Object.keys(prevValue), ...Object.keys(nextValue)]);

  const changes = [];
  for (const key of keys) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!(key in prevValue) || !(key in nextValue)) {
      changes.push(nextPath);
      continue;
    }
    changes.push(
      ...diffSnapshotValues(prevValue[key], nextValue[key], nextPath),
    );
  }

  return changes;
};

const computeSnapshotDiff = (prevSnapshot, nextSnapshot) => {
  const prevValue = parseFullResponse(prevSnapshot);
  const nextValue = parseFullResponse(nextSnapshot);

  if (prevValue === null || nextValue === null) {
    return prevSnapshot === nextSnapshot ? [] : ["$"];
  }

  return diffSnapshotValues(prevValue, nextValue);
};

const bytesToGb = (value) => {
  if (!value || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) / 1024 / 1024 / 1024);
};

const pickPrimaryNetwork = (list = []) => {
  if (!Array.isArray(list)) return null;
  return (
    list.find(
      (n) => n && !n.internal && n.mac && n.mac !== "00:00:00:00:00:00",
    ) || list.find((n) => n && n.mac)
  );
};

const parseFullResponse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return null;
  }
};

const toFixedGbString = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1024) {
    return (numeric / 1024 / 1024 / 1024).toFixed(2);
  }
  return numeric.toFixed(2);
};

const normalizeSystemInfoInput = (value) => {
  const parsed = parseFullResponse(value);
  if (parsed && typeof parsed === "object") return parsed;
  return null;
};

export const syncClientSystemCounts = async (conn, clientId) => {
  const [[counts]] = await conn.query(
    `
    SELECT
      SUM(CASE WHEN LOWER(device_type) = 'laptop' THEN 1 ELSE 0 END) AS total_laptops,
      SUM(CASE WHEN LOWER(device_type) = 'desktop' THEN 1 ELSE 0 END) AS total_computers
    FROM systems
    WHERE client_id = ?
      AND is_deleted = 0
    `,
    [clientId]
  );

  await UserModel.updateClientDynamic(conn, clientId, {
    total_laptops: counts?.total_laptops || 0,
    total_computers: counts?.total_computers || 0,
  });
};

const buildCompactSystemInfo = (input, fallbackDeviceType = null) => {
  const normalizedInput = normalizeSystemInfoInput(input) || {};
  const root =
    normalizedInput?.system_info &&
      typeof normalizedInput.system_info === "object"
      ? normalizedInput.system_info
      : normalizedInput && typeof normalizedInput === "object"
        ? normalizedInput
        : {};

  const osInfo = root?.osInfo || {};
  const primaryNetwork = pickPrimaryNetwork(root?.network || []);
  const compact = {
    device_type: root?.device_type || fallbackDeviceType || null,
    os: root?.os || osInfo?.distro || osInfo?.platform || null,
    hostname: root?.hostname || osInfo?.hostname || osInfo?.fqdn || null,
    total_ram_gb: root?.total_ram_gb || toFixedGbString(root?.mem?.total),
    motherboard_serial:
      root?.motherboard_serial || root?.baseboard?.serial || null,
    mac_address: root?.mac_address || root?.mac_addres || primaryNetwork?.mac || null,
    ip_address: root?.ip_address || primaryNetwork?.ip4 || null,
  };

  return { system_info: compact };
};

const deriveSystemMeta = (system) => {
  const directDeviceName = system?.device_name || null;
  const directOsName = system?.os_name || null;
  const directIp = system?.ip_address || null;
  const directMac = system?.mac_address || null;

  let deviceName = directDeviceName;
  let osName = directOsName;
  let ipAddress = directIp;
  let macAddress = directMac;

  if (!deviceName || !osName || !ipAddress || !macAddress) {
    const info = parseFullResponse(system?.full_response);
    const systemInfo = info?.system_info || info;
    const osInfo = systemInfo?.osInfo || {};
    const network = systemInfo?.network || [];
    const primaryNetwork = pickPrimaryNetwork(network);

    deviceName =
      deviceName ||
      systemInfo?.device_name ||
      systemInfo?.hostname ||
      osInfo.hostname ||
      osInfo.fqdn ||
      null;
    osName =
      osName || systemInfo?.os || osInfo.distro || osInfo.platform || null;
    ipAddress =
      ipAddress ||
      primaryNetwork?.ip4 ||
      systemInfo?.ip_address ||
      system?.ip_address ||
      null;
    macAddress =
      macAddress ||
      primaryNetwork?.mac ||
      systemInfo?.mac_address ||
      system?.mac_address ||
      null;
  }

  return {
    device_name: deviceName || null,
    device_type: osName || system?.device_type || null,
    ip_address: ipAddress || null,
    mac_address: macAddress || null,
  };
};

const buildAssetPayloads = (systemInfo = {}) => {
  const cpu = systemInfo?.cpu || {};
  const baseboard = systemInfo?.baseboard || {};
  const graphicsController = systemInfo?.graphics?.controllers?.[0] || null;
  const display = systemInfo?.graphics?.displays?.[0] || null;
  const firstDisk = systemInfo?.hardDisks?.[0] || null;
  const firstRam = systemInfo?.ramModules?.[0] || null;
  const primaryNetwork = pickPrimaryNetwork(systemInfo.network || []);

  const ramGb = bytesToGb(systemInfo?.mem?.total);
  const ssdGb = bytesToGb(firstDisk?.size);

  return [
    { type: "time", value: systemInfo.time },
    { type: "os_info", value: systemInfo.osInfo },
    {
      type: "cpu",
      value: systemInfo.cpu,
      manufacturer: cpu.manufacturer || null,
      model: cpu.brand || null,
    },
    {
      type: "processor",
      value: cpu.brand || cpu.manufacturer || null,
      manufacturer: cpu.manufacturer || null,
      model: cpu.brand || null,
    },
    { type: "current_load", value: systemInfo.currentLoad },
    { type: "memory", value: systemInfo.mem },
    {
      type: "ram",
      value: {
        total_gb: ramGb,
        serial_no: firstRam?.serialNum || null,
        brand: firstRam?.manufacturer || null,
      },
      manufacturer: firstRam?.manufacturer || null,
      serial_number: firstRam?.serialNum || null,
      model: ramGb ? `${ramGb} GB` : null,
    },
    {
      type: "ram_module",
      value: systemInfo.ramModules,
      manufacturer: firstRam?.manufacturer || null,
      serial_number: firstRam?.serialNum || null,
    },
    {
      type: "rom",
      value: {
        ssd_gb: ssdGb,
        ssd_serial_no: firstDisk?.serialNum || null,
      },
      serial_number: firstDisk?.serialNum || null,
      model: ssdGb ? `${ssdGb} GB` : firstDisk?.name || null,
      manufacturer: firstDisk?.vendor || null,
    },
    {
      type: "hard_disk",
      value: systemInfo.hardDisks,
      serial_number: firstDisk?.serialNum || null,
      model: firstDisk?.name || null,
      manufacturer: firstDisk?.vendor || null,
    },
    { type: "file_system", value: systemInfo.fsSize },
    {
      type: "graphics",
      value: systemInfo.graphics,
      manufacturer: graphicsController?.vendor || null,
      model: graphicsController?.model || null,
    },
    {
      type: "display",
      value: systemInfo?.graphics?.displays,
      manufacturer: display?.vendor || null,
      model: display?.model || null,
    },
    {
      type: "network",
      value: systemInfo.network,
      serial_number: primaryNetwork?.mac || null,
      model: primaryNetwork?.iface || null,
    },
    { type: "battery", value: systemInfo.battery },
    { type: "uuid", value: systemInfo.uuid },
    {
      type: "baseboard",
      value: systemInfo.baseboard,
      manufacturer: baseboard.manufacturer || null,
      model: baseboard.model || null,
      serial_number: baseboard.serial || null,
    },
    {
      type: "motherboard",
      value: baseboard.model || null,
      manufacturer: baseboard.manufacturer || null,
      model: baseboard.model || null,
      serial_number: baseboard.serial || null,
    },
    {
      type: "mac_address",
      value: primaryNetwork?.mac || null,
      serial_number: primaryNetwork?.mac || null,
    },
    { type: "ip_address", value: primaryNetwork?.ip4 || null },
    {
      type: "device_name",
      value: systemInfo?.osInfo?.hostname || systemInfo?.osInfo?.fqdn || null,
      model: systemInfo?.osInfo?.hostname || systemInfo?.osInfo?.fqdn || null,
    },
    {
      type: "device_uuid",
      value: systemInfo?.uuid?.hardware || systemInfo?.uuid?.os || null,
      serial_number: systemInfo?.uuid?.hardware || systemInfo?.uuid?.os || null,
    },
  ].filter((item) => item.value !== undefined && item.value !== null);
};

const buildAssetPayloadsFromFrontend = (assets = []) => {
  if (!Array.isArray(assets)) return [];
  return assets
    .map((asset) => ({
      type: normalizeCategoryName(asset?.category),
      brand: normalizeAssetField(asset?.brand),
      model: normalizeAssetField(asset?.model),
      serial_number: normalizeAssetField(asset?.serial),
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
    categoryId = await InventoryModel.createAssetCategory(conn, normalized, 1);
    categoryMap.set(normalized, categoryId);
  }
  return categoryId;
};

const upsertAssetsForSystemPayloads = async (
  conn,
  systemId,
  payloads,
  categoryMap,
) => {
  const assetIds = [];
  const assetIdSet = new Set();
  const previousAssetIds = await SystemModel.getActiveSystemAssetIds(
    conn,
    systemId,
  );
  const categoryIdByName = new Map();

  for (const payload of payloads) {
    const normalizedType = normalizeCategoryName(payload?.type);
    if (!normalizedType) continue;
    if (categoryIdByName.has(normalizedType)) continue;
    const categoryId = await ensureCategoryId(conn, categoryMap, normalizedType);
    if (categoryId) {
      categoryIdByName.set(normalizedType, categoryId);
    }
  }

  const categoryIds = Array.from(categoryIdByName.values());
  const serialNumbers = [
    ...new Set(
      payloads
        .map((payload) => normalizeAssetField(payload?.serial_number))
        .filter(Boolean)
    ),
  ];

  const [serialAssets, availableAssets, systemAssets] = await Promise.all([
    InventoryModel.listAssetsBySerials(conn, categoryIds, serialNumbers),
    InventoryModel.listAvailableAssetsByCategories(conn, categoryIds),
    SystemModel.getSystemAssetsByCategories(conn, systemId, categoryIds),
  ]);

  const serialAssetMap = new Map();
  for (const row of serialAssets) {
    const key = `${row.asset_category_id}|${row.serial_number}`;
    const list = serialAssetMap.get(key) || [];
    list.push(row);
    serialAssetMap.set(key, list);
  }

  const availableAssetMap = new Map();
  const availableIndexMap = new Map();
  const profileKey = (categoryId, brand, model, manufacturer) =>
    [
      categoryId,
      brand || "",
      model || "",
      manufacturer || "",
    ].join("|");

  for (const row of availableAssets) {
    const key = profileKey(
      row.asset_category_id,
      row.brand,
      row.model,
      row.manufacturer
    );
    const list = availableAssetMap.get(key) || [];
    list.push(row.asset_id);
    availableAssetMap.set(key, list);
  }

  const systemAssetMap = new Map();
  for (const row of systemAssets) {
    if (!systemAssetMap.has(row.asset_category_id)) {
      systemAssetMap.set(row.asset_category_id, row.asset_id);
    }
  }

  for (const payload of payloads) {
    const normalizedType = normalizeCategoryName(payload?.type);
    const categoryId = normalizedType ? categoryIdByName.get(normalizedType) : null;
    if (!categoryId) continue;

    let assetId = null;
    const identity = {
      asset_category_id: categoryId,
      serial_number: normalizeAssetField(payload.serial_number),
      brand: payload.brand || payload.manufacturer || null,
      model: payload.model || null,
      manufacturer: payload.manufacturer || null,
      size: payload.size || null,
    };

    if (identity.serial_number) {
      const key = `${categoryId}|${identity.serial_number}`;
      const candidates = serialAssetMap.get(key) || [];
      const match = candidates.find((row) => {
        if (identity.brand !== null && identity.brand !== undefined) {
          if (row.brand !== identity.brand) return false;
        }
        if (identity.model !== null && identity.model !== undefined) {
          if (row.model !== identity.model) return false;
        }
        if (identity.manufacturer !== null && identity.manufacturer !== undefined) {
          if (row.manufacturer !== identity.manufacturer) return false;
        }
        return true;
      });
      assetId = match ? match.asset_id : null;
    }

    if (!assetId && !identity.serial_number) {
      const key = profileKey(
        categoryId,
        identity.brand,
        identity.model,
        identity.manufacturer
      );
      const list = availableAssetMap.get(key) || [];
      let idx = availableIndexMap.get(key) || 0;
      while (idx < list.length && assetIdSet.has(list[idx])) {
        idx += 1;
      }
      if (idx < list.length) {
        assetId = list[idx];
        availableIndexMap.set(key, idx + 1);
      }

      if (!assetId) {
        assetId = systemAssetMap.get(categoryId) || null;
      }
    }

    // IMPORTANT:
    // For serialized assets (e.g. RAM sticks with different serials), we should
    // never reuse by category mapping. Otherwise multiple items of same category
    // collapse into one record.

    if (assetId) {
      const updateData = {
        asset_category_id: categoryId,
        brand: identity.brand || null,
        model: identity.model || null,
        manufacturer: identity.manufacturer || null,
        size: identity.size || null,
        spec_json: normalizeSpecJson(payload.spec_json ?? payload.value),
        is_available: 0,
        status: "rented",
      };
      if (identity.serial_number) {
        updateData.serial_number = identity.serial_number;
      }
      await InventoryModel.updateInventoryDynamic(conn, assetId, updateData);
    } else {
      assetId = await InventoryModel.createInventory(conn, {
        asset_category_id: categoryId,
        brand: identity.brand || null,
        model: identity.model || null,
        serial_number: identity.serial_number || null,
        manufacturer: identity.manufacturer || null,
        size: identity.size || null,
        spec_json: normalizeSpecJson(payload.spec_json ?? payload.value),
        is_available: 0,
        status: "rented",
      });
    }

    await SystemModel.upsertSystemAsset(conn, {
      system_id: systemId,
      asset_id: assetId,
      installed_at: new Date(),
    });
    assetIds.push(assetId);
    assetIdSet.add(assetId);
  }

  const removed = previousAssetIds.filter((id) => !assetIdSet.has(id));
  if (removed.length) {
    await SystemModel.markSystemAssetsRemoved(conn, systemId, removed);
    await InventoryModel.updateAssetAvailabilityBulk(conn, removed, true);
  }

  if (assetIdSet.size) {
    await InventoryModel.updateAssetAvailabilityBulk(
      conn,
      Array.from(assetIdSet),
      false
    );
  }

  return assetIds;
};

const upsertAssetsForSystemInfo = async (
  conn,
  systemId,
  systemInfo,
  categoryMap,
) => {
  const payloads = buildAssetPayloads(systemInfo).map((payload) => ({
    type: payload.type,
    brand: payload.brand,
    model: payload.model,
    serial_number: payload.serial_number,
    manufacturer: payload.manufacturer,
    spec_json: payload.value,
  }));

  return await upsertAssetsForSystemPayloads(
    conn,
    systemId,
    payloads,
    categoryMap,
  );
};

export const addPcInfo = async (payload) => {
  return withTransaction(async (conn) => {
    const rawClientId = payload.client_id;
    const rawSystemInfo = payload.system_info || payload.json;
    const systemInfo = normalizeSystemInfoInput(rawSystemInfo);
    const assetList = Array.isArray(payload.assets) ? payload.assets : null;
    const systemUid = payload.system_uid;
    const hardwareFingerprint = normalizeFingerprint(
      payload.hardware_fingerprint,
    );
    const macAddress = extractMacAddress(systemInfo);
    const deviceType =
      payload.device_type ||
      systemInfo?.device_type ||
      systemInfo?.os ||
      systemInfo?.osInfo?.distro ||
      systemInfo?.osInfo?.platform ||
      null;

    if (
      rawClientId === undefined ||
      rawClientId === null ||
      String(rawClientId).trim() === "" ||
      !systemInfo
    ) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid payload"]);
    }

    const { clientId, client } = await resolveClientFromPayload(
      conn,
      rawClientId,
    );
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const {
      employeeId: resolvedEmployeeId,
      provided: isEmployeeProvided,
    } = await resolveEmployeeFromPayload(conn, payload);

    let system = null;
    let matchedByMac = false;
    if (systemUid) {
      system = await SystemModel.getSystemByUidTx(conn, systemUid);
    }
    if (!system && hardwareFingerprint) {
      system = await SystemModel.getSystemByHardwareFingerprintTx(
        conn,
        hardwareFingerprint,
      );
    }
    if (!system && macAddress) {
      system = await SystemModel.getSystemByMacAddressTx(conn, macAddress);
      matchedByMac = Boolean(system);
    }
    console.log(" system", system);
    // if (system && system.client_id !== clientId) {
    //   throw new ApiError([
    //     STATUS_CODES.BAD_REQUEST,
    //     "System already mapped to another client",
    //   ]);
    // }

    // 🚨 If same client + same fingerprint → Block
    if (system && system.client_id === clientId && !matchedByMac) {
      throw new ApiError([
        STATUS_CODES.CONFLICT,
        "Device already registered for this client",
      ]);
    }

    // 🚨 If fingerprint exists but mapped to another client
    if (system && system.client_id !== clientId) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "System already mapped to another client",
      ]);
    }

    const systemUuid =
      system?.system_uuid || payload.system_uuid || randomUUID();
    const compactSystemInfo = buildCompactSystemInfo(systemInfo, deviceType);
    const fullSnapshotPayload = assetList
      ? { system_info: systemInfo, assets: assetList }
      : { system_info: systemInfo };
    const previousInstalledEmployeeId = system?.installed_by_employee_id || null;
    const systemPayload = {
      system_uid: systemUid,
      system_uuid: systemUuid,
      client_id: clientId,
      device_type: deviceType,
      installed_by_employee_id: isEmployeeProvided
        ? resolvedEmployeeId
        : previousInstalledEmployeeId,
      installation_date: payload.installation_date || new Date(),
      status:
        payload.status === "underservice"
          ? "under_service"
          : payload.status || "active",
      is_active: 1,
      system_info: normalizeFullResponse(compactSystemInfo),
    };
    if (hardwareFingerprint !== undefined) {
      systemPayload.hardware_fingerprint = hardwareFingerprint;
    } else if (!system) {
      systemPayload.hardware_fingerprint = null;
    }

    const latestInfo = systemPayload.system_info;
    const latestSnapshot = normalizeFullResponse(fullSnapshotPayload);
    const snapshot = system
      ? await SystemModel.getSystemSnapshotBySystemId(conn, system.id)
      : null;

    if (!system) {
      const created = await SystemModel.createSystem(conn, systemPayload);
      system = {
        id: created.id,
        system_uid: created.system_uid,
        system_uuid: created.system_uuid,
        ...systemPayload,
      };
    } else {
      if (system.is_deleted) {
        systemPayload.is_deleted = 0;
      }
      await SystemModel.updateSystemDynamic(conn, system.id, systemPayload);
    }

    if (!system.system_uid) {
      system.system_uid = await SystemModel.ensureSystemUid(
        conn,
        system.id,
        system.system_uid
      );
    }

    let diffKeys = [];
    let isSnapshotChanged = false;
    let shouldInsertSnapshot = false;

    if (!snapshot) {
      shouldInsertSnapshot = true;
    } else if (latestSnapshot !== undefined) {
      if (snapshot.latest_snapshot_json === latestSnapshot) {
        shouldInsertSnapshot = false;
      } else {
        diffKeys = computeSnapshotDiff(
          snapshot.latest_snapshot_json,
          latestSnapshot
        );
        isSnapshotChanged = diffKeys.length > 0;
        shouldInsertSnapshot = isSnapshotChanged;
      }
    }

    if (shouldInsertSnapshot) {
      await SystemModel.insertSystemSnapshot(conn, {
        system_id: system.id,
        system_uuid: systemPayload.system_uuid,
        original_snapshot_json:
          snapshot?.original_snapshot_json || latestSnapshot || null,
        latest_snapshot_json: latestSnapshot,
        diff_json: diffKeys.length ? JSON.stringify(diffKeys) : null,
        changed_at: isSnapshotChanged ? new Date() : null,
        is_changed: isSnapshotChanged ? 1 : 0,
      });
    }

    const categoryMap = await getAssetCategoryMapCached(conn);
    const assetIds = assetList
      ? await upsertAssetsForSystemPayloads(
        conn,
        system.id,
        buildAssetPayloadsFromFrontend(assetList),
        categoryMap,
      )
      : await upsertAssetsForSystemInfo(
        conn,
        system.id,
        systemInfo,
        categoryMap,
      );

    return {
      system_id: system.id,
      system_uid: system.system_uid,
      system_uuid: system.system_uuid,
      asset_ids: assetIds,
    };
  });
};

export const addSystemSnapshot = async (payload) => {
  return withTransaction(async (conn) => {
    const systemUuid =
      payload.system_id ||
      payload.system_uuid ||
      payload.systemId ||
      payload.systemUUID;
    const snapshotPayload = payload.snapshot || null;
    const rawSystemInfo =
      payload.system_info ||
      payload.json ||
      snapshotPayload?.system_info ||
      snapshotPayload ||
      null;
    const systemInfo = normalizeSystemInfoInput(rawSystemInfo);
    const assetList = Array.isArray(payload.assets)
      ? payload.assets
      : Array.isArray(snapshotPayload?.assets)
        ? snapshotPayload.assets
        : Array.isArray(systemInfo?.assets)
          ? systemInfo.assets
          : null;
    const deviceType =
      payload.device_type ||
      snapshotPayload?.device_type ||
      systemInfo?.device_type ||
      systemInfo?.os ||
      systemInfo?.osInfo?.distro ||
      systemInfo?.osInfo?.platform ||
      null;

    if (!systemUuid || !systemInfo) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid payload"]);
    }

    const system = await SystemModel.getSystemByUuidTx(conn, systemUuid);
    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    const compactSystemInfo = buildCompactSystemInfo(systemInfo, deviceType);
    const latestInfo = normalizeFullResponse(compactSystemInfo);
    const latestSnapshot = latestInfo;

    const snapshot = await SystemModel.getSystemSnapshotBySystemId(
      conn,
      system.id,
    );

    if (payload.hardware_fingerprint !== undefined) {
      const fingerprint = normalizeFingerprint(payload.hardware_fingerprint);
      if (fingerprint && fingerprint !== system.hardware_fingerprint) {
        const existing = await SystemModel.getSystemByHardwareFingerprintTx(
          conn,
          fingerprint,
        );
        if (existing && existing.id !== system.id) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "System already registered with this hardware fingerprint",
          ]);
        }
      }
    }

    const updatePayload = {
      device_type: deviceType || system.device_type || null,
      system_info: latestInfo,
    };
    if (payload.hardware_fingerprint !== undefined) {
      updatePayload.hardware_fingerprint = normalizeFingerprint(
        payload.hardware_fingerprint,
      );
    }

    await SystemModel.updateSystemDynamic(conn, system.id, updatePayload);
    const diffKeys =
      snapshot && latestSnapshot !== undefined
        ? computeSnapshotDiff(snapshot.latest_snapshot_json, latestSnapshot)
        : [];
    const isSnapshotChanged = diffKeys.length > 0;
    const shouldInsertSnapshot = !snapshot || isSnapshotChanged;

    if (shouldInsertSnapshot) {
      await SystemModel.insertSystemSnapshot(conn, {
        system_id: system.id,
        system_uuid: system.system_uuid,
        original_snapshot_json:
          snapshot?.original_snapshot_json || latestSnapshot || null,
        latest_snapshot_json: latestSnapshot,
        diff_json: diffKeys.length ? JSON.stringify(diffKeys) : null,
        changed_at: isSnapshotChanged ? new Date() : null,
        is_changed: isSnapshotChanged ? 1 : 0,
      });
    }

    const categoryMap = await InventoryModel.getAssetCategoryMap(conn);
    const assetIds = assetList
      ? await upsertAssetsForSystemPayloads(
        conn,
        system.id,
        buildAssetPayloadsFromFrontend(assetList),
        categoryMap,
      )
      : await upsertAssetsForSystemInfo(
        conn,
        system.id,
        systemInfo,
        categoryMap,
      );

    return {
      system_id: system.id,
      system_uid: system.system_uid,
      system_uuid: system.system_uuid,
      asset_ids: assetIds,
    };
  });
};

const parseInventoryDetails = (rows = []) => {
  const parseDetailValue = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      return value;
    }
  };

  return rows.map((row) => {
    const type = row.asset_category_name;
    const details = {};
    const parsedSpec = parseDetailValue(row.spec_json);

    if (
      parsedSpec &&
      typeof parsedSpec === "object" &&
      !Array.isArray(parsedSpec)
    ) {
      Object.assign(details, parsedSpec);
    } else if (parsedSpec !== null && parsedSpec !== undefined) {
      details.spec = parsedSpec;
    }

    if (row.brand !== null && row.brand !== undefined)
      details.brand = row.brand;
    if (row.model !== null && row.model !== undefined)
      details.model = row.model;
    if (row.serial_number !== null && row.serial_number !== undefined)
      details.serial_number = row.serial_number;
    if (row.manufacturer !== null && row.manufacturer !== undefined)
      details.manufacturer = row.manufacturer;
    if (row.status !== null && row.status !== undefined)
      details.status = row.status;
    if (row.size !== null && row.size !== undefined) details.size = row.size;
    return { type, asset_id: row.asset_id, details };
  });
};

const buildSystemResponse = async (conn, systemId) => {
  const system = await SystemModel.getSystemDetailsByIdTx(conn, systemId);

  if (!system) {
    throw new ApiError([
      STATUS_CODES.NOT_FOUND,
      Msg.deviceNotFound || "System not found",
    ]);
  }

  const assets = await SystemModel.getSystemAssetsBySystemIds(conn, [systemId]);
  const toValue = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    return str.length ? str : null;
  };

  const parseMaybeJson = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      return null;
    }
  };

  const fullInfo = parseMaybeJson(system.full_response);
  const systemInfoNode = fullInfo?.system_info || fullInfo || {};
  let deviceName = null;
  let osName = null;
  let ipAddress = null;
  let macAddress = null;

  for (const asset of assets) {
    const category = String(asset.asset_category_name || "")
      .trim()
      .toLowerCase();
    const spec = parseMaybeJson(asset.spec_json);

    if (
      !deviceName &&
      (category === "device_name" || category === "hostname")
    ) {
      deviceName = toValue(asset.model) || toValue(asset.brand);
    }

    if (
      !osName &&
      (category === "os_info" ||
        category === "os" ||
        category === "operating_system")
    ) {
      osName =
        toValue(spec?.distro) ||
        toValue(spec?.platform) ||
        toValue(spec?.os) ||
        toValue(asset.model) ||
        toValue(asset.brand);
    }

    if (!ipAddress && category === "ip_address") {
      ipAddress =
        toValue(asset.model) ||
        toValue(asset.serial_number) ||
        toValue(spec?.ip4) ||
        toValue(spec?.ip_address) ||
        toValue(spec);
    }

    if (!macAddress && category === "mac_address") {
      macAddress =
        toValue(asset.serial_number) ||
        toValue(asset.model) ||
        toValue(spec?.mac) ||
        toValue(spec);
    }

  }

  system.device_name = deviceName || toValue(systemInfoNode?.hostname);
  system.os_name = osName || toValue(systemInfoNode?.os);
  system.ip_address = ipAddress || toValue(systemInfoNode?.ip_address);
  system.mac_address = macAddress || toValue(systemInfoNode?.mac_address);
  system.inventory = parseInventoryDetails(assets);
  system.meta = deriveSystemMeta(system);

  return system;
};

export const listSystems = async (query) => {
  return withTransaction(async (conn) => {
    const result = await SystemModel.listSystems(conn, query);
    const systemIds = result.rows.map((row) => row.id);
    const assets = await SystemModel.getSystemAssetsBySystemIds(
      conn,
      systemIds,
    );

    const parseMaybeJson = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "object") return value;
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        return null;
      }
    };

    const toValue = (value) => {
      if (value === undefined || value === null) return null;
      const str = String(value).trim();
      return str.length ? str : null;
    };

    const assetsBySystemId = new Map();
    for (const asset of assets) {
      const existing = assetsBySystemId.get(asset.system_id) || [];
      existing.push(asset);
      assetsBySystemId.set(asset.system_id, existing);
    }

    const items = result.rows.map((row) => {
      const parsed = parseMaybeJson(row.full_response);
      const systemInfoBase = (parsed?.system_info || parsed || {}) ?? {};
      const systemAssets = assetsBySystemId.get(row.id) || [];

      let deviceName = toValue(systemInfoBase?.hostname);
      let cpuModel = null;
      let ssdSize = null;
      let hddSize = null;

      for (const asset of systemAssets) {
        const category = String(asset.asset_category_name || "")
          .trim()
          .toLowerCase();
        const spec = parseMaybeJson(asset.spec_json);
        const sizeValue = extractAssetSize({ size: asset.size, spec_json: spec });

        if (
          !deviceName &&
          (category === "device_name" || category === "hostname")
        ) {
          deviceName = toValue(asset.model) || toValue(asset.brand);
        }
        if (!cpuModel && (category === "cpu" || category === "processor")) {
          cpuModel = toValue(asset.model) || toValue(asset.brand);
        }
        if (sizeValue !== null) {
          if (!ssdSize && (category === "rom" || category === "ssd")) {
            ssdSize = sizeValue;
          }
          if (!hddSize && (category === "hard_disk" || category === "hdd")) {
            hddSize = sizeValue;
          }
        }
      }

      const systemInfo = {
        ...systemInfoBase,
        cpu_model: cpuModel,
        ssd_and_hdd: {
          ssd_size: ssdSize,
          hdd_size: hddSize,
        },
      };

      return {
        id: row.id,
        system_uid: row.system_uid,
        system_uuid: row.system_uuid,
        device_type: row.device_type,
        hardware_fingerprint: row.hardware_fingerprint,
        client_id: row.client_id,
        client_unique_id: row.client_unique_id,
        client_name: row.client_name,
        installed_by_employee_id: row.installed_by_employee_id,
        employee_unique_id: row.employee_unique_id,
        employee_name: row.employee_name,
        installation_date: row.installation_date,
        status: row.status,
        is_active: row.is_active,
        approval_status: row.approval_status,
        created_at: row.created_at,
        is_block: row.is_block,
        system_info: systemInfo,
      };
    });

    return {
      items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getSystemById = async (systemId) => {
  return withTransaction(async (conn) => {
    return await buildSystemResponse(conn, systemId);
  });
};

export const getSystemStatusByUid = async (systemUid) => {
  return withTransaction(async (conn) => {
    const uid = systemUid === undefined || systemUid === null ? "" : String(systemUid).trim();
    if (!uid) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "system_uid is required"]);
    }

    const system = await SystemModel.getSystemStatusByUidTx(conn, uid);
    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    return {
      system_uid: system.system_uid,
      status: system.status,
      approval_status: system.approval_status,
      is_active: system.is_active,
      is_block: system.is_block,
    };
  });
};

export const systemHeartbeat = async ({ system_id, hardware_fingerprint } = {}) => {
  return withTransaction(async (conn) => {
    const systemUuid =
      system_id === undefined || system_id === null ? "" : String(system_id).trim();
    const hardwareFingerprint =
      hardware_fingerprint === undefined || hardware_fingerprint === null
        ? ""
        : String(hardware_fingerprint).trim();

    if (!systemUuid) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "system_id is required"]);
    }
    if (!hardwareFingerprint) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "hardware_fingerprint is required"]);
    }

    const [byUuid, byFingerprint] = await Promise.all([
      SystemModel.getSystemHeartbeatByUuidTx(conn, systemUuid),
      SystemModel.getSystemHeartbeatByHardwareFingerprintTx(conn, hardwareFingerprint),
    ]);

    if (byUuid?.is_deleted || byFingerprint?.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    if (byUuid && byFingerprint && byUuid.id !== byFingerprint.id) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "system_id and hardware_fingerprint do not match"]);
    }

    const system = byUuid || byFingerprint;
    if (!system) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    return {
      success: true,
      restart_action: system.status === "restart",
      restart_interval: Number(system.restart_interval ?? 10),
    };
  });
};

export const createSystem = async (payload) => {
  return withTransaction(async (conn) => {
    const { clientId, client } = await resolveClientFromPayload(
      conn,
      payload.client_id,
    );
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    if (payload.installed_by_employee_id) {
      const employee = await EmployeeModel.getEmployeeByIdTx(
        conn,
        payload.installed_by_employee_id,
      );
      if (!employee) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
      }
    }

    const hardwareFingerprint = normalizeFingerprint(
      payload.hardware_fingerprint,
    );
    if (hardwareFingerprint) {
      const existing = await SystemModel.getSystemByHardwareFingerprintTx(
        conn,
        hardwareFingerprint,
      );
      if (existing) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "System already registered with this hardware fingerprint",
        ]);
      }
    }

    const systemId = await SystemModel.createSystem(conn, {
      system_uid: payload.system_uid,
      system_uuid: payload.system_uuid,
      hardware_fingerprint: hardwareFingerprint ?? null,
      client_id: clientId,
      device_type: payload.device_type || null,
      installed_by_employee_id: payload.installed_by_employee_id || null,
      installation_date: payload.installation_date || null,
      status: payload.status || "active",
      is_active: payload.is_active ?? 1,
      approval_status: payload.approval_status || "pending",
      system_info:
        normalizeFullResponse(
          buildCompactSystemInfo(
            payload.system_info ||
            payload.full_response?.system_info ||
            payload.full_response ||
            payload.json ||
            null,
            payload.device_type || null,
          ),
        ) || null,
    });

    return await buildSystemResponse(conn, systemId.id || systemId);
  });
};

export const updateSystem = async (systemId, payload) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdForUpdate(conn, systemId);

    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    let resolvedClientId;
    if (payload.client_id !== undefined) {
      const { clientId, client } = await resolveClientFromPayload(
        conn,
        payload.client_id,
      );
      if (!client) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
      }
      resolvedClientId = clientId;
    }

    if (
      payload.installed_by_employee_id !== undefined &&
      payload.installed_by_employee_id !== null
    ) {
      const employee = await EmployeeModel.getEmployeeByIdTx(
        conn,
        payload.installed_by_employee_id,
      );
      if (!employee) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
      }
    }

    const updateData = {};
    const assign = (key, value) => {
      if (value !== undefined) updateData[key] = value;
    };

    assign("system_uid", payload.system_uid);
    assign("system_uuid", payload.system_uuid);
    if (payload.hardware_fingerprint !== undefined) {
      assign(
        "hardware_fingerprint",
        normalizeFingerprint(payload.hardware_fingerprint),
      );
    }
    if (resolvedClientId !== undefined) {
      assign("client_id", resolvedClientId);
    }
    assign("device_type", payload.device_type);
    assign("installed_by_employee_id", payload.installed_by_employee_id);
    assign("installation_date", payload.installation_date);
    assign("status", payload.status);
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active ? 1 : 0;
    }
    if (
      payload.system_info !== undefined ||
      payload.full_response !== undefined
    ) {
      const incomingSystemInfo =
        payload.system_info ||
        payload.full_response?.system_info ||
        payload.full_response ||
        null;
      updateData.system_info = normalizeFullResponse(
        buildCompactSystemInfo(incomingSystemInfo, payload.device_type),
      );
    }

    await SystemModel.updateSystemDynamic(conn, systemId, updateData);

    return await buildSystemResponse(conn, systemId);
  });
};

export const updateSystemStatus = async (systemId, status) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdForUpdate(conn, systemId);

    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    await SystemModel.updateSystemDynamic(conn, systemId, { status });

    return await buildSystemResponse(conn, systemId);
  });
};

export const updateSystemApprovalStatus = async (systemId, approval_status) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdForUpdate(conn, systemId);

    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    await SystemModel.updateSystemDynamic(conn, systemId, {
      approval_status,
    });

    return await buildSystemResponse(conn, systemId);
  });
};

export const assignSystem = async (systemId, payload) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdForUpdate(conn, systemId);

    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    const employee = await EmployeeModel.getEmployeeByIdTx(
      conn,
      payload.employee_id,
    );

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const updateData = {
      installed_by_employee_id: payload.employee_id,
    };

    if (payload.installation_date !== undefined) {
      updateData.installation_date = payload.installation_date;
    }

    await SystemModel.updateSystemDynamic(conn, systemId, updateData);

    const updated = await buildSystemResponse(conn, systemId);

    if (employee?.email) {
      await sendDeviceAssignedEmail({
        email: employee.email,
        full_name: employee.full_name,
        device_uid: updated?.system_uid,
        device_type: updated?.meta?.device_type || updated?.device_type,
        client_name: updated?.client_name,
        installation_date: updated?.installation_date,
      });
    }

    return updated;
  });
};

// export const employeeSystemAssignmentAuth = async ({ e_unique_id, password }) => {
//   return withTransaction(async (conn) => {
//     const normalizedEmail = String(email || "").trim().toLowerCase();
//     if (!normalizedEmail || !password) {
//       throw new ApiError([
//         STATUS_CODES.BAD_REQUEST,
//         "email and password are required",
//       ]);
//     }

//     const employee = await EmployeeModel.getEmployeeForLogin(
//       conn,
//       normalizedEmail,
//     );

//     if (!employee) {
//       throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
//     }

//     if (employee.is_deleted) {
//       throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
//     }

//     if (employee.is_disabled) {
//       throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
//     }

//     if (!employee.is_verified) {
//       throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
//     }

//     const isPasswordMatch = await comparePassword(password, employee.password);
//     if (!isPasswordMatch) {
//       throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
//     }

//     const tokenPayload = {
//       employee_id: employee.id,
//       role: employee.role,
//     };
//     const token = jwt.sign(tokenPayload, JWT_SECRET, {
//       expiresIn: JWT_EXPIRY || "7d",
//     });

//     return {
//       token,
//       employee_id: employee.id,
//       employee_unique_id: employee.e_unique_id,
//       full_name: employee.full_name,
//       email: employee.email,
//     };
//   });
// };

export const employeeSystemAssignmentAuth = async ({ e_unique_id, password }) => {
  return withTransaction(async (conn) => {

    // ✅ normalize unique id
    const normalizedUniqueId = String(e_unique_id || "").trim();

    if (!normalizedUniqueId || !password) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "e_unique_id and password are required",
      ]);
    }

    // ✅ fetch employee by unique id
    const employee = await EmployeeModel.getEmployeeForLogin(
      conn,
      normalizedUniqueId
    );

    if (!employee) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
    }

    if (employee.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (employee.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    if (!employee.is_verified) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
    }

    // ✅ password match
    const isPasswordMatch = await comparePassword(password, employee.password);

    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
    }

    // ✅ generate token
    const tokenPayload = {
      employee_id: employee.id,
      role: employee.role,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY || "7d",
    });

    return {
      token,
      employee_id: employee.id,
      employee_unique_id: employee.e_unique_id,
      full_name: employee.full_name,
      email: employee.email,
    };
  });
};

export const unassignSystem = async (systemId) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdForUpdate(conn, systemId);

    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    const systemWithEmployee = await SystemModel.getSystemDetailsByIdTx(
      conn,
      systemId,
    );

    await SystemModel.updateSystemDynamic(conn, systemId, {
      installed_by_employee_id: null,
    });

    if (systemWithEmployee?.installed_by_employee_id) {
      const [employeeRow] = await conn.query(
        `SELECT email, full_name FROM employees WHERE id = ? LIMIT 1`,
        [systemWithEmployee.installed_by_employee_id],
      );
      const employee = employeeRow?.[0];
      if (employee?.email) {
        const meta = deriveSystemMeta(systemWithEmployee);
        await sendDeviceUnassignedEmail({
          email: employee.email,
          full_name: employee.full_name,
          device_uid: systemWithEmployee.system_uid,
          device_type: meta.device_type || systemWithEmployee.device_type,
          client_name: systemWithEmployee.client_name,
        });
      }
    }

    return await buildSystemResponse(conn, systemId);
  });
};

export const assignBulkSystem = async (payload) => {
  return withTransaction(async (conn) => {
    const systemIds = Array.isArray(payload.system_ids)
      ? [
        ...new Set(
          payload.system_ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ]
      : [];

    if (!systemIds.length) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "system_ids are required"]);
    }

    const { clientId, client } = await resolveClientFromPayload(
      conn,
      payload.client_id,
    );
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const systems = await SystemModel.getSystemsByIdsTx(conn, systemIds);
    if (systems.length !== systemIds.length) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    const deletedSystems = systems.filter((system) => system.is_deleted);
    if (deletedSystems.length) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "One or more systems are deleted",
      ]);
    }

    const activeSystemIds = systems.map((system) => system.id);
    const updatedCount = await SystemModel.bulkAssignSystemsToClient(
      conn,
      activeSystemIds,
      clientId,
    );

    return {
      client_id: clientId,
      system_ids: activeSystemIds,
      updated_count: updatedCount,
    };
  });
};

export const deleteSystem = async (systemId) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdForUpdate(conn, systemId);

    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    await SystemModel.softDeleteSystem(conn, systemId);

    return { id: systemId };
  });
};

export const blockSystemService = async (systemId, isBlock) => {
  return withTransaction(async (conn) => {
    const system = await SystemModel.getSystemByIdTx(conn, systemId);

    if (!system) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "System not found"]);
    }

    // const blockValue = normalizeBoolean(isBlock);
    // if (blockValue === undefined) {
    //   throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid block flag"]);
    // }

    await SystemModel.updateSystemDynamic(conn, systemId, {
      is_block: isBlock,
    });

    return await SystemModel.getSystemByIdTx(conn, systemId);
  });
};
