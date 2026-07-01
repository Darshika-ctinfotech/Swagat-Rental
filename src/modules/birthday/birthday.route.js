import { sendBirthdayMails } from "./birthday.controller.js";
import { Router } from "express";
const router = Router();

router.get("/send-birthday-mails", sendBirthdayMails);

export default Router;