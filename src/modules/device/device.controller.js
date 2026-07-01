import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as DeviceService from "./device.service.js";

export const createDevice = apiHandler(async (req, res) => {
  const device = await DeviceService.createDevice(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.deviceCreated],
    "Device",
    device,
    res,
    "object"
  );
});

export const listDevices = apiHandler(async (req, res) => {
  const { search, status, client_id, employee_id, page, limit } = req.query;

  const result = await DeviceService.listDevices({
    search,
    status,
    client_id: client_id ? Number(client_id) : undefined,
    employee_id: employee_id ? Number(employee_id) : undefined,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Devices",
    result,
    res,
    "object"
  );
});

export const getDevice = apiHandler(async (req, res) => {
  const deviceId = Number(req.params.id);

  const device = await DeviceService.getDeviceById(deviceId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceFetched],
    "Device",
    device,
    res,
    "object"
  );
});

export const updateDevice = apiHandler(async (req, res) => {
  const deviceId = Number(req.params.id);

  const device = await DeviceService.updateDevice(deviceId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUpdated],
    "Device",
    device,
    res,
    "object"
  );
});

export const updateDeviceStatus = apiHandler(async (req, res) => {
  const deviceId = Number(req.params.id);

  const device = await DeviceService.updateDeviceStatus(deviceId, req.body.status);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUpdated],
    "Device",
    device,
    res,
    "object"
  );
});

export const assignDevice = apiHandler(async (req, res) => {
  const deviceId = Number(req.params.id);

  const device = await DeviceService.assignDevice(deviceId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceAssigned],
    "Device",
    device,
    res,
    "object"
  );
});

export const unassignDevice = apiHandler(async (req, res) => {
  const deviceId = Number(req.params.id);

  const device = await DeviceService.unassignDevice(deviceId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceUnassigned],
    "Device",
    device,
    res,
    "object"
  );
});

export const deleteDevice = apiHandler(async (req, res) => {
  const deviceId = Number(req.params.id);

  const result = await DeviceService.deleteDevice(deviceId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.deviceDeleted],
    "Device",
    result,
    res,
    "object"
  );
});

export const storeSystemInfo = apiHandler(async (req, res) => {
  const device = await DeviceService.storeSystemInfo(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.deviceCreated],
    "Device",
    device,
    res,
    "object"
  );
});
