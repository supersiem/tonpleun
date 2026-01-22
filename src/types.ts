export enum requestType {
    Init,
    Success,
    Error,
    RegisterService,
    GetServiceResponse,
    GetService,
    RegisterConifg,
    SetConfig,

}
export enum stringPacketOptions { Error, initSuccess, registerServiceSuccess, getServiceSuccess, registerConfigSuccess, setConfigSuccess };
export type fakeTypeType = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";
export type namedFakeType = {
    name: string,
    type: fakeTypeType
};
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
    args: namedFakeType[]
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
    type: fakeTypeType,
    defaultValue: any,
    value?: any
}
// server -> client
export type setConfigPacket = {
    ClientId: string,
    newValue: any,
    id: string
}