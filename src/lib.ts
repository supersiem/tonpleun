import WebSocket from 'ws';

const url = "ws://localhost:8765";

export type Message = {
    status: string;
    human_readable: string;
    callbackId?: number;
    serviceId?: string;
    args?: any[];
    data?: any;
    id?: string;
    value?: any;

};

export enum configType {
    str,
    bool,
    int
}

export let config: Record<string, any> = {};
// voor wie complete controle wil over ws client gedrag
export let ws: WebSocket;

export let successHandler: ((data: any) => void) | null = null;
export let errorHandler: ((error: any) => void) | null = null;
export let debugLogging: boolean = false;
let serviceHandlers: Record<string, (args: any[]) => any> = {};
let waitingForData: boolean = false;

function debugLog(...message: any[]) {
    if (debugLogging) {
        console.log('[DEBUG]', message);
    }
}

function parseData(msg: Message): any | null {
    if (ws) {
        if (msg.status === "200") {
            debugLog('Ontvangen data:', msg.data);
            if (successHandler && !waitingForData) successHandler(msg.data);
        }
        else if (msg.status === "210") {
            if (waitingForData && successHandler) successHandler(msg.data)
        }
        else if (msg.status === '700') {
            debugLog('Service oproep ontvangen:', msg.callbackId);
            serviceHandlers[msg.serviceId || '']?.(msg.args || []);
            ws.send(JSON.stringify({
                action: 'response',
                callbackId: msg.callbackId,
                data: msg.args,
            }));
        }
        else if (msg.status === "600") {
            debugLog('config update ontvangen')
            if (msg?.id) {
                config[msg?.id] = msg?.value;
            }
        } else {
            if (errorHandler) errorHandler(msg.data)
            // console.log('error code', msg.status)
        }
    } else {
        console.error('WebSocket is niet geïnitialiseerd.');
    }
}

export function registerService(serviceId: string, handler: (args: any[]) => any, args?: string[]) {
    if (ws) {
        serviceHandlers[serviceId] = handler;

        ws.send(JSON.stringify({
            action: 'register',
            service: serviceId,
            args: args || [],
        }));
    } else {
        console.error('WebSocket is niet geïnitialiseerd.');
    }
}
export async function registerServiceAsync(serviceId: string, handler: (args: any[]) => any, args?: string[]): Promise<any> {
    if (ws) {
        return new Promise((resolve, reject) => {
            successHandler = resolve;
            errorHandler = reject;
            ws.send(JSON.stringify({
                action: 'get',
                service: serviceId,
                args: args,
            }));
        });
    } else {
        return Promise.reject('WebSocket is niet geïnitialiseerd.');
    }
}
// met callback
export function callService(serviceId: string, args: any[], onSuccess: (data: any) => void, onError: (error: any) => void) {
    if (ws) {
        successHandler = onSuccess;
        errorHandler = onError;
        waitingForData = true;
        ws.send(JSON.stringify({
            action: 'get',
            service: serviceId,
            args: args,
        }));
    } else {
        console.error('WebSocket is niet geïnitialiseerd.');
    }
}
// met promise
export async function callServiceAsync(serviceId: string, args: any[]): Promise<any> {
    if (ws) {
        return new Promise((resolve, reject) => {
            successHandler = resolve;
            errorHandler = reject;
            waitingForData = true;
            ws.send(JSON.stringify({
                action: 'get',
                service: serviceId,
                args: args,
            }));
        });
    } else {
        return Promise.reject('WebSocket is niet geïnitialiseerd.');
    }
}

export async function registerConfigItem(id: string, human_name: string, configType: configType, value: any): Promise<any> {
    if (ws) {
        config[id] = value;
        return new Promise((resolve, reject) => {
            successHandler = resolve;
            errorHandler = reject;
            ws.send(JSON.stringify({
                action: "makeConfigOption",
                human: human_name,
                id: id,
                configType: configType,
                value: value
            }));
        });
    } else {
        return Promise.reject('WebSocket is niet geïnitialiseerd.d')
    }
}
export async function setConfigItem(id: string, value: any) {
    if (ws) {
        return new Promise((resolve, reject) => {
            successHandler = resolve;
            errorHandler = reject;
            ws.send(JSON.stringify({
                action: "makeConfigOption",
                id: id,
                value: value
            }));
        });

    } else {
        return Promise.reject('WebSocket is niet geïnitialiseerd.')
    }
}

export async function initializeClient() {
    ws = new WebSocket(url);

    ws.on('open', () => {
        debugLog('Verbonden met de server');
        console.log('Verbonden met tonpleun server.');
    });

    ws.on('message', (data) => {
        parseData(JSON.parse(data.toString()) as Message);
    });

    ws.on('close', () => {
        debugLog('Verbinding gesloten');
        console.log('Verbinding met tonpleun server gesloten.');
    });

    ws.on('error', (error) => {
        console.error('Fout opgetreden:', error);
    });

    // Wacht tot de verbinding is geopend
    return new Promise<void>((resolve) => {
        ws.on('open', () => {
            resolve();
        });
    });
}