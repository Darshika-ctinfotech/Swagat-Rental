import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as DeviceModel from "./device.model.js";
import * as UserModel from "../user/user.model.js";
import * as EmployeeModel from "../employee/employee.model.js";
import {
  sendDeviceAssignedEmail,
  sendDeviceUnassignedEmail,
} from "../../utils/email.util.js";

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

const buildAssetPayloads = (systemInfo, hardwareSnapshot) => {
  const cpu = systemInfo?.cpu || {};
  const baseboard = systemInfo?.baseboard || {};
  const graphicsController = systemInfo?.graphics?.controllers?.[0] || null;
  const display = systemInfo?.graphics?.displays?.[0] || null;
  const firstDisk = systemInfo?.hardDisks?.[0] || null;
  const firstRam = systemInfo?.ramModules?.[0] || null;

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
      value: hardwareSnapshot.processor,
      manufacturer: cpu.manufacturer || null,
      model: hardwareSnapshot.processor || null,
    },
    { type: "current_load", value: systemInfo.currentLoad },
    { type: "memory", value: systemInfo.mem },
    {
      type: "ram",
      value: {
        total_gb: hardwareSnapshot.ram_gb,
        serial_no: hardwareSnapshot.ram_serial_no,
        brand: hardwareSnapshot.ram_brand,
      },
      manufacturer:
        hardwareSnapshot.ram_brand || firstRam?.manufacturer || null,
      serial_number: hardwareSnapshot.ram_serial_no || firstRam?.serialNum || null,
      model: hardwareSnapshot.ram_gb ? `${hardwareSnapshot.ram_gb} GB` : null,
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
        ssd_gb: hardwareSnapshot.ssd_gb,
        ssd_serial_no: hardwareSnapshot.ssd_serial_no,
      },
      serial_number: hardwareSnapshot.ssd_serial_no || firstDisk?.serialNum || null,
      model: hardwareSnapshot.ssd_gb
        ? `${hardwareSnapshot.ssd_gb} GB`
        : firstDisk?.name || null,
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
    { type: "network", value: systemInfo.network },
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
      value: hardwareSnapshot.motherboard,
      manufacturer: baseboard.manufacturer || null,
      model:
        hardwareSnapshot.motherboard || baseboard.model || null,
    },
    {
      type: "mac_address",
      value: hardwareSnapshot.mac_address,
      serial_number: hardwareSnapshot.mac_address || null,
    },
    { type: "ip_address", value: hardwareSnapshot.ip_address },
    {
      type: "device_name",
      value: hardwareSnapshot.device_name,
      model: hardwareSnapshot.device_name || null,
    },
    {
      type: "device_uuid",
      value: hardwareSnapshot.device_uuid,
      serial_number: hardwareSnapshot.device_uuid || null,
    },
  ].filter((item) => item.value !== undefined && item.value !== null);
};

const buildExistingAssetMap = (device) => {
  const map = {};

  if (device?.inventory_ids) {
    try {
      const parsed = JSON.parse(device.inventory_ids);
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
        Object.assign(map, parsed);
      }
    } catch (err) {
      // ignore malformed inventory_ids
    }
  }

  if (device?.processor) map.processor = device.processor;
  if (device?.motherboard) map.motherboard = device.motherboard;
  if (device?.mac_address) map.mac_address = device.mac_address;
  if (device?.ip_address) map.ip_address = device.ip_address;

  const ramId = device?.ram_gb || device?.ram_serial_no || device?.ram_brand;
  if (ramId) map.ram = ramId;

  const romId = device?.ssd_gb || device?.ssd_serial_no;
  if (romId) map.rom = romId;

  return map;
};

const upsertAssetsForDevice = async (
  conn,
  device,
  systemInfo,
  hardwareSnapshot
) => {
  const typeMap = await DeviceModel.getInventoryTypeMap(conn);
  const payloads = buildAssetPayloads(systemInfo, hardwareSnapshot);
  const existingMap = buildExistingAssetMap(device);
  const mapByType = { ...existingMap };
  const idsByType = {};
  const assetIds = [];

  for (const payload of payloads) {
    const categoryId = typeMap.get(payload.type);
    if (!categoryId) continue;

    const assetData = {
      asset_category_id: categoryId,
      brand: payload.brand || payload.manufacturer || null,
      model: payload.model || null,
      serial_number: payload.serial_number || null,
      manufacturer: payload.manufacturer || null,
      spec_json: normalizeSpecJson(payload.value),
      status: payload.status || "rented",
    };

    let assetId = existingMap[payload.type];
    if (assetId) {
      await DeviceModel.updateInventoryDynamic(conn, assetId, assetData);
    } else {
      assetId = await DeviceModel.createInventory(conn, assetData);
    }

    mapByType[payload.type] = assetId;
    assetIds.push(assetId);

    if (
      payload.type === "processor" ||
      payload.type === "motherboard" ||
      payload.type === "mac_address" ||
      payload.type === "ip_address" ||
      payload.type === "ram" ||
      payload.type === "rom"
    ) {
      idsByType[payload.type] = assetId;
    }
  }

  return { assetIds, idsByType, mapByType };
};

const getDeviceUuidFromSystem = (systemInfo = {}) => {
  const uuidObj = systemInfo.uuid || {};
  return uuidObj.hardware || uuidObj.os || null;
};

const pickPrimaryNetwork = (list = []) => {
  if (!Array.isArray(list)) return null;
  return (
    list.find(
      (n) =>
        n &&
        !n.internal &&
        n.mac &&
        n.mac !== "00:00:00:00:00:00"
    ) || list.find((n) => n && n.mac)
  );
};

const bytesToGb = (value) => {
  if (!value || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) / 1024 / 1024 / 1024);
};

export const createDevice = async (payload) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, payload.client_id);
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    if (payload.installed_by_employee_id) {
      const employee = await EmployeeModel.getEmployeeByIdTx(
        conn,
        payload.installed_by_employee_id
      );
      if (!employee) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
      }
    }

    if (payload.device_uuid) {
      const existing = await DeviceModel.getDeviceByUuidTx(
        conn,
        payload.device_uuid
      );
      if (existing) {
        if (existing.client_id !== payload.client_id) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "Device already mapped to another client",
          ]);
        }
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "Device already exists",
        ]);
      }
    }

    const fullResponse = normalizeFullResponse(payload.full_response);
    const inventoryIds =
      payload.inventory_ids !== undefined
        ? Array.isArray(payload.inventory_ids) ||
          (payload.inventory_ids &&
            typeof payload.inventory_ids === "object")
          ? JSON.stringify(payload.inventory_ids)
          : payload.inventory_ids
        : null;

    const deviceData = {
      device_uid: payload.device_uid,
      device_uuid: payload.device_uuid || null,
      device_name: payload.device_name || null,
      inventory_ids: inventoryIds,
      device_type: payload.device_type,
      client_id: payload.client_id,
      installed_by_employee_id: payload.installed_by_employee_id || null,
      installation_date: payload.installation_date || null,
      status: payload.status || "active",
      warranty_start_date: payload.warranty_start_date || null,
      warranty_end_date: payload.warranty_end_date || null,
      is_warranty_active: payload.is_warranty_active ? 1 : 0,
      processor: payload.processor || null,
      motherboard: payload.motherboard || null,
      mac_address: payload.mac_address || null,
      ip_address: payload.ip_address || null,
      ram_gb: payload.ram_gb || null,
      ram_serial_no: payload.ram_serial_no || null,
      ram_brand: payload.ram_brand || null,
      ssd_gb: payload.ssd_gb || null,
      ssd_serial_no: payload.ssd_serial_no || null,
      full_response: fullResponse !== undefined ? fullResponse : null,
    };

    const deviceId = await DeviceModel.createDevice(conn, deviceData);

    return await DeviceModel.getDeviceByIdTx(conn, deviceId);
  });
};

export const storeSystemInfo = async (payload) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByUniqueIdTx(
      conn,
      payload.client_unique_id
    );
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const systemInfo = payload.system_info || {};
    const deviceUuid =
      payload.device_uuid || getDeviceUuidFromSystem(systemInfo);
    const networkList = systemInfo.network || [];
    const primaryNetwork = pickPrimaryNetwork(networkList);
    const macAddress = payload.mac_address || primaryNetwork?.mac || null;
    const ipAddress = payload.ip_address || primaryNetwork?.ip4 || null;

    const deviceType =
      payload.device_type ||
      systemInfo?.osInfo?.distro ||
      systemInfo?.osInfo?.platform ||
      "Unknown Device";

    const ramModules = systemInfo.ramModules || [];
    const hardDisks = systemInfo.hardDisks || [];
    const firstRam = ramModules[0];
    const firstDisk = hardDisks[0];

    const hardwareSnapshot = {
      processor: systemInfo?.cpu?.brand || systemInfo?.cpu?.manufacturer || null,
      motherboard:
        systemInfo?.baseboard?.model ||
        systemInfo?.baseboard?.manufacturer ||
        null,
      mac_address: macAddress,
      ip_address: ipAddress,
      ram_gb: bytesToGb(systemInfo?.mem?.total) || null,
      ram_serial_no: firstRam?.serialNum || null,
      ram_brand: firstRam?.manufacturer || null,
      ssd_gb: bytesToGb(firstDisk?.size) || null,
      ssd_serial_no: firstDisk?.serialNum || null,
      device_name:
        payload.device_name ||
        systemInfo?.osInfo?.hostname ||
        systemInfo?.osInfo?.fqdn ||
        null,
      device_uuid: deviceUuid,
    };

    const updateData = {
      device_uid: payload.device_uid,
      device_uuid: deviceUuid,
      device_name:
        payload.device_name ||
        systemInfo?.osInfo?.hostname ||
        systemInfo?.osInfo?.fqdn ||
        null,
      device_type: deviceType,
      client_id: client.id,
      installed_by_employee_id: payload.installed_by_employee_id || null,
      installation_date: payload.installation_date || null,
      status: payload.status || "active",
      warranty_start_date: payload.warranty_start_date || null,
      warranty_end_date: payload.warranty_end_date || null,
      is_warranty_active: payload.is_warranty_active ? 1 : 0,
      processor: null,
      motherboard: null,
      mac_address: null,
      ip_address: null,
      ram_gb: null,
      ram_serial_no: null,
      ram_brand: null,
      ssd_gb: null,
      ssd_serial_no: null,
      full_response: normalizeFullResponse(systemInfo),
    };

    const latestInfo = updateData.full_response;

    let existing = null;
    if (payload.device_uid) {
      existing = await DeviceModel.getDeviceByUidTx(conn, payload.device_uid);
      if (existing && existing.client_id !== client.id) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Device already mapped to another client"]);
      }
    }
    if (!existing && deviceUuid) {
      existing = await DeviceModel.getDeviceByUuidTx(conn, deviceUuid);
      if (existing && existing.client_id !== client.id) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Device already mapped to another client"]);
      }
    }
    if (!existing && macAddress) {
      existing = await DeviceModel.getDeviceByMacTx(conn, client.id, macAddress);
    }

    if (existing) {
      if (existing.is_deleted) {
        updateData.is_deleted = 0;
      }
      await DeviceModel.updateDeviceDynamic(conn, existing.id, updateData);
      const deviceMapping = await DeviceModel.getDeviceInventoryMappingTx(
        conn,
        existing.id
      );
      const { assetIds, idsByType, mapByType } = await upsertAssetsForDevice(
        conn,
        deviceMapping,
        systemInfo,
        hardwareSnapshot
      );
      if (assetIds.length) {
        const mappingUpdate = {
          inventory_ids: JSON.stringify(mapByType),
          processor: idsByType.processor || null,
          motherboard: idsByType.motherboard || null,
          mac_address: idsByType.mac_address || null,
          ip_address: idsByType.ip_address || null,
          ram_gb: idsByType.ram || null,
          ram_serial_no: idsByType.ram || null,
          ram_brand: idsByType.ram || null,
          ssd_gb: idsByType.rom || null,
          ssd_serial_no: idsByType.rom || null,
        };
        await DeviceModel.updateDeviceDynamic(conn, existing.id, {
          ...mappingUpdate,
        });
      }
      return await DeviceModel.getDeviceByIdTx(conn, existing.id);
    }

    const deviceId = await DeviceModel.createDevice(conn, updateData);
    const { assetIds, idsByType, mapByType } = await upsertAssetsForDevice(
      conn,
      null,
      systemInfo,
      hardwareSnapshot
    );
    if (assetIds.length) {
      const mappingUpdate = {
        inventory_ids: JSON.stringify(mapByType),
        processor: idsByType.processor || null,
        motherboard: idsByType.motherboard || null,
        mac_address: idsByType.mac_address || null,
        ip_address: idsByType.ip_address || null,
        ram_gb: idsByType.ram || null,
        ram_serial_no: idsByType.ram || null,
        ram_brand: idsByType.ram || null,
        ssd_gb: idsByType.rom || null,
        ssd_serial_no: idsByType.rom || null,
      };
      await DeviceModel.updateDeviceDynamic(conn, deviceId, {
        ...mappingUpdate,
      });
    }
    return await DeviceModel.getDeviceByIdTx(conn, deviceId);
  });
};

export const listDevices = async (query) => {
  return withTransaction(async (conn) => {
    const result = await DeviceModel.listDevices(conn, query);
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

export const getDeviceById = async (deviceId) => {
  return withTransaction(async (conn) => {
    const device = await DeviceModel.getDeviceByIdTx(conn, deviceId);

    if (!device) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.deviceNotFound]);
    }

    let inventoryIds = [];
    if (device.inventory_ids) {
      try {
        const parsed = JSON.parse(device.inventory_ids);
        if (Array.isArray(parsed)) {
          inventoryIds = parsed.filter((id) => !!id);
        } else if (parsed && typeof parsed === "object") {
          inventoryIds = Object.values(parsed).filter((id) => !!id);
        }
      } catch (err) {
        inventoryIds = [];
      }
    }

    if (!inventoryIds.length) {
      inventoryIds = [
        device.processor,
        device.motherboard,
        device.mac_address,
        device.ip_address,
        device.ram_gb,
        device.ram_serial_no,
        device.ram_brand,
        device.ssd_gb,
        device.ssd_serial_no,
      ].filter((id) => !!id);
    }

    if (inventoryIds.length) {
      const rows = await DeviceModel.getInventoryDetailsByIds(
        conn,
        inventoryIds
      );
      const inventoryMap = new Map();
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

      rows.forEach((row) => {
        const type = row.asset_category_name || row.inventory_type_name;
        if (!inventoryMap.has(type)) {
          inventoryMap.set(type, { type, asset_id: row.asset_id, details: {} });
        }

        const details = inventoryMap.get(type).details;
        const parsedSpec = parseDetailValue(row.spec_json);

        if (parsedSpec && typeof parsedSpec === "object" && !Array.isArray(parsedSpec)) {
          Object.assign(details, parsedSpec);
        } else if (parsedSpec !== null && parsedSpec !== undefined) {
          details.spec = parsedSpec;
        }

        if (row.brand !== null && row.brand !== undefined) details.brand = row.brand;
        if (row.model !== null && row.model !== undefined) details.model = row.model;
        if (row.serial_number !== null && row.serial_number !== undefined)
          details.serial_number = row.serial_number;
        if (row.manufacturer !== null && row.manufacturer !== undefined)
          details.manufacturer = row.manufacturer;
        if (row.status !== null && row.status !== undefined) details.status = row.status;
      });

      device.inventory = Array.from(inventoryMap.values());
    } else {
      device.inventory = [];
    }

    delete device.inventory_ids;
    delete device.processor;
    delete device.motherboard;
    delete device.mac_address;
    delete device.ip_address;
    delete device.ram_gb;
    delete device.ram_serial_no;
    delete device.ram_brand;
    delete device.ssd_gb;
    delete device.ssd_serial_no;

    return device;
  });
};

export const updateDevice = async (deviceId, payload) => {
  return withTransaction(async (conn) => {
    const device = await DeviceModel.getDeviceByIdForUpdate(conn, deviceId);

    if (!device || device.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.deviceNotFound]);
    }

    if (payload.client_id && payload.client_id !== device.client_id) {
      const client = await UserModel.getClientByIdTx(conn, payload.client_id);
      if (!client) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
      }
    }

    if (
      payload.device_uuid &&
      payload.device_uuid !== device.device_uuid
    ) {
      const existing = await DeviceModel.getDeviceByUuidTx(
        conn,
        payload.device_uuid
      );
      if (existing && existing.id !== deviceId) {
        if (existing.client_id !== device.client_id) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "Device already mapped to another client",
          ]);
        }
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "Device already exists",
        ]);
      }
    }

    if (
      payload.installed_by_employee_id !== undefined &&
      payload.installed_by_employee_id !== null
    ) {
      const employee = await EmployeeModel.getEmployeeByIdTx(
        conn,
        payload.installed_by_employee_id
      );
      if (!employee) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
      }
    }

    const updateData = {};

    const assign = (key, value) => {
      if (value !== undefined) updateData[key] = value;
    };

    assign("device_uid", payload.device_uid);
    assign("device_uuid", payload.device_uuid);
    assign("device_name", payload.device_name);
    if (payload.inventory_ids !== undefined) {
      updateData.inventory_ids =
        Array.isArray(payload.inventory_ids) ||
        (payload.inventory_ids && typeof payload.inventory_ids === "object")
          ? JSON.stringify(payload.inventory_ids)
          : payload.inventory_ids;
    }
    assign("device_type", payload.device_type);
    assign("client_id", payload.client_id);
    assign("installed_by_employee_id", payload.installed_by_employee_id);
    assign("installation_date", payload.installation_date);
    assign("status", payload.status);
    assign("warranty_start_date", payload.warranty_start_date);
    assign("warranty_end_date", payload.warranty_end_date);
    if (payload.is_warranty_active !== undefined) {
      updateData.is_warranty_active = payload.is_warranty_active ? 1 : 0;
    }
    assign("processor", payload.processor);
    assign("motherboard", payload.motherboard);
    assign("mac_address", payload.mac_address);
    assign("ip_address", payload.ip_address);
    assign("ram_gb", payload.ram_gb);
    assign("ram_serial_no", payload.ram_serial_no);
    assign("ram_brand", payload.ram_brand);
    assign("ssd_gb", payload.ssd_gb);
    assign("ssd_serial_no", payload.ssd_serial_no);

    if (payload.full_response !== undefined) {
      updateData.full_response = normalizeFullResponse(payload.full_response);
    }

    await DeviceModel.updateDeviceDynamic(conn, deviceId, updateData);

    return await DeviceModel.getDeviceByIdTx(conn, deviceId);
  });
};

export const updateDeviceStatus = async (deviceId, status) => {
  return withTransaction(async (conn) => {
    const device = await DeviceModel.getDeviceByIdForUpdate(conn, deviceId);

    if (!device || device.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.deviceNotFound]);
    }

    await DeviceModel.updateDeviceDynamic(conn, deviceId, {
      status,
    });

    return await DeviceModel.getDeviceByIdTx(conn, deviceId);
  });
};

export const assignDevice = async (deviceId, payload) => {
  return withTransaction(async (conn) => {
    const device = await DeviceModel.getDeviceByIdForUpdate(conn, deviceId);

    if (!device || device.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.deviceNotFound]);
    }

    const employee = await EmployeeModel.getEmployeeByIdTx(
      conn,
      payload.employee_id
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

    await DeviceModel.updateDeviceDynamic(conn, deviceId, updateData);

    const updated = await DeviceModel.getDeviceByIdTx(conn, deviceId);

    if (employee?.email) {
      await sendDeviceAssignedEmail({
        email: employee.email,
        full_name: employee.full_name,
        device_uid: updated?.device_uid,
        device_type: updated?.device_type,
        client_name: updated?.client_name,
        installation_date: updated?.installation_date,
      });
    }

    return updated;
  });
};

export const unassignDevice = async (deviceId) => {
  return withTransaction(async (conn) => {
    const device = await DeviceModel.getDeviceByIdForUpdate(conn, deviceId);

    if (!device || device.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.deviceNotFound]);
    }

    const deviceWithEmployee = await DeviceModel.getDeviceByIdTx(conn, deviceId);

    await DeviceModel.updateDeviceDynamic(conn, deviceId, {
      installed_by_employee_id: null,
    });

    if (deviceWithEmployee?.installed_by_employee_id) {
      const [employeeRow] = await conn.query(
        `SELECT email, full_name FROM employees WHERE id = ? LIMIT 1`,
        [deviceWithEmployee.installed_by_employee_id]
      );
      const employee = employeeRow?.[0];
      if (employee?.email) {
        await sendDeviceUnassignedEmail({
          email: employee.email,
          full_name: employee.full_name,
          device_uid: deviceWithEmployee.device_uid,
          device_type: deviceWithEmployee.device_type,
          client_name: deviceWithEmployee.client_name,
        });
      }
    }

    return await DeviceModel.getDeviceByIdTx(conn, deviceId);
  });
};

export const deleteDevice = async (deviceId) => {
  return withTransaction(async (conn) => {
    const device = await DeviceModel.getDeviceByIdForUpdate(conn, deviceId);

    if (!device || device.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.deviceNotFound]);
    }

    await DeviceModel.softDeleteDevice(conn, deviceId);

    return { id: deviceId };
  });
};


