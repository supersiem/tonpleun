import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { requestType, stringPacketOptions, type getServicePacketClient, type GetServiceResponsePacketToServer, type GetServiceResponsePacketToClient, type InitPacket, type packet, type StringPacket } from './types.js';
import { WsSend } from './helpers.js';

const url = "ws://localhost:8765";
export let ws: WebSocket;
const serviceCallbacks = new Map<string, (...args: any[]) => any>();

export async function awaitServiceMessage(expectedFor: stringPacketOptions): Promise<StringPacket> {
    return new Promise<StringPacket>((resolve) => {
        const handler = (raw: Buffer) => {
            const rawPacket = JSON.parse(raw.toString()) as packet;
            if (rawPacket.type === requestType.Success) {
                const data = rawPacket.data as StringPacket;
                if (data.for === expectedFor) {
                    ws.removeListener('message', handler);
                    resolve(data);
                }
            }
        };
        ws.on('message', handler);
    });
}

export async function registerService(ServiceId: string, args: ('boolean' | 'string' | 'number')[], callback: (...args: any[]) => any) {
    WsSend(ws, { type: requestType.RegisterService, data: { ServiceId, args } });
    serviceCallbacks.set(ServiceId, callback);
    return new Promise<void>((resolve) => {
        awaitServiceMessage(stringPacketOptions.registerServiceSuccess).then(() => {
            resolve();
        });
    });
}
export async function getService(ServiceId: string, ClientId: string, inputs: any[]): Promise<any> {
    const connectionId = randomUUID();
    WsSend(ws, { type: requestType.GetService, data: { ClientId, ServiceId, args: inputs, connectionId } as getServicePacketClient });
    return new Promise<any>((resolve) => {
        const handler = (raw: Buffer) => {
            const rawPacket = JSON.parse(raw.toString()) as packet;
            if (rawPacket.type === requestType.GetServiceResponse) {
                const data = rawPacket.data as GetServiceResponsePacketToClient;
                if (data.serviceId === ServiceId && data.connectionId === connectionId) {
                    ws.removeListener('message', handler);
                    resolve(data.result);
                }
            }
        };
        ws.on('message', handler);
    });
}

export async function initializeClient(ClientId: string) {
    ws = new WebSocket(url);

    ws.on('open', () => {
        console.log('Verbonden met tonpleun server.');
        WsSend(ws, { type: requestType.Init, data: { ClientId } as InitPacket })

    });
    ws.on('close', () => {
        console.log('Verbinding met tonpleun server gesloten.');
    });
    ws.on('error', (error) => {
        console.error('Fout opgetreden:', error);
        ws.close();
    });
    ws.on('message', (data) => {
        const rawPacket = JSON.parse(data.toString()) as packet
        if (rawPacket.type === requestType.GetService) {
            const serviceData = rawPacket.data as getServicePacketClient;
            const callback = serviceCallbacks.get(serviceData.ServiceId);
            if (callback) {
                try {
                    const result = callback(...serviceData.args);
                    WsSend(ws, {
                        type: requestType.GetServiceResponse, data: {
                            result: result,
                            ServiceId: serviceData.ServiceId,
                            connectionId: serviceData.connectionId,
                        } as GetServiceResponsePacketToServer
                    });
                } catch (error) {
                    console.error(`Fout bij uitvoeren van service ${serviceData.ServiceId}:`, error);
                }
            }

        }
    });

    // Wacht tot de verbinding is geopend
    return new Promise<void>((resolve) => {
        awaitServiceMessage(stringPacketOptions.initSuccess).then(() => {
            resolve();
        });
    });
}