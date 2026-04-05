import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import {
  requestType,
  stringPacketOptions,
  type getServicePacketClient,
  type GetServiceResponsePacketToServer,
  type GetServiceResponsePacketToClient,
  type InitPacket,
  type packet,
  type StringPacket,
  type registerConfigPacket,
  type setConfigPacket,
  InitResponsePacket,
  getServicePacketClientSchema,
  getServiceResponsePacketToClientSchema,
  initResponsePacketSchema,
  packetSchema,
  setConfigPacketSchema,
  stringPacketSchema
} from './types.js';
import { WsSend } from './helpers.js';
import { assert } from 'console';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

type ValidationSuccess = {
  success: true;
  data: unknown;
};

type ValidationFailure = {
  success: false;
  error?: {
    issues?: unknown;
  } | unknown;
};

export type ServiceInputValidator = {
  safeParse: (data: unknown) => ValidationSuccess | ValidationFailure;
};

export default class Tonpleun {
  private url = "ws://localhost:8765";
  public ws: WebSocket;
  private serviceCallbacks = new Map<string, (...args: any[]) => any>();
  private serviceInputSchemas = new Map<string, ServiceInputValidator>();
  private clinetIDStore = "error";
  private localConfigs = new Map<string, registerConfigPacket>();
  private key: any = undefined;
  public initialized: Promise<StringPacket>;

  private VERSION = {
    MAJOR: 2,
    MINOR: 0,
    PATCH: 0
  }

  public async awaitServiceMessage(expectedFor: stringPacketOptions): Promise<StringPacket> {
    return new Promise<StringPacket>((resolve) => {
      const handler = (raw: Buffer) => {
        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const packetResult = packetSchema.safeParse(parsedRaw);
        if (!packetResult.success) {
          return;
        }
        const rawPacket = packetResult.data as packet;
        if (rawPacket.type === requestType.Success) {
          const stringResult = stringPacketSchema.safeParse(rawPacket.data);
          if (!stringResult.success) {
            return;
          }
          const data = stringResult.data as StringPacket;
          if (data.for === expectedFor) {
            this.ws.removeListener('message', handler);
            resolve(data);
          }
        }
      };
      this.ws.on('message', handler);
    });
  }
  public async registerConfigItem(name: string, description: string, value: string, idthing: string) {
    await this.initialized;
    const waitForAck = this.awaitServiceMessage(stringPacketOptions.registerConfigSuccess);
    WsSend(this.ws, { type: requestType.RegisterConifg, data: { name: name, description: description, defaultValue: value, type: typeof value, id: idthing } as registerConfigPacket, key: this.key })
    await waitForAck;
    this.localConfigs.set(idthing, { name, id: idthing, description, type: typeof value as registerConfigPacket['type'], defaultValue: value } as registerConfigPacket)
  }
  public async SetConfigItem(idthing: string, newValue: string, clientId?: string) {
    await this.initialized;
    const waitForAck = this.awaitServiceMessage(stringPacketOptions.setConfigSuccess);
    WsSend(this.ws, { type: requestType.SetConfig, data: { ClientId: clientId || this.clinetIDStore, id: idthing, newValue: newValue } as setConfigPacket, key: this.key })
    await waitForAck;
    const existing = this.localConfigs.get(idthing);
    if (existing) {
      this.localConfigs.set(idthing, { ...existing, value: newValue } as registerConfigPacket);
    }
  }
  public async registerService(ServiceId: string, callback: (...args: any[]) => any, inputSchema?: ServiceInputValidator) {
    await this.initialized;
    const waitForAck = this.awaitServiceMessage(stringPacketOptions.registerServiceSuccess);
    this.serviceCallbacks.set(ServiceId, callback);
    if (inputSchema) {
      this.serviceInputSchemas.set(ServiceId, inputSchema);
    }
    WsSend(this.ws, { type: requestType.RegisterService, data: { ServiceId }, key: this.key });
    await waitForAck;
  }
  public async getService(ServiceId: string, ClientId: string, inputs: any[]): Promise<any> {
    await this.initialized;
    const connectionId = randomUUID();
    const responsePromise = new Promise<any>((resolve) => {
      const handler = (raw: Buffer) => {
        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const packetResult = packetSchema.safeParse(parsedRaw);
        if (!packetResult.success) {
          return;
        }
        const rawPacket = packetResult.data as packet;
        if (rawPacket.type === requestType.GetServiceResponse) {
          const responseResult = getServiceResponsePacketToClientSchema.safeParse(rawPacket.data);
          if (!responseResult.success) {
            return;
          }
          const data = responseResult.data as GetServiceResponsePacketToClient;
          if (data.serviceId === ServiceId && data.connectionId === connectionId) {
            this.ws.removeListener('message', handler);
            resolve(data.result);
          }
        }
      };
      this.ws.on('message', handler);
    });
    WsSend(this.ws, { type: requestType.GetService, data: { ClientId, ServiceId, args: inputs, connectionId } as getServicePacketClient, key: this.key });
    return responsePromise;
  }
  constructor(ClientId: string, creds?: any) {
    this.clinetIDStore = ClientId;
    this.key = creds;
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('Verbonden met tonpleun server.');
      WsSend(this.ws, { type: requestType.Init, data: { ClientId } as InitPacket, key: this.key })

    });
    this.ws.on('close', () => {
      console.log('Verbinding met tonpleun server gesloten.');
    });
    this.ws.on('error', (error) => {
      console.error('Fout opgetreden:', error);
      this.ws.close();
    });
    this.ws.on('message', (data) => {
      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(data.toString());
      } catch {
        return;
      }
      const packetResult = packetSchema.safeParse(parsedRaw);
      if (!packetResult.success) {
        return;
      }
      const rawPacket = packetResult.data as packet
      if (rawPacket.type === requestType.GetService) {
        const serviceDataResult = getServicePacketClientSchema.safeParse(rawPacket.data);
        if (!serviceDataResult.success) {
          return;
        }
        const serviceData = serviceDataResult.data as getServicePacketClient;
        const callback = this.serviceCallbacks.get(serviceData.ServiceId);
        if (callback) {
          try {
            const schema = this.serviceInputSchemas.get(serviceData.ServiceId);
            let callbackArgs: any[] = serviceData.args;
            if (schema) {
              const schemaResult = schema.safeParse(serviceData.args);
              if (!schemaResult.success) {
                const validationError = schemaResult.error;
                const issues = (typeof validationError === 'object' && validationError !== null && 'issues' in validationError)
                  ? (validationError as { issues?: unknown }).issues
                  : validationError;
                WsSend(this.ws, {
                  type: requestType.GetServiceResponse, data: {
                    result: {
                      error: 'Invalid service input',
                      issues
                    },
                    ServiceId: serviceData.ServiceId,
                    connectionId: serviceData.connectionId,
                  } as GetServiceResponsePacketToServer,
                  key: this.key
                });
                return;
              }
              callbackArgs = Array.isArray(schemaResult.data) ? schemaResult.data : [schemaResult.data];
            }

            const result = callback(...callbackArgs);
            WsSend(this.ws, {
              type: requestType.GetServiceResponse, data: {
                result: result,
                ServiceId: serviceData.ServiceId,
                connectionId: serviceData.connectionId,
              } as GetServiceResponsePacketToServer,
              key: this.key
            });
          } catch (error) {
            console.error(`Fout bij uitvoeren van service ${serviceData.ServiceId}:`, error);
          }
        }

      } else if (rawPacket.type === requestType.SetConfig) {
        const setConfigResult = setConfigPacketSchema.safeParse(rawPacket.data);
        if (!setConfigResult.success) {
          return;
        }
        const cfg = setConfigResult.data as setConfigPacket;
        const existing = this.localConfigs.get(cfg.id);
        if (existing) {
          this.localConfigs.set(cfg.id, { ...existing, value: cfg.newValue } as registerConfigPacket);
        }
      }
    });
    this.initialized = new Promise<StringPacket>((resolve) => {
      const handler = (raw: Buffer) => {
        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const packetResult = packetSchema.safeParse(parsedRaw);
        if (!packetResult.success) {
          return;
        }
        const rawPacket = packetResult.data as packet;
        if (rawPacket.type === requestType.Init) {
          const initResult = initResponsePacketSchema.safeParse(rawPacket.data);
          if (!initResult.success) {
            return;
          }
          const data = initResult.data as InitResponsePacket;
          assert(data.versionMajor === this.VERSION.MAJOR, `Major versie mismatch: Client versie is ${this.VERSION.MAJOR}, server versie is ${data.versionMajor}.`);
          if (data.versionMinor !== this.VERSION.MINOR) {
            console.warn(`Waarschuwing: Minor versie mismatch: Client versie is ${this.VERSION.MINOR}, server versie is ${data.versionMinor}. Mogelijk zijn er incompatibiliteiten.`);
          }
          if (data.versionPatch !== this.VERSION.PATCH) {
            console.warn(`Waarschuwing: Patch versie mismatch: Client versie is ${this.VERSION.PATCH}, server versie is ${data.versionPatch}. Mogelijk zijn er bugs of ontbrekende functies.`);
          }
          this.ws.removeListener('message', handler);
          console.info('Client geïnitialiseerd met versie:', data.versionMajor, data.versionMinor, data.versionPatch);
          resolve({ for: stringPacketOptions.initSuccess, msg: 'Init succesvol' } as StringPacket);
        }
      };
      this.ws.on('message', handler);
    });

  }

  public getConfigValue(id: string): any | undefined {
    const item = this.localConfigs.get(id);
    return item ? (item.value ?? item.defaultValue) : undefined;
  }
  public TESTING_HELPERS = {
    done: () => {
      this.ws.send(JSON.stringify({ type: requestType.Success, data: { msg: 'done', for: stringPacketOptions.initSuccess } as StringPacket, key: this.key }));
    },
    error: (msg: string) => {
      this.ws.send(JSON.stringify({ type: requestType.Success, data: { msg: msg, for: stringPacketOptions.initSuccess } as StringPacket, key: this.key }));
    }
  }


}
