import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as HelpService from "./help.service.js";

export const createHelp = apiHandler(async (req, res) => {
    const help = await HelpService.createHelp(req.body);

    return apiResponse(
        [STATUS_CODES.CREATED, "Help request created successfully"],
        "Help",
        help,
        res,
        "object"
    );
});

export const listHelp = apiHandler(async (req, res) => {
    const { search, page, limit } = req.query;

    const result = await HelpService.listHelp({
        search: search || "",
        page: Number(page) || 1,
        limit: Number(limit) || 20,
    });

    return apiResponse(
        [STATUS_CODES.OK, "Help records fetched successfully"],
        "Help",
        result,
        res,
        "object"
    );
});

export const getHelp = apiHandler(async (req, res) => {
    const id = Number(req.params.id);

    const help = await HelpService.getHelpById(id);

    return apiResponse(
        [STATUS_CODES.OK, "Help record fetched successfully"],
        "Help",
        help,
        res,
        "object"
    );
});

export const updateHelp = apiHandler(async (req, res) => {
    const id = Number(req.params.id);

    const help = await HelpService.updateHelp(id, req.body);

    return apiResponse(
        [STATUS_CODES.OK, "Help record updated successfully"],
        "Help",
        help,
        res,
        "object"
    );
});

export const deleteHelp = apiHandler(async (req, res) => {
    const id = Number(req.params.id);

    const result = await HelpService.deleteHelp(id);

    return apiResponse(
        [STATUS_CODES.OK, "Help record deleted successfully"],
        "Help",
        result,
        res,
        "object"
    );
});
