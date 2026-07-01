import http from "http";
import app from "./src/app.js";
import { env } from "./src/config/env.js";
import { checkDbConnection } from "./src/config/db.js";
import { initSocket } from "./src/sockets/index.js";
import "./src/cron/invoiceCron.js";

const startServer = async () => {
  await checkDbConnection();

  const server = http.createServer(app);

   // 🔥 init socket
  initSocket(server);

  server.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });
};

startServer();
