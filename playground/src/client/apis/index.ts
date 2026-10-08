/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type * as Types from "./index.type";

/** @method get */
export async function getApiHealth(config?: RequestInit) {
  const response = await fetch("/api/health", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiHealthResponse>;
}

/** @method get */
export async function getApiServer(config?: RequestInit) {
  const response = await fetch("/api/server", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiServerResponse>;
}

/** @method get */
export async function getApiInspect(config?: RequestInit) {
  const response = await fetch("/api/inspect", {
    ...config,
  });
  return response.json() as Promise<Types.GetApiInspectResponse>;
}

/** @method get */
export async function getApiEchoChannel(paths: Types.GetApiEchochannelPath, query?: Types.GetApiEchochannelQuery, config?: RequestInit) {
  const querystr = new URLSearchParams(Object.entries(query || {}));
  const response = await fetch(`/api/echo/${paths.channel}?${querystr}`, {
    ...config,
  });
  return response.json() as Promise<Types.GetApiEchochannelResponse>;
}

/** @method post */
export async function postApiEchoChannel(paths: Types.PostApiEchochannelPath, body: Types.PostApiEchochannelBody, query?: Types.PostApiEchochannelQuery, config?: RequestInit) {
  const querystr = new URLSearchParams(Object.entries(query || {}));
  const response = await fetch(`/api/echo/${paths.channel}?${querystr}`, {
    headers: { "Content-Type": "application/json" },
    method: "post",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.PostApiEchochannelResponse>;
}
