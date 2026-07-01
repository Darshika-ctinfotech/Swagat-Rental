//Updated By Darshika

import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { CORS_ORIGIN, PORT } from "./constants.js";
import { convertDatesToIst } from "./utils/time.util.js";

//code By Darshika 
import { sendPushToAllClients } from "../notificationService.js"; 
const __dirname = path.dirname(fileURLToPath(import.meta.url));

//Agreement Cron Activate
import { initAgreementStatusCron } from "./cron/agreementStatusCron.js";
initAgreementStatusCron();
//==================
const app = express();
import "./cron/paymentRemainder.cron.js";

// Birthday Cron Activate
import birthdayCron from "./cron/birthdayCron.js";
birthdayCron();
app.use(express.static(path.join(__dirname)));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors({ credentials: true, origin: CORS_ORIGIN }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/", express.static(path.join(__dirname, "assets")));
app.use("/", express.static(path.join(__dirname, "public")));

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(convertDatesToIst(body));
  next();
});

app.use("/api", routes);
/**
 * 💾 CLIENT TOKEN SAVE ENDPOINT
 * URL: http://localhost:8011/api/tokens/save
 * Method: POST
 */
app.post("/api/tokens/save", async (req, res) => {
  const { userId, token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: "Token is required" });
  }

  try {
    // 💡 Kyunki abhi aap sirf manual testing kar rahe hain, hum clients table mein 
    // id = 1 (ya jo bhi aapki table mein pehli row ho) par token update kar dete hain.
    const query = `
      UPDATE clients 
      SET fcm_token = ? 
      WHERE id = 1; 
    `;

    // Database mein execute karein
    const [result] = await pool.query(query, [token]);

    console.log("💾 Real Browser Token MySQL Database mein save ho gaya hai!");

    return res.status(200).json({ 
      success: true, 
      message: "Token successfully updated in clients table." 
    });

  } catch (error) {
    console.error("❌ Database error while saving token:", error);
    return res.status(500).json({ success: false, error: "Database internal error." });
  }
});
app.get("/", (req, res) => {
  res.send(`App is running on port: ${PORT}`);
});


app.use(errorHandler);

export default app;
