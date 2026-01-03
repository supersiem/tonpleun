import { log, successPacketBuilder, WsSend } from './helpers.js';
import { WebSocketServer, WebSocket } from 'ws';
import { requestType, stringPacketOptions, type args, type getServicePacket, type getServicePacketClient, type GetServiceResponsePacketToClient, type InitPacket, type packet, type RegisterServicePacket } from './types.js';

let clients: Record<string, WebSocket> = {};
let serviceCallsAwaitingResponse: Record<string, (result: any) => void> = {};
let services = new Map<string, Map<string, args>>();
// Map a unique connectionId to the original requester WebSocket
const connectionMap = new Map<string, WebSocket>();
const wsServer = new WebSocketServer({ host: '0.0.0.0', port: 8765 });
wsServer.on('connection', (ws, req) => {
    let id = req.socket.remoteAddress as string;
    log(id, 'ws verbonden wachten op init.');

    ws.on('message', async (raw) => {
        const jsonData = JSON.parse(raw.toString()) as packet;
        let data;
        switch (jsonData.type) {
            case requestType.Init:
                data = jsonData.data as InitPacket;
                clients[data.ClientId] = ws;
                id = data.ClientId;
                services.set(id, new Map())
                log(id, 'ws init gedaan, client id gegeven. ip: ', req.socket.remoteAddress);
                WsSend(ws, successPacketBuilder('init gedaan.', stringPacketOptions.initSuccess));
                break;
            case requestType.RegisterService:
                data = jsonData.data as RegisterServicePacket;
                services.get(id)!.set(data.ServiceId, data.args);
                log(id, `service ${data.ServiceId} geregistreerd.`);
                WsSend(ws, successPacketBuilder(`service ${data.ServiceId} geregistreerd.`, stringPacketOptions.registerServiceSuccess));
                break;
            case requestType.GetService:
                data = jsonData.data as getServicePacket;
                log(id, `service ${data.ServiceId} opgevraagd bij client ${data.ClientId}.`);
                const serviceOwnerWs = clients[data.ClientId];
                if (serviceOwnerWs && services.get(data.ClientId)?.has(data.ServiceId)) {
                    // store mapping from this request's connectionId to the original requester
                    connectionMap.set(data.connectionId, ws);
                    WsSend(serviceOwnerWs, {
                        type: requestType.GetService,
                        data: {
                            ServiceId: data.ServiceId,
                            args: data.args,
                            connectionId: data.connectionId,
                        } as getServicePacketClient
                    });
                } else {
                    log(id, `service ${data.ServiceId} niet gevonden voor client ${data.ClientId}.`);
                }
                break;
            case requestType.GetServiceResponse:
                data = jsonData.data;
                log(id, `antwoord voor service ${data.ServiceId} ontvangen, doorsturen naar client.`);
                const originalRequesterWs = connectionMap.get(data.connectionId);
                if (originalRequesterWs) {
                    WsSend(originalRequesterWs, {
                        type: requestType.GetServiceResponse,
                        data: {
                            result: data.result,
                            serviceId: data.ServiceId,
                            connectionId: data.connectionId,
                        } as GetServiceResponsePacketToClient
                    });
                    connectionMap.delete(data.connectionId);
                }
                break;
            default:
                log(id, 'invalid msg');
                break;
        }
    });

    ws.on('close', () => {
        log(id, 'ws gesloten.')
    })

});
wsServer.on('listening', () => {
    console.log('klaar voor clients.')
})