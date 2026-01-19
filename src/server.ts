import { log, successPacketBuilder, WsSend } from './helpers.js';
import { WebSocketServer, WebSocket } from 'ws';
import { InitResponsePacket, requestType, stringPacketOptions, type namedFakeType, type getServicePacket, type getServicePacketClient, type GetServiceResponsePacketToClient, type InitPacket, type packet, type registerConfigPacket, type RegisterServicePacket, type setConfigPacket } from './types.js';

function mapToObject(map: Map<any, any>) {
  return Object.fromEntries([...map.entries()].map(([kMaxLength, v]): any => [kMaxLength, v instanceof Map ? mapToObject(v) : v]))
}

const VERSION = {
  MAJOR: 1,
  MINOR: 1,
  PATCH: 1
}

let clients: Record<string, WebSocket> = {};
let services = new Map<string, Map<string, namedFakeType[]>>();
let configs = new Map<string, Map<string, registerConfigPacket>>();
let localServices = new Map<string, (...args: any[]) => any>();
localServices.set('getServices', (...args: any[]) => { return mapToObject(services) })
localServices.set('getConfigs', (...args: any[]) => { return mapToObject(configs) })
localServices.set('genHelper', (...args: any[]) => {
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
        // initialize per-client config store to avoid undefined access
        configs.set(id, new Map())
        log(id, 'ws init gedaan, client id gegeven. ip: ', req.socket.remoteAddress);
        WsSend(ws, { type: requestType.Init, data: { versionMajor: VERSION.MAJOR, versionMinor: VERSION.MINOR, versionPatch: VERSION.MINOR } as InitResponsePacket } as packet);
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
              } as getServicePacketClient
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
            } as GetServiceResponsePacketToClient
          })
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
      case requestType.RegisterConifg:
        data = jsonData.data as registerConfigPacket;
        log(id, 'registeer een nieuwe config ityem');
        // fuck het we slaan de hele packet op
        configs.get(id)!.set(data.id, data);
        WsSend(ws, successPacketBuilder('dinges', stringPacketOptions.registerConfigSuccess))
        break;
      case requestType.SetConfig:
        data = jsonData.data as setConfigPacket;
        log(id, 'update de dinges');
        const otherGuy = clients[data.ClientId]
        if (otherGuy) {
          const prev = configs.get(data.ClientId)!.get(data.id) as registerConfigPacket;
          configs.get(data.ClientId)!.set(
            data.id,
            { ...prev, value: data.newValue } as registerConfigPacket
          )
          WsSend(otherGuy, { type: requestType.SetConfig, data: data as setConfigPacket })
        }
        WsSend(ws, successPacketBuilder('dinges', stringPacketOptions.setConfigSuccess))

        break;
      default:
        log(id, 'invalid msg');
        break;
    }
  });

  ws.on('close', () => {
    services.delete(id);
    log(id, 'ws gesloten.')
  })

});
wsServer.on('listening', () => {
  console.log('klaar voor clients.')
})
