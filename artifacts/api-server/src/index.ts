// Load Sentry FIRST so any errors during app bootstrap are captured.
import "./instrument";
import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty, seedMarketplaceIfEmpty } from "./lib/seed";
import { seedSuppliersIfEmpty } from "./lib/seedSuppliers";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void (async () => {
    await seedIfEmpty();
    await seedSuppliersIfEmpty();
    await seedMarketplaceIfEmpty();
  })();
});
