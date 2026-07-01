import cron from "node-cron";
import { runInvoiceGeneration } from "../modules/invoice/invoice.service.js";
import { runAgreementExpiryCron } from "../modules/agreement/agreement.service.js";

// 🧾 Invoice Cron → Daily at 1 AM
cron.schedule("0 1 * * *", async () => {
  console.log("Running invoice cron...");
  try {
    await runInvoiceGeneration();
    console.log("Invoice cron completed");
  } catch (err) {
    console.error("Invoice cron failed:", err);
  }
});

// 📄 Agreement Expiry Cron → Daily at 2 AM
cron.schedule("0 2 * * *", async () => {
  console.log("Running agreement expiry cron...");
  try {
    await runAgreementExpiryCron();
    console.log("Agreement expiry cron completed");
  } catch (err) {
    console.error("Agreement expiry cron failed:", err);
  }
});