// Browser versie

var requestType;
(function (requestType) {
    requestType[requestType["Init"] = 0] = "Init";
    requestType[requestType["Success"] = 1] = "Success";
    requestType[requestType["Error"] = 2] = "Error";
    requestType[requestType["RegisterService"] = 3] = "RegisterService";
    requestType[requestType["GetServiceResponse"] = 4] = "GetServiceResponse";
    requestType[requestType["GetService"] = 5] = "GetService";
    requestType[requestType["RegisterConifg"] = 6] = "RegisterConifg";
    requestType[requestType["SetConfig"] = 7] = "SetConfig";
})(requestType || (requestType = {}));

var stringPacketOptions;
(function (stringPacketOptions) {
    stringPacketOptions[stringPacketOptions["Error"] = 0] = "Error";
    stringPacketOptions[stringPacketOptions["initSuccess"] = 1] = "initSuccess";
    stringPacketOptions[stringPacketOptions["registerServiceSuccess"] = 2] = "registerServiceSuccess";
    stringPacketOptions[stringPacketOptions["getServiceSuccess"] = 3] = "getServiceSuccess";
    stringPacketOptions[stringPacketOptions["registerConfigSuccess"] = 4] = "registerConfigSuccess";
    stringPacketOptions[stringPacketOptions["setConfigSuccess"] = 5] = "setConfigSuccess";
})(stringPacketOptions || (stringPacketOptions = {}));

const url = "ws://localhost:8765";
export let ws;
const serviceCallbacks = new Map();
const localConfigs = new Map();

export async function awaitServiceMessage(expectedFor) {
    return new Promise((resolve) => {
        const handler = (event) => {
            try {
                const rawPacket = JSON.parse(event.data);
                if (rawPacket.type === requestType.Success) {
                    const data = rawPacket.data;
                    if (data.for === expectedFor) {
                        ws.removeEventListener('message', handler);
                        resolve(data);
                    }
                }
            } catch (e) {
                // ignore malformed packets
            }
        };
        ws.addEventListener('message', handler);
    });
}

function WsSend(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

export async function registerService(ServiceId, callback) {
    WsSend(ws, { type: requestType.RegisterService, data: { ServiceId } });
    serviceCallbacks.set(ServiceId, callback);
    return await awaitServiceMessage(stringPacketOptions.registerServiceSuccess);
}

export async function registerConfigItem(name, description, value, idthing) {
    WsSend(ws, {
        type: requestType.RegisterConifg,
        data: {
            name: name,
            description: description,
            defaultValue: value,
            type: typeof value,
            id: idthing
        }
    });
    return await awaitServiceMessage(stringPacketOptions.registerConfigSuccess).then((msg) => {
        localConfigs.set(idthing, {
            name,
            id: idthing,
            description,
            type: typeof value,
            defaultValue: value
        });
        return msg;
    });
}

export async function SetConfigItem(idthing, newValue, clientId) {
    WsSend(ws, {
        type: requestType.SetConfig,
        data: {
            ClientId: clientId,
            id: idthing,
            newValue: newValue
        }
    });
    return await awaitServiceMessage(stringPacketOptions.setConfigSuccess).then((msg) => {
        const existing = localConfigs.get(idthing);
        if (existing) {
            localConfigs.set(idthing, { ...existing, value: newValue });
        }
        return msg;
    });
}

export async function getService(ServiceId, ClientId, inputs) {
    const connectionId =
        (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    WsSend(ws, { type: requestType.GetService, data: { ClientId, ServiceId, args: inputs, connectionId } });

    return new Promise((resolve) => {
        const handler = (event) => {
            try {
                const rawPacket = JSON.parse(event.data);
                if (rawPacket.type === requestType.GetServiceResponse) {
                    const data = rawPacket.data;
                    if (data.serviceId === ServiceId && data.connectionId === connectionId) {
                        ws.removeEventListener('message', handler);
                        resolve(data.result);
                    }
                }
            } catch (e) {
                // ignore malformed packets
            }
        };
        ws.addEventListener('message', handler);
    });
}

export async function initializeClient(ClientId) {
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
        console.log('Verbonden met tonpleun server.');
        WsSend(ws, { type: requestType.Init, data: { ClientId } });
    });

    ws.addEventListener('close', () => {
        console.log('Verbinding met tonpleun server gesloten.');
    });

    ws.addEventListener('error', (event) => {
        console.error('Fout opgetreden:', event);
        try { ws.close(); } catch { }
    });

    ws.addEventListener('message', async (event) => {
        try {
            const rawPacket = JSON.parse(event.data);
            if (rawPacket.type === requestType.GetService) {
                const serviceData = rawPacket.data;
                const callback = serviceCallbacks.get(serviceData.ServiceId);
                if (callback) {
                    try {
                        const result = await Promise.resolve(callback(...serviceData.args));
                        WsSend(ws, {
                            type: requestType.GetServiceResponse,
                            data: {
                                result,
                                ServiceId: serviceData.ServiceId,
                                connectionId: serviceData.connectionId,
                            }
                        });
                    } catch (error) {
                        console.error(`Fout bij uitvoeren van service ${serviceData.ServiceId}:`, error);
                    }
                }
            } else if (rawPacket.type === requestType.SetConfig) {
                const cfg = rawPacket.data;
                const existing = localConfigs.get(cfg.id);
                if (existing) {
                    localConfigs.set(cfg.id, { ...existing, value: cfg.newValue });
                }
            }
        } catch (e) {
            // ignore malformed packets
        }
    });

    return await awaitServiceMessage(stringPacketOptions.initSuccess);
}

export function getConfigValue(id) {
    const item = localConfigs.get(id);
    return item ? (item.value ?? item.defaultValue) : undefined;
}