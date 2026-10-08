export type DshGet0Response = { status: string; uptimeMs: number };
export type DshGet1Response = { port: number };
export type DshGet2Response = { method: string; path: string; query: { [key: string]: undefined | string | string[] } };
export type DshGet3Response = { channel: string; method: string; pretty: false | true; limit: number; query: { pretty?: undefined | false | true; limit?: undefined | number } };
export type DshGet3Query1 = undefined | false | true;
export type DshGet3Query2 = undefined | number;
export type DshPost4Response = { channel: string; method: string; pretty: false | true; limit: number; body: { message: string; tags?: undefined | string[]; metadata?: undefined | { [key: string]: string } }; query: { pretty?: undefined | false | true; limit?: undefined | number } };
export type DshPost4Query2 = undefined | false | true;
export type DshPost4Query3 = undefined | number;

export interface DshPost4Body {
  message: string;
  tags?: undefined | string[];
  metadata?: undefined | { [key: string]: string };
}
export interface GetApiEchochannelPath {
  channel: string;
}
export interface GetApiEchochannelQuery {
  pretty?: DshGet3Query1;
  limit?: DshGet3Query2;
}
export interface PostApiEchochannelPath {
  channel: string;
}
export interface PostApiEchochannelQuery {
  pretty?: DshPost4Query2;
  limit?: DshPost4Query3;
}
