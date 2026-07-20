import "server-only";

import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

export type PublicAddress = {
  address: string;
  family: 4 | 6;
};

export type PinnedRequestInit = {
  method: "GET" | "HEAD";
  headers: Readonly<Record<string, string>>;
  signal?: AbortSignal;
};

export type PinnedHttpRequest = (
  url: URL,
  init: PinnedRequestInit,
  address: PublicAddress,
) => Promise<Response>;

function responseHeaders(message: http.IncomingMessage): Headers {
  const headers = new Headers();
  for (let index = 0; index < message.rawHeaders.length; index += 2) {
    const name = message.rawHeaders[index];
    const value = message.rawHeaders[index + 1];
    if (name && value && name.toLowerCase() !== "set-cookie") {
      headers.append(name, value);
    }
  }
  return headers;
}

/**
 * Opens the socket only to the already-resolved address while preserving the
 * original Host header, TLS SNI and hostname certificate verification.
 */
export const nodePinnedHttpRequest: PinnedHttpRequest = async (
  url,
  init,
  address,
) =>
  new Promise<Response>((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(new DOMException("The operation was aborted", "AbortError"));
      return;
    }

    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: init.method,
      headers: {
        ...init.headers,
        Host: url.host,
      },
      agent: false,
      ...(url.protocol === "https:"
        ? { servername: url.hostname, rejectUnauthorized: true }
        : {}),
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) {
          callback(null, [{ address: address.address, family: address.family }]);
          return;
        }
        callback(null, address.address, address.family);
      },
    });

    const abort = () => {
      request.destroy(new DOMException("The operation was aborted", "AbortError"));
    };
    init.signal?.addEventListener("abort", abort, { once: true });

    request.once("response", (message) => {
      const cleanupAbort = () => init.signal?.removeEventListener("abort", abort);
      message.once("end", cleanupAbort);
      message.once("close", cleanupAbort);
      message.once("error", cleanupAbort);
      const status = message.statusCode ?? 500;
      const hasBody = init.method !== "HEAD" && status !== 204 && status !== 304;
      const body = hasBody
        ? (Readable.toWeb(message) as ReadableStream<Uint8Array>)
        : null;
      resolve(
        new Response(body, {
          status,
          statusText: message.statusMessage,
          headers: responseHeaders(message),
        }),
      );
    });
    request.once("error", (error) => {
      init.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    request.end();
  });
