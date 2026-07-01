import STATUS_CODES from "../../constants/statusCodes.js";
import { apiHandler, apiResponse } from "../../utils/api.util.js";
import * as LeadsService from "./leads.service.js";

export const createLead = apiHandler(async (req, res) => {
  const lead = await LeadsService.createLead(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, "Lead created successfully"],
    "Lead",
    lead,
    res,
    "object"
  );
});

export const listLeads = apiHandler(async (req, res) => {
  const result = await LeadsService.listLeads(req.query);

  return apiResponse(
    [STATUS_CODES.OK, "Leads fetched successfully"],
    "Leads",
    result,
    res,
    "object"
  );
});

export const getLead = apiHandler(async (req, res) => {
  const lead = await LeadsService.getLeadById(Number(req.params.id));

  return apiResponse(
    [STATUS_CODES.OK, "Lead fetched successfully"],
    "Lead",
    lead,
    res,
    "object"
  );
});

export const updateLead = apiHandler(async (req, res) => {
  const lead = await LeadsService.updateLead(Number(req.params.id), req.body);

  return apiResponse(
    [STATUS_CODES.OK, "Lead updated successfully"],
    "Lead",
    lead,
    res,
    "object"
  );
});

export const updateLeadStatus = apiHandler(async (req, res) => {
  const lead = await LeadsService.updateLeadStatus(
    Number(req.params.id),
    req.body.status
  );

  return apiResponse(
    [STATUS_CODES.OK, "Lead status updated successfully"],
    "Lead",
    lead,
    res,
    "object"
  );
});

export const deleteLead = apiHandler(async (req, res) => {
  const result = await LeadsService.deleteLead(Number(req.params.id));

  return apiResponse(
    [STATUS_CODES.OK, "Lead deleted successfully"],
    "Lead",
    result,
    res,
    "object"
  );
});
