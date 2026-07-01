import { CUSTOM_ERROR, CUSTOM_SUCCESS } from "../../utils/message.util.js";
import { v4 as uuidv4 } from "uuid";
import { isEmpty } from "../../utils/misc.util.js";
import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import * as ChatService from "./chat.service.js";

export const uploadSocketFilesController = apiHandler(async (req, res) => {
  const file_url = req?.files
    ? req.files.map((file) => ({
       file_id : uuidv4(),
        url: file.location,
        key: file.key,
        file_type: file.mimetype,
        file_size: file.size
      }))
    : [];

  console.log("file_url", file_url);

  if (isEmpty(file_url)) {
    throw new ApiError(CUSTOM_ERROR, "Please upload files");
  }

  return apiResponse(
    CUSTOM_SUCCESS,
    "Image Upload successfully",
    file_url,
    res
  );
});

export const blockUser = apiHandler(async (req, res) => {
  const blockerId = req.user.user_id;
  const { user_id, reason = null } = req.body;

  const result = await ChatService.blockUser({
    blockerId,
    blockedId: user_id,
    reason,
  });

  return apiResponse(
    CUSTOM_SUCCESS,
    "User blocked successfully",
    result,
    res,
    "object"
  );
});

export const unblockUser = apiHandler(async (req, res) => {
  const blockerId = req.user.user_id;
  const { user_id } = req.body;

  const result = await ChatService.unblockUser({
    blockerId,
    blockedId: user_id,
  });

  return apiResponse(
    CUSTOM_SUCCESS,
    "User unblocked successfully",
    result,
    res,
    "object"
  );
});
