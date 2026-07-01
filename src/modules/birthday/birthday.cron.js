import cron from "node-cron";
import transporter from "../config/mailer.js";
import birthdayTemplate from "../templates/birthday.template.js";

import {
    getTodayBirthdays,
    markBirthdayMailSent,
} from "../services/birthday.service.js";

const birthdayCron = () => {

    cron.schedule("0 9 * * *", async () => {

        console.log("Birthday Cron Started");

        try {

            const clients = await getTodayBirthdays();

            console.log(`Found ${clients.length} birthday clients`);

            for (const client of clients) {

                try {

                    await transporter.sendMail({
                        from: `"Swagat Rental" <${process.env.MAIL_USER}>`,
                        to: client.email,
                        subject: "🎉 Happy Birthday",
                        html: birthdayTemplate(client.full_name),
                    });

                    await markBirthdayMailSent(client.id);

                    console.log(`Mail sent -> ${client.email}`);

                } catch (err) {

                    console.log(
                        `Mail failed -> ${client.email}`,
                        err.message
                    );

                }
            }

        } catch (err) {

            console.log(err);

        }

    });

};

export default birthdayCron;