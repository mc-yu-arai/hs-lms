import { env } from "./config/env";
import { createApp } from "./app";
import { startNotificationCron } from "./lib/notificationCron";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`HS-LMS backend listening on http://localhost:${env.PORT}`);
  startNotificationCron();
});
