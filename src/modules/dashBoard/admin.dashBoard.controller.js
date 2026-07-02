import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import * as DashboardService from "./admin.dashBoard.services.js"

export const getDashboardAnalytics = apiHandler(async (req, res) => {
   

    const result = await DashboardService.getDashboardAnalytics();

    return apiResponse(
        [STATUS_CODES.OK, "Dashboard analytics fetched successfully"],
        "Dashboard",
        result,
        res,
        "object"
    );
});