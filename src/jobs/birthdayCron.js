import cron from "node-cron";
import transporter from "../config/mailer.js";
import birthdayTemplate from "../templates/birthday.Template.js";
import { getTodayBirthdays } from "../services/birthday.services.js";

cron.schedule("0 9 * * *", async () => {
  try {
    console.log("Birthday Cron Running...");

    const clients = await getTodayBirthdays();

    for (const client of clients) {
      await transporter.sendMail({
        from: `"Swagt Rental" <${process.env.MAIL_USER}>`,
        to: client.email,
        subject: "🎉 Happy Birthday from Swagt Rental",
        html: birthdayTemplate(client.name),
      });
    }

    console.log(`${clients.length} mails sent`);
  } catch (error) {
    console.error(error);
  }
});