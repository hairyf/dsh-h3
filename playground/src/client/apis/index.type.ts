export type GetApiHealthResponse = { status: string; uptimeMs: number };
export type GetApiServerResponse = { port: number };
export type GetApiInspectResponse = { method: string; path: string; query: { [key: string]: undefined | string | string[] } };
export type GetApiEchochannelResponse = { channel: string; method: string; pretty: false | true; limit: number; query: { pretty?: undefined | false | true; limit?: undefined | number } };
export type GetApiEchochannelQueryPretty = undefined | false | true;
export type GetApiEchochannelQueryLimit = undefined | number;
export type PostApiEchochannelResponse = { channel: string; method: string; pretty: false | true; limit: number; body: { message: string; tags?: undefined | string[]; metadata?: undefined | { [key: string]: string } }; query: { pretty?: undefined | false | true; limit?: undefined | number } };
export type PostApiEchochannelQueryPretty = undefined | false | true;
export type PostApiEchochannelQueryLimit = undefined | number;

export interface PostApiEchochannelBody {
  message: string;
  tags?: undefined | string[];
  metadata?: undefined | { [key: string]: string };
}
export interface GetApiEchochannelPath {
  channel: string;
}
export interface GetApiEchochannelQuery {
  pretty?: GetApiEchochannelQueryPretty;
  limit?: GetApiEchochannelQueryLimit;
}
export interface PostApiEchochannelPath {
  channel: string;
}
export interface PostApiEchochannelQuery {
  pretty?: PostApiEchochannelQueryPretty;
  limit?: PostApiEchochannelQueryLimit;
}
