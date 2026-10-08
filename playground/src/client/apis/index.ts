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
  return response.json() as Promise<Types.DshGet0Response>;
}

/** @method get */
export async function getApiServer(config?: RequestInit) {
  const response = await fetch("/api/server", {
    ...config,
  });
  return response.json() as Promise<Types.DshGet1Response>;
}

/** @method get */
export async function getApiInspect(config?: RequestInit) {
  const response = await fetch("/api/inspect", {
    ...config,
  });
  return response.json() as Promise<Types.DshGet2Response>;
}

/** @method get */
export async function getApiEchoChannel(paths: Types.GetApiEchochannelPath, query?: Types.GetApiEchochannelQuery, config?: RequestInit) {
  const querystr = new URLSearchParams(Object.entries(query || {}));
  const response = await fetch(`/api/echo/${paths.channel}?${querystr}`, {
    ...config,
  });
  return response.json() as Promise<Types.DshGet3Response>;
}

/** @method post */
export async function postApiEchoChannel(paths: Types.PostApiEchochannelPath, body: Types.DshPost4Body, query?: Types.PostApiEchochannelQuery, config?: RequestInit) {
  const querystr = new URLSearchParams(Object.entries(query || {}));
  const response = await fetch(`/api/echo/${paths.channel}?${querystr}`, {
    headers: { "Content-Type": "application/json" },
    method: "post",
    body: JSON.stringify(body),
    ...config,
  });
  return response.json() as Promise<Types.DshPost4Response>;
}
