import cron from "node-cron";
import { checkAndNotifyAgreementStatus } from "../modules/admin/admin.service.js";

export const initAgreementStatusCron = () => {
  // every 15 minutes — adjust as needed
  //cron.schedule("*/15 * * * *", async () => {
      cron.schedule("*/15 * * * *", async () => {
    console.log("[Cron] Checking agreement status changes...");
    try {
      const result = await checkAndNotifyAgreementStatus();
      console.log("[Cron] Agreement status check result:", result);
    } catch (err) {
      console.error("[Cron] Agreement status cron failed:", err);
    }
  });

  console.log("[Cron] Agreement status cron initialized.");
};