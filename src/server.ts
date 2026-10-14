/**
 * Assembles the MCP server: one McpServer, then each feature's register
 * function wires its tools onto it. evaluate_script registers itself only when
 * AGENT_EYES_ALLOW_EVAL=1, so a default install ships no eval surface.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SERVER_NAME, SERVER_VERSION } from "./version.js";
import { registerCaptureTools } from "./tools/register/capture.js";
import { registerCaptureElementTool } from "./tools/register/capture-element.js";
import { registerLabelInteractivesTool } from "./tools/register/label-interactives.js";
import { registerBreakpointsTool } from "./tools/register/breakpoints.js";
import { registerLayoutShiftTool } from "./tools/register/layout-shift.js";
import { registerDiffRegionsTool } from "./tools/register/diff-regions.js";
import { registerBaselineTool } from "./tools/register/baseline.js";
import { registerLayoutTool } from "./tools/register/layout.js";
import { registerInteractTools } from "./tools/register/interact.js";
import { registerMeasureTool } from "./tools/register/measure.js";
import { registerAccessibilityTool } from "./tools/register/accessibility.js";
import { registerDesignTools } from "./tools/register/design.js";
import { registerSessionTool } from "./tools/register/session.js";
import { registerScriptTool } from "./tools/register/script.js";
import { registerNetworkTools } from "./tools/register/network.js";
import { registerGalleryTool } from "./tools/register/gallery.js";
import { registerHumanInteractionTool } from "./tools/register/human.js";
import { registerManageTabsTool } from "./tools/register/tabs.js";
import { registerVerifyTool } from "./tools/register/verify.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  strictInputSchemas(server);

  registerCaptureTools(server);
  registerCaptureElementTool(server);
  registerLabelInteractivesTool(server);
  registerBaselineTool(server);
  registerDiffRegionsTool(server);
  registerLayoutTool(server);
  registerBreakpointsTool(server);
  registerLayoutShiftTool(server);
  registerInteractTools(server);
  registerMeasureTool(server);
  registerAccessibilityTool(server);
  registerDesignTools(server);
  registerSessionTool(server);
  registerHumanInteractionTool(server);
  registerManageTabsTool(server);
  registerVerifyTool(server);
  registerScriptTool(server); // opt-in via AGENT_EYES_ALLOW_EVAL=1
  registerNetworkTools(server);
  registerGalleryTool(server);

  return server;
}

/**
 * Reject unknown arguments. The SDK builds each tool's input object from a raw
 * shape, which silently strips unknown keys — so a misspelled or misplaced
 * argument (say `url` on a tool that has none) was ignored and the call ran
 * with defaults. Strict objects turn that into a clear validation error.
 */
function strictInputSchemas(server: McpServer): void {
  const register = server.registerTool.bind(server) as (
    name: string,
    config: { inputSchema?: unknown },
    handler: unknown,
  ) => unknown;
  (server as { registerTool: unknown }).registerTool = (
    name: string,
    config: { inputSchema?: unknown },
    handler: unknown,
  ) => {
    const shape = config.inputSchema;
    const isRawShape =
      typeof shape === "object" &&
      shape !== null &&
      !("_def" in shape) &&
      !("_zod" in shape);
    return register(
      name,
      isRawShape
        ? { ...config, inputSchema: z.object(shape as z.ZodRawShape).strict() }
        : config,
      handler,
    );
  };
}
