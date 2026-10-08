/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type * as Http from "ofetch";
import { ofetch } from "ofetch";
import type * as Types from "./index.type";

/** @method get */
export function getApiHealth(options?: FetchOptions) {
  return ofetch<Types.DshGet0Response>("/api/health", { method: "get", ...options });
}

/** @method get */
export function getApiServer(options?: FetchOptions) {
  return ofetch<Types.DshGet1Response>("/api/server", { method: "get", ...options });
}

/** @method get */
export function getApiInspect(options?: FetchOptions) {
  return ofetch<Types.DshGet2Response>("/api/inspect", { method: "get", ...options });
}

type FetchOptions = Omit<Http.FetchOptions, "responseType"> & { responseType?: "json" };
