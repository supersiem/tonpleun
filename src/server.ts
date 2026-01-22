import { log, successPacketBuilder, WsSend } from './helpers.js';
import { WebSocketServer, WebSocket } from 'ws';
import { InitResponsePacket, type StringPacket, requestType, stringPacketOptions, type namedFakeType, type getServicePacket, type getServicePacketClient, type GetServiceResponsePacketToClient, type InitPacket, type packet, type registerConfigPacket, type RegisterServicePacket, type setConfigPacket } from './types.js';

function mapToObject(map: Map<any, any>) {
  return Object.fromEntries([...map.entries()].map(([kMaxLength, v]): any => [kMaxLength, v instanceof Map ? mapToObject(v) : v]))
}

const VERSION = {
  MAJOR: 1,
  MINOR: 1,
  PATCH: 2
};
enum PRIVLEGE_LEVELS {
  NONE = 0,
  INIT_ONLY = 1,
  SERVICE_ACCESS = 2,
  CONFIG_ACCESS = 3,
  SET_CONFIG = 4,
  REGISTER_SERVICE = 5,
  FULL_ACCESS = 7
}
type configType = {
  CLIENT_ALLOWED_CHECK: (key: any) => number,
  // 1 = init,  2 = get service, 3 = register config, 4 = set config, 5 = register service, 6+ = none
  PRIVLEGE_CHECK_AT: number,
  ALLOW_CONFIG_GENERATION: boolean,
  ALLOW_SCANNING: boolean,
  TESTING_MODE?: boolean
}

// deze config is gemaakt voor dev
let config: configType = {
  CLIENT_ALLOWED_CHECK: (key: any) => 7,
  PRIVLEGE_CHECK_AT: 7,
  ALLOW_CONFIG_GENERATION: true,
  ALLOW_SCANNING: true,
  TESTING_MODE: true
};

const unprivlegedError = {
  type: requestType.Error,
  data: { msg: 'onvoldoende privleges', for: stringPacketOptions.Error } as StringPacket,
  key: undefined
} as packet;

let clients: Record<string, WebSocket> = {};
let services = new Map<string, Map<string, namedFakeType[]>>();
let configs = new Map<string, Map<string, registerConfigPacket>>();
let localServices = new Map<string, (...args: any[]) => any>();
localServices.set('getServices', (...args: any[]) => { if (!config.ALLOW_SCANNING) { return; } return mapToObject(services) })
localServices.set('getConfigs', (...args: any[]) => { if (!config.ALLOW_SCANNING) { return; } return mapToObject(configs) })
localServices.set('genHelper', (...args: any[]) => {
  if (!config.ALLOW_CONFIG_GENERATION) {
    return;
  }
  let output = '/* Dit bestand is automatisch gegenereerd door Tonpleun. Wijzigingen hierin worden overschreven. */\n\n';
  output += `import { getService } from './clientLib.js';\n\n`;

  services.forEach((serviceMap, clientId) => {
    output += `// Services for client: ${clientId}\n`;
    serviceMap.forEach((argTypes, serviceId) => {
      output += `// ${serviceId}\n`;
      output += `export async function ${serviceId}(`;
      output += argTypes.map((type, _) => `${type.name}: ${type.type}`).join(', ');
      output += `): Promise<any> {\n`;
      output += `    return await getService('${serviceId}', '${clientId}', [${argTypes.map((arg, _) => `${arg.name}`).join(', ')}]);\n`;
      output += `}\n\n`;
    });
  });

  output += `// Tonpleun versie: ${VERSION.MAJOR}.${VERSION.MINOR}.${VERSION.PATCH}\n`;
  output += `// Genereer dit bestand opnieuw met de genHelper service indien services zijn gewijzigd.\n`;
  return output;
});
// Map a unique connectionId to the original requester WebSocket
const connectionMap = new Map<string, WebSocket>();

function privlegeCheck(clientId: string, at: number): boolean {
  if (config.PRIVLEGE_CHECK_AT >= at) {
    const level = config.CLIENT_ALLOWED_CHECK(clientId);
    return level >= at;
  } else {
    // als we onder de checkat zitten, mag het zonder check
    return true;
  }
}

export default function startServer(customConfig?: Partial<configType>) {
  if (customConfig) {
    config = { ...config, ...customConfig };
  }
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
          // voor deze kunnen we direct afsluiten als ze niet mogen initen
          if (!privlegeCheck(data.ClientId, 1)) {
            log(id, 'init geweigerd vanwege privleges.');
            ws.close();
            return;
          }
          services.set(id, new Map())
          // initialize per-client config store to avoid undefined access
          configs.set(id, new Map())
          log(id, 'ws init gedaan, client id gegeven. ip: ', req.socket.remoteAddress);
          WsSend(ws, { type: requestType.Init, data: { versionMajor: VERSION.MAJOR, versionMinor: VERSION.MINOR, versionPatch: VERSION.MINOR } as InitResponsePacket } as packet);
          break;
        case requestType.RegisterService:
          data = jsonData.data as RegisterServicePacket;
          if (!privlegeCheck(id, 5)) {
            log(id, 'register service geweigerd vanwege privleges.');
            WsSend(ws, unprivlegedError);
            return;
          }
          services.get(id)!.set(data.ServiceId, data.args);
          log(id, `service ${data.ServiceId} geregistreerd.`);
          WsSend(ws, successPacketBuilder(`service ${data.ServiceId} geregistreerd.`, stringPacketOptions.registerServiceSuccess));
          break;
        case requestType.GetService:
          data = jsonData.data as getServicePacket;
          log(id, `service ${data.ServiceId} opgevraagd bij client ${data.ClientId}.`);
          if (!privlegeCheck(id, PRIVLEGE_LEVELS.SERVICE_ACCESS)) {
            log(id, 'get service geweigerd vanwege privleges.');
            WsSend(ws, unprivlegedError);
            return;
          }
          if (!(data.ClientId == "tonpleun")) {
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
                } as getServicePacketClient,
                key: undefined
              });
            } else {
              log(id, `service ${data.ServiceId} niet gevonden voor client ${data.ClientId}.`);
            }
          } else {
            const returnMe = localServices.get(data.ServiceId)!(data.args);
            WsSend(ws, {
              type: requestType.GetServiceResponse,
              data: {
                result: returnMe,
                connectionId: data.connectionId,
                serviceId: data.ServiceId
              } as GetServiceResponsePacketToClient,
              key: undefined
            })
          }
          break;
        case requestType.GetServiceResponse:
          data = jsonData.data;
          if (!privlegeCheck(id, PRIVLEGE_LEVELS.SERVICE_ACCESS)) {
            console.error('GetServiceResponse received from unprivileged client how tf does this even happen:', id);
            WsSend(ws, unprivlegedError);
            return;
          }
          log(id, `antwoord voor service ${data.ServiceId} ontvangen, doorsturen naar client.`);
          const originalRequesterWs = connectionMap.get(data.connectionId);
          if (originalRequesterWs) {
            WsSend(originalRequesterWs, {
              type: requestType.GetServiceResponse,
              data: {
                result: data.result,
                serviceId: data.ServiceId,
                connectionId: data.connectionId,
              } as GetServiceResponsePacketToClient,
              key: undefined
            });
            connectionMap.delete(data.connectionId);
          }
          break;
        case requestType.RegisterConifg:
          data = jsonData.data as registerConfigPacket;
          if (!privlegeCheck(id, PRIVLEGE_LEVELS.CONFIG_ACCESS)) {
            log(id, 'register geweigerd vanwege privleges.');
            WsSend(ws, unprivlegedError);
            return;
          }
          log(id, 'registeer een nieuwe config ityem');
          // fuck het we slaan de hele packet op
          configs.get(id)!.set(data.id, data);
          WsSend(ws, successPacketBuilder('dinges', stringPacketOptions.registerConfigSuccess))
          break;
        case requestType.SetConfig:
          if (!privlegeCheck(id, PRIVLEGE_LEVELS.SET_CONFIG)) {
            log(id, 'Config schrijven beschemed');
            WsSend(ws, unprivlegedError);
            return;
          }
          data = jsonData.data as setConfigPacket;
          log(id, 'update de dinges');
          const otherGuy = clients[data.ClientId]
          if (otherGuy) {
            const prev = configs.get(data.ClientId)!.get(data.id) as registerConfigPacket;
            configs.get(data.ClientId)!.set(
              data.id,
              { ...prev, value: data.newValue } as registerConfigPacket
            )
            WsSend(otherGuy, { type: requestType.SetConfig, data: data as setConfigPacket, key: undefined })
          }
          WsSend(ws, successPacketBuilder('dinges', stringPacketOptions.setConfigSuccess))

          break;
        case requestType.Success:
          if (config.TESTING_MODE) {
            console.info('Success packet ontvangen van client, test geslaagt, afsluiten.');
            wsServer.close();
            console.info('test server afgesloten.');
          }
          break;
        case requestType.Error:
          if (config.TESTING_MODE) {
            console.error('Error packet ontvangen van client, test gefaald, afsluiten.');
            console.error(jsonData.data.msg);
            wsServer.close();
            console.info('test server afgesloten.');
          }
          break;
        default:
          log(id, 'invalid msg');
          break;
      }
    });

    ws.on('close', () => {
      services.delete(id);
      configs.delete(id);
      delete clients[id];
      log(id, 'ws gesloten.')
    })

  });
  wsServer.on('listening', () => {
    console.log('klaar voor clients.')
  })
}