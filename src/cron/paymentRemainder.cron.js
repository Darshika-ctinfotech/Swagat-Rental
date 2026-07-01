import cron from "node-cron";
import {
    processPaymentReminders
} from "../utils/paymentRemainder.services.js";

cron.schedule(
    "0 9 * * *",
    async () => {
        try {
            await processPaymentReminders();

            console.log(
                "Payment reminder cron completed"
            );
        } catch (err) {
            console.error(err);
        }
    }
);