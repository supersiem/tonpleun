import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { requestType, stringPacketOptions, type getServicePacketClient, type GetServiceResponsePacketToServer, type GetServiceResponsePacketToClient, type InitPacket, type packet, type StringPacket, type registerConfigPacket, type setConfigPacket, type fakeTypeType, type namedFakeType, InitResponsePacket } from './types.js';
import { WsSend } from './helpers.js';
import { assert } from 'console';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const url = "ws://localhost:8765";
export let ws: WebSocket;
const serviceCallbacks = new Map<string, (...args: any[]) => any>();
let clinetIDStore = "error";
const localConfigs = new Map<string, registerConfigPacket>();

const VERSION = {
    MAJOR: 1,
    MINOR: 1,
    PATCH: 2
}
export async function genHelper() {
    console.info('genHelper called');
    const result = await getService('genHelper', 'tonpleun', []);

    const outPath = dirname('./src/GEN.ts');
    mkdirSync(outPath, { recursive: true });
    writeFileSync('./src/GEN.ts', result);
    console.info('GEN.ts gegenereerd in ./src/GEN.ts');
    return result;
}

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
export async function registerConfigItem(name: string, description: string, value: string, idthing: string) {

    WsSend(ws, { type: requestType.RegisterConifg, data: { name: name, description: description, defaultValue: value, type: typeof value, id: idthing } as registerConfigPacket })
    // Wacht tot de verbinding is geopend
    return new Promise<void>((resolve) => {
        awaitServiceMessage(stringPacketOptions.registerConfigSuccess).then(() => {
            localConfigs.set(idthing, { name, id: idthing, description, type: typeof value as fakeTypeType, defaultValue: value } as registerConfigPacket)
            resolve();
        });
    });
}
export async function SetConfigItem(idthing: string, newValue: string, clientId?: string) {
    WsSend(ws, { type: requestType.SetConfig, data: { ClientId: clientId || clinetIDStore, id: idthing, newValue: newValue } as setConfigPacket })
    return new Promise<void>((resolve) => {
        awaitServiceMessage(stringPacketOptions.setConfigSuccess).then(() => {
            const existing = localConfigs.get(idthing);
            if (existing) {
                localConfigs.set(idthing, { ...existing, value: newValue } as registerConfigPacket);
            }
            resolve();
        });
    });
}

export async function registerService(ServiceId: string, args: namedFakeType[], callback: (...args: any[]) => any) {
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
    clinetIDStore = ClientId;
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

        } else if (rawPacket.type === requestType.SetConfig) {
            const cfg = rawPacket.data as setConfigPacket;
            const existing = localConfigs.get(cfg.id);
            if (existing) {
                localConfigs.set(cfg.id, { ...existing, value: cfg.newValue } as registerConfigPacket);
            }
        }
    });

    return new Promise<StringPacket>((resolve) => {
        const handler = (raw: Buffer) => {
            const rawPacket = JSON.parse(raw.toString()) as packet;
            if (rawPacket.type === requestType.Init) {
                const data = rawPacket.data as InitResponsePacket;
                assert(data.versionMajor === VERSION.MAJOR, `Major versie mismatch: Client versie is ${VERSION.MAJOR}, server versie is ${data.versionMajor}.`);
                if (data.versionMinor !== VERSION.MINOR) {
                    console.warn(`Waarschuwing: Minor versie mismatch: Client versie is ${VERSION.MINOR}, server versie is ${data.versionMinor}. Mogelijk zijn er incompatibiliteiten.`);
                }
                if (data.versionPatch !== VERSION.PATCH) {
                    console.warn(`Waarschuwing: Patch versie mismatch: Client versie is ${VERSION.PATCH}, server versie is ${data.versionPatch}. Mogelijk zijn er bugs of ontbrekende functies.`);
                }
                ws.removeListener('message', handler);
                console.info('Client geïnitialiseerd met versie:', data.versionMajor, data.versionMinor, data.versionPatch);
                console.info('gebruik via GEN.ts is aanbevolen')
                resolve({ for: stringPacketOptions.initSuccess, msg: 'Init succesvol' } as StringPacket);
            }
        };
        ws.on('message', handler);
    });
}

export function getConfigValue(id: string): any | undefined {
    const item = localConfigs.get(id);
    return item ? (item.value ?? item.defaultValue) : undefined;
}