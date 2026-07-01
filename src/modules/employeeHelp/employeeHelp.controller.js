import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as EmployeeHelpService from "./employeeHelp.service.js";

export const createEmployeeHelp = apiHandler(async (req, res) => {
    const help = await EmployeeHelpService.createEmployeeHelp(req.body);

    return apiResponse(
        [STATUS_CODES.CREATED, "Employee help request created successfully"],
        "EmployeeHelp",
        help,
        res,
        "object"
    );
});

export const listEmployeeHelp = apiHandler(async (req, res) => {
    const { search, page, limit, employee_id } = req.query;

    const result = await EmployeeHelpService.listEmployeeHelp({
        search: search || "",
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        employee_id: employee_id ? Number(employee_id) : undefined,
    });

    return apiResponse(
        [STATUS_CODES.OK, "Employee help records fetched successfully"],
        "EmployeeHelp",
        result,
        res,
        "object"
    );
});

export const getEmployeeHelp = apiHandler(async (req, res) => {
    const id = Number(req.params.id);

    const help = await EmployeeHelpService.getEmployeeHelpById(id);

    return apiResponse(
        [STATUS_CODES.OK, "Employee help record fetched successfully"],
        "EmployeeHelp",
        help,
        res,
        "object"
    );
});

export const updateEmployeeHelp = apiHandler(async (req, res) => {
    const id = Number(req.params.id);

    const help = await EmployeeHelpService.updateEmployeeHelp(id, req.body);

    return apiResponse(
        [STATUS_CODES.OK, "Employee help record updated successfully"],
        "EmployeeHelp",
        help,
        res,
        "object"
    );
});

export const deleteEmployeeHelp = apiHandler(async (req, res) => {
    const id = Number(req.params.id);

    const result = await EmployeeHelpService.deleteEmployeeHelp(id);

    return apiResponse(
        [STATUS_CODES.OK, "Employee help record deleted successfully"],
        "EmployeeHelp",
        result,
        res,
        "object"
    );
});
