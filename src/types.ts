import { z } from 'zod';

export enum requestType {
    Init,
    Success,
    Error,
    RegisterService,
    GetServiceResponse,
    GetService,
    RegisterConifg,
    SetConfig,
    SendExternalData,
}
export enum stringPacketOptions { Error, initSuccess, registerServiceSuccess, getServiceSuccess, registerConfigSuccess, setConfigSuccess, };
export type configValueType = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";
export type packet = {
    type: requestType,
    data: any,
    key: any // <-- auth spull hier
}
// requestType.Init
export type InitPacket = {
    ClientId: string,
}
// requestType.Init response
export type InitResponsePacket = {
    versionMajor: number,
    versionMinor: number,
    versionPatch: number,
}
// requestType.Success en requestType.Error
export type StringPacket = {
    msg: string,
    for: stringPacketOptions
}
// requestType.RegisterService
export type RegisterServicePacket = {
    ServiceId: string,
}
// requestType.GetService ( client1 -> server)
export type getServicePacket = {
    ClientId: string,
    ServiceId: string,
    connectionId: string,
    args: any[],
}
// requestType.getService (server -> client2)
export type getServicePacketClient = {
    ServiceId: string,
    args: any[],
    connectionId: string,
}
// requestType.GetServiceResponse (client -> server)
// client2 -> server
export type GetServiceResponsePacketToServer = {
    ServiceId: string,
    result: any,
    connectionId: string,
}
// requestType.GetServiceResponse (server -> client)
// server -> client1
export type GetServiceResponsePacketToClient = {
    result: any,
    serviceId: string,
    connectionId: string,
}
// client -> server
export type registerConfigPacket = {
    name: string,
    id: string,
    description: string,
    type: configValueType,
    defaultValue: any,
    value?: any
}
// server -> client
export type setConfigPacket = {
    ClientId: string,
    newValue: any,
    id: string
}

export type sendExternalDataPacket = {
    ToClientId: string,
    externalDataPacket: externalDataPacket
}

export type externalDataPacket = {
    FromClientId: string,
    data: any
}

export const configValueTypeSchema = z.enum(["string", "number", "bigint", "boolean", "symbol", "undefined", "object", "function"]);

export const initPacketSchema = z.object({
    ClientId: z.string().min(1)
});

export const initResponsePacketSchema = z.object({
    versionMajor: z.number().int(),
    versionMinor: z.number().int(),
    versionPatch: z.number().int()
});

export const stringPacketSchema = z.object({
    msg: z.string(),
    for: z.nativeEnum(stringPacketOptions)
});

export const registerServicePacketSchema = z.object({
    ServiceId: z.string().min(1)
});

export const getServicePacketSchema = z.object({
    ClientId: z.string().min(1),
    ServiceId: z.string().min(1),
    connectionId: z.string().min(1),
    args: z.array(z.unknown())
});

export const getServicePacketClientSchema = z.object({
    ServiceId: z.string().min(1),
    args: z.array(z.unknown()),
    connectionId: z.string().min(1)
});

export const getServiceResponsePacketToServerSchema = z.object({
    ServiceId: z.string().min(1),
    result: z.unknown(),
    connectionId: z.string().min(1)
});

export const getServiceResponsePacketToClientSchema = z.object({
    result: z.unknown(),
    serviceId: z.string().min(1),
    connectionId: z.string().min(1)
});

export const registerConfigPacketSchema = z.object({
    name: z.string().min(1),
    id: z.string().min(1),
    description: z.string(),
    type: configValueTypeSchema,
    defaultValue: z.unknown(),
    value: z.unknown().optional()
});

export const setConfigPacketSchema = z.object({
    ClientId: z.string().min(1),
    newValue: z.unknown(),
    id: z.string().min(1)
});

export const packetSchema = z.object({
    type: z.nativeEnum(requestType),
    data: z.unknown(),
    key: z.unknown().optional()
});