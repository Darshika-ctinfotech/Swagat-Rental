import express from "express";
import { arrayAWSChat } from "../../utils/aws.util.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import {
  uploadSocketFilesController,
  blockUser,
  unblockUser,
} from "./chat.controller.js";

const router = express.Router();

router.post("/upload-file", arrayAWSChat("", "files", 10), uploadSocketFilesController);
router.post("/block", authGuard, blockUser);
router.post("/unblock", authGuard, unblockUser);


export default router;
