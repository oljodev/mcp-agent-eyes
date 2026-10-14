/**
 * HandoffPrompt — the "your turn" channel for await_human_interaction.
 *
 * The MCP server speaks the protocol over stdio, so the human cannot answer
 * there. This starts a loopback-only HTTP listener: `request()` mints a
 * single-use nonce, surfaces a `127.0.0.1` URL to the human (auto-open their
 * browser + a stderr fallback), and resolves with "continue" or "cancel" once
 * they click. No secret ever passes through it.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { BrowserToolError } from "../browser/errors.js";

export interface PromptRequest {
  /** The plain-language instruction shown to the human. */
  message?: string;
  /** Time-to-live (ms) the human has to respond. */
  ttlMs?: number;
  /** Abort the pending prompt early (e.g. another race winner resolved first). */
  signal?: AbortSignal;
}

export interface PromptAnnouncement {
  url: string;
}
import { EXPIRED, htmlNotice, htmlScreen, RECEIVED } from "./prompt-html.js";

/** How long the human has to answer a prompt before it is abandoned. */
const TTL_MS = 180_000;
/** Hard cap on a POST body, so a stray client cannot exhaust memory. */
const MAX_BODY_BYTES = 64 * 1024;

interface Pending {
  message: string | undefined;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  consumed: boolean;
}

class HandoffPrompt {
  private server: Server | null = null;
  private port = 0;
  private readonly pending = new Map<string, Pending>();

  /**
   * Optional hook for an embedder (or a test harness) to receive the prompt
   * URL instead of the default auto-open-browser + stderr behaviour.
   */
  announceHook: ((info: PromptAnnouncement) => void) | null = null;

  /** Block until the human submits the requested secret (or the TTL fires). */
  async request(req: PromptRequest): Promise<string> {
    await this.ensureServer();
    const nonce = randomBytes(32).toString("base64url");
    const url = `http://127.0.0.1:${this.port}/p/${nonce}`;
    const ttl = req.ttlMs ?? TTL_MS;

    const value = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(
          new BrowserToolError(
            `The handoff prompt was not completed within ` +
              `${Math.round(ttl / 1000)}s. Re-run the tool to try again.`,
          ),
        );
      }, ttl);
      (timer as { unref?: () => void }).unref?.();
      this.pending.set(nonce, {
        message: req.message,
        resolve,
        reject,
        timer,
        consumed: false,
      });
      // A race winner elsewhere can abort this prompt: drop the pending entry
      // (freeing its nonce) and reject so the awaiter unwinds cleanly.
      if (req.signal) {
        req.signal.addEventListener(
          "abort",
          () => {
            const entry = this.pending.get(nonce);
            if (!entry || entry.consumed) {
              return;
            }
            entry.consumed = true;
            clearTimeout(entry.timer);
            this.pending.delete(nonce);
            reject(new BrowserToolError("Handoff prompt cancelled."));
          },
          { once: true },
        );
      }
    });

    this.announce({ url });
    return value;
  }

  /** Reject every pending prompt and stop the listener. Idempotent. */
  async close(): Promise<void> {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(
        new BrowserToolError("agent-eyes is shutting down; handoff cancelled."),
      );
    }
    this.pending.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private ensureServer(): Promise<void> {
    if (this.server) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const server = createServer((rq, rs) => this.handle(rq, rs));
      server.on("error", reject);
      // Strict loopback bind: the IPv4 literal (not "localhost", which can
      // resolve to ::1 or be redirected via /etc/hosts), OS-assigned port.
      server.listen({ host: "127.0.0.1", port: 0 }, () => {
        this.port = (server.address() as AddressInfo).port;
        this.server = server;
        resolve();
      });
    });
  }

  private handle(rq: IncomingMessage, rs: ServerResponse): void {
    // Defence in depth: only loopback peers, and only loopback Host headers
    // (a DNS-rebinding page would arrive with a foreign Host).
    const remote = rq.socket.remoteAddress ?? "";
    if (!isLoopback(remote)) {
      rs.writeHead(403).end("Forbidden");
      return;
    }
    const host = (rq.headers.host ?? "").split(":")[0];
    if (host !== "127.0.0.1" && host !== "localhost") {
      rs.writeHead(403).end("Forbidden");
      return;
    }

    const path = (rq.url ?? "/").split("?")[0] ?? "/";
    const match = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    if (!match) {
      this.send(rs, 404, htmlNotice("This prompt link is not valid."));
      return;
    }
    const nonce = match[1]!;

    if (rq.method === "GET") {
      const entry = this.pending.get(nonce);
      if (!entry || entry.consumed) {
        this.send(rs, 404, htmlNotice(EXPIRED));
        return;
      }
      this.send(rs, 200, htmlScreen(nonce, entry.message));
      return;
    }
    if (rq.method === "POST") {
      this.handlePost(rq, rs, nonce);
      return;
    }
    rs.writeHead(405).end();
  }

  private handlePost(
    rq: IncomingMessage,
    rs: ServerResponse,
    nonce: string,
  ): void {
    const entry = this.pending.get(nonce);
    if (!entry || entry.consumed) {
      this.send(rs, 409, htmlNotice(EXPIRED));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    rq.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        rs.writeHead(413).end("Payload too large");
        rq.destroy();
        return;
      }
      chunks.push(chunk);
    });
    rq.on("error", () => undefined);
    rq.on("end", () => {
      if (aborted) {
        return;
      }
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const value = params.get("v") ?? "";
      // Single-use: consume before resolving so a double-submit hits 409.
      entry.consumed = true;
      clearTimeout(entry.timer);
      this.pending.delete(nonce);
      this.send(rs, 200, htmlNotice(RECEIVED));
      entry.resolve(value);
    });
  }

  private announce(info: PromptAnnouncement): void {
    if (this.announceHook) {
      this.announceHook(info);
      return;
    }
    // stdout is the MCP channel — diagnostics MUST go to stderr.
    console.error(
      `agent-eyes: your turn in the browser window — open ${info.url} and ` +
        "click Done when finished.",
    );
    openInBrowser(info.url);
  }

  private send(rs: ServerResponse, status: number, html: string): void {
    rs.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    });
    rs.end(html);
  }
}

function isLoopback(addr: string): boolean {
  return (
    addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
  );
}

/** Best-effort: open the URL in the user's default browser. Never throws. */
function openInBrowser(url: string): void {
  try {
    const platform = process.platform;
    const [cmd, args] =
      platform === "darwin"
        ? (["open", [url]] as const)
        : platform === "win32"
          ? (["cmd", ["/c", "start", "", url]] as const)
          : (["xdg-open", [url]] as const);
    const child = spawn(cmd, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // The stderr line is the fallback when no opener is available.
  }
}

/** The one shared handoff-prompt channel for this server process. */
export const handoffPrompt = new HandoffPrompt();
