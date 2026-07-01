import STATUS_CODES from "../../constants/statusCodes.js";
import { apiHandler, apiResponse } from "../../utils/api.util.js";
import * as SystemCostQuoteService from "./systemCostQuote.service.js";

export const createSystemCostQuote = apiHandler(async (req, res) => {
  const record = await SystemCostQuoteService.createSystemCostQuote(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, "System cost quote record created successfully"],
    "System cost quote",
    record,
    res,
    "object"
  );
});

export const listSystemCostQuotes = apiHandler(async (req, res) => {
  const result = await SystemCostQuoteService.listSystemCostQuotes(req.query);

  return apiResponse(
    [STATUS_CODES.OK, "System cost quote records fetched successfully"],
    "System cost quotes",
    result,
    res,
    "object"
  );
});

export const getSystemCostQuote = apiHandler(async (req, res) => {
  const record = await SystemCostQuoteService.getSystemCostQuoteById(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "System cost quote record fetched successfully"],
    "System cost quote",
    record,
    res,
    "object"
  );
});

export const updateSystemCostQuote = apiHandler(async (req, res) => {
  const record = await SystemCostQuoteService.updateSystemCostQuote(
    Number(req.params.id),
    req.body
  );

  return apiResponse(
    [STATUS_CODES.OK, "System cost quote record updated successfully"],
    "System cost quote",
    record,
    res,
    "object"
  );
});

export const deleteSystemCostQuote = apiHandler(async (req, res) => {
  const result = await SystemCostQuoteService.deleteSystemCostQuote(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "System cost quote record deleted successfully"],
    "System cost quote",
    result,
    res,
    "object"
  );
});

export const getSystemCostQuoteSummary = apiHandler(async (req, res) => {
  const summary = await SystemCostQuoteService.getSystemCostQuoteSummary(
    req.query
  );

  return apiResponse(
    [STATUS_CODES.OK, "System cost quote summary fetched successfully"],
    "System cost quote summary",
    summary,
    res,
    "object"
  );
});
