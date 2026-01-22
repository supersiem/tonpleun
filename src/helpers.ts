import type WebSocket from "ws";
import { requestType, stringPacketOptions, type packet, type StringPacket } from "./types.js";
export function log(id: any, ...args: any) {
    // .toString() als je niet groen wil
    console.log('[', id, ']', args);
}
export function WsSend(ws: WebSocket, data: packet) {
    ws.send(JSON.stringify(data));
}
export function successPacketBuilder(msg: string, B: stringPacketOptions) {
    return { type: requestType.Success, data: { msg: msg, for: B } as StringPacket, key: undefined } as packet
}