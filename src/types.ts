export enum requestType {
    Init,
    Success,
    Error,
    RegisterService,
    GetServiceResponse,
    GetService,
}
export enum stringPacketOptions { Error, initSuccess, registerServiceSuccess, getServiceSuccess };
type fakeTypeType = 'boolean' | 'string' | 'number'
export type packet = {
    type: requestType,
    data: any,
}
// requestType.Init
export type InitPacket = {
    ClientId: string,
}
// requestType.Success en requestType.Error
export type StringPacket = {
    msg: string,
    for: stringPacketOptions
}
// requestType.RegisterService
export type RegisterServicePacket = {
    ServiceId: string,
    args: fakeTypeType[]
}
// requestType.GetService ( client1 -> server)
export type getServicePacket = {
    ClientId: string,
    ServiceId: string,
    connectionId: string,
    args: any[],
}
export type args = fakeTypeType[];
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