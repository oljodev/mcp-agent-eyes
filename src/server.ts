/**
 * Assembles the MCP server: one McpServer, then each feature's register
 * function wires its tools onto it. evaluate_script registers itself only when
 * AGENT_EYES_ALLOW_EVAL=1, so a default install ships no eval surface.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
import { registerAuthTools } from "./tools/register/auth.js";
import { registerEnrollTool } from "./tools/register/enroll.js";
import { registerManageVaultTool } from "./tools/register/manage-vault.js";
import { registerHumanInteractionTool } from "./tools/register/human.js";
import { registerManageTabsTool } from "./tools/register/tabs.js";
import { registerVerifyTool } from "./tools/register/verify.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

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
  registerAuthTools(server);
  registerEnrollTool(server);
  registerManageVaultTool(server);
  registerHumanInteractionTool(server);
  registerManageTabsTool(server);
  registerVerifyTool(server);
  registerScriptTool(server); // opt-in via AGENT_EYES_ALLOW_EVAL=1
  registerNetworkTools(server);
  registerGalleryTool(server);

  return server;
}
