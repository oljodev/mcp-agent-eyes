/** Server identity. The version is read from package.json, next to dist/. */

import { readFileSync } from "node:fs";

export const SERVER_NAME = "agent-eyes";

/** Single source of truth for the version: package.json, next to dist/. */
export const SERVER_VERSION: string = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;
