// Process entry point for production / process managers (pm2, systemd, Docker).
// A thin wrapper so the server starts regardless of how argv[1] is set by the
// launcher. Tests import server/index.mjs directly and never call start().
import { start } from "./index.mjs";

start();
