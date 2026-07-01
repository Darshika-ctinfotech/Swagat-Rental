import si from "systeminformation";
import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as SystemService from "./system.service.js";

export const getSystemInfo = async (req, res) => {
  try {
    const [
      time,
      osInfo,
      cpu,
      currentLoad,
      mem,
      memLayout,
      diskLayout,
      fsSize,
      graphics,
      netIfaces,
      battery,
      uuid,
      baseboard,
    ] = await Promise.all([
      si.time(),
      si.osInfo(),
      si.cpu(),
      si.currentLoad(),
      si.mem(),
      si.memLayout(),
      si.diskLayout(),
      si.fsSize(),
      si.graphics(),
      si.networkInterfaces(),
      si.battery(),
      si.uuid(),
      si.baseboard(),
    ]);

    const ipList = netIfaces.map((n) => ({
      iface: n.iface,
      ip4: n.ip4,
      ip6: n.ip6,
      mac: n.mac,
      internal: n.internal,
    }));

    const ramModules = memLayout.map((m) => ({
      size: m.size,
      type: m.type,
      clockSpeed: m.clockSpeed,
      manufacturer: m.manufacturer,
      serialNum: m.serialNum || "N/A",
    }));

    const hardDisks = diskLayout.map((d) => ({
      name: d.name,
      type: d.type,
      interfaceType: d.interfaceType,
      size: d.size,
      serialNum: d.serialNum || "N/A",
    }));

    res.json({
      time,
      osInfo,
      cpu,
      currentLoad,
      mem,
      ramModules,
      hardDisks,
      fsSize,
      graphics,
      network: ipList,
      battery,
      uuid,
      baseboard,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch system info",
      details: err?.message,
    });
  }
};

export const addPcInfo = apiHandler(async (req, res) => {
  if (!req.user?.employee_id) {
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      success: false,
      message: "Employee token is required.",
      code: STATUS_CODES.UNAUTHORIZED,
    });
  }

  req.body.installed_by_employee_id = req.user.employee_id;
  const result = await SystemService.addPcInfo(req.body);
  console.log('result', result)
  return res.status(STATUS_CODES.CREATED).json({
    success: true,
    message: Msg.systemInfoStored || "System info stored successfully.",
    code: STATUS_CODES.CREATED,
    ...result,
  });
});

export const employeeSystemAssignmentAuth = apiHandler(async (req, res) => {
  const result = await SystemService.employeeSystemAssignmentAuth(req.body);

  return apiResponse(
    [STATUS_CODES.OK, "Authenticated successfully"],
    "Employee",
    result,
    res,
    "object"
  );
});

export const addSystemSnapshot = apiHandler(async (req, res) => {
  const result = await SystemService.addSystemSnapshot(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.systemInfoStored || "System snapshot stored"],
    "System",
    result,
    res,
    "object"
  );
});

export const listSystems = apiHandler(async (req, res) => {
  const { search, status, client_id, employee_id, device_type, page, limit } =
    req.query;

  const result = await SystemService.listSystems({
    search,
    status,
    client_id: client_id ? Number(client_id) : undefined,
    employee_id: employee_id ? Number(employee_id) : undefined,
    device_type,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Systems",
    result,
    res,
    "object"
  );
});

export const getSystem = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const system = await SystemService.getSystemById(systemId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceFetched],
    "System",
    system,
    res,
    "object"
  );
});

export const getSystemStatusByUid = apiHandler(async (req, res) => {
  const { system_uid } = req.params;
  const result = await SystemService.getSystemStatusByUid(system_uid);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceFetched],
    "System",
    result,
    res,
    "object"
  );
});

export const systemHeartbeat = apiHandler(async (req, res) => {
  const payload = {
    system_id: req.body?.system_id,
    hardware_fingerprint: req.body?.hardware_fingerprint,
  };

  const result = await SystemService.systemHeartbeat(payload);
  return res.status(STATUS_CODES.OK).json(result);
});

export const createSystem = apiHandler(async (req, res) => {
  const system = await SystemService.createSystem(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.deviceCreated],
    "System",
    system,
    res,
    "object"
  );
});

export const updateSystem = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const system = await SystemService.updateSystem(systemId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUpdated],
    "System",
    system,
    res,
    "object"
  );
});

export const updateSystemStatus = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const system = await SystemService.updateSystemStatus(systemId, req.body.status);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUpdated],
    "System",
    system,
    res,
    "object"
  );
});

export const updateSystemApprovalStatus = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const system = await SystemService.updateSystemApprovalStatus(systemId, req.body.approval_status);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUpdated],
    "System",
    system,
    res,
    "object"
  );
})

export const assignSystem = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const system = await SystemService.assignSystem(systemId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceAssigned],
    "System",
    system,
    res,
    "object"
  );
});

export const unassignSystem = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const system = await SystemService.unassignSystem(systemId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUnassigned],
    "System",
    system,
    res,
    "object"
  );
});

export const assignBulkSystem = apiHandler(async (req, res) => {
  const system = await SystemService.assignBulkSystem(req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceAssigned],
    "System",
    system,
    res,
    "object"
  );
})

export const deleteSystem = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  const result = await SystemService.deleteSystem(systemId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceDeleted],
    "System",
    result,
    res,
    "object"
  );
});



export const blockSystem = apiHandler(async (req, res) => {
  const systemId = Number(req.params.id);
  console.log('systemId, req.body.is_block', systemId, req.body.is_block);

  const system = await SystemService.blockSystemService(systemId, req.body.is_block);
  return apiResponse(
    [STATUS_CODES.OK, "System updated successfully"],
    "System",
    system,
    res,
    "object"
  );
});
