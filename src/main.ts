import { WebSocketServer, WebSocket } from 'ws';

type ServiceClient = 'BUILTIN' | WebSocket;

type ServiceDef = {
    id: string | number;
    args: string[];
    client: ServiceClient;
    FUNC?: (args: any[]) => any | Promise<any>;
};

const clients = new Set<WebSocket>();

function getServices(args: any[]): string[] {
    return Object.keys(servicesAvailable);
}

let servicesAvailable: Record<string, ServiceDef> = {
    'connector.status': {
        id: 0,
        args: [],
        client: 'BUILTIN',
    },
    'connector.services': {
        id: 1,
        args: [],
        client: 'BUILTIN',
        FUNC: getServices,
    },
    'connector.echo': {
        id: 2,
        args: ['message'],
        client: 'BUILTIN',
        FUNC: (args: any[]) => args[0] || "ontvangen",
    }
};

let awaitingResponses: Record<number, WebSocket> = {};

const wss = new WebSocketServer({ host: '0.0.0.0', port: 8765 });

wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log('Client verbonden:', req.socket.remoteAddress);

    ws.on('message', async (raw) => {
        const message = raw.toString();
        console.log(`Ontvangen bericht van ${req.socket.remoteAddress}: ${message}`);

        let data: any;
        try {
            data = JSON.parse(message);
        } catch {
            ws.send(JSON.stringify({ status: '400', human_readable: 'Ongeldige JSON' }));
            return;
        }

        if (data?.action === 'get') {
            const service = servicesAvailable[data?.service as string];

            if (service) {
                if (service.client === 'BUILTIN') {
                    if (!service.FUNC) {
                        ws.send(
                            JSON.stringify({
                                status: '200',
                                human_readable: 'online, geen functie om uit te voeren.',
                                data: null,
                            }),
                        );
                    } else {
                        try {
                            const result = await Promise.resolve(service.FUNC(data?.args || []));
                            ws.send(
                                JSON.stringify({
                                    status: '200',
                                    human_readable: 'success',
                                    data: result,
                                }),
                            );
                        } catch {
                            ws.send(
                                JSON.stringify({
                                    status: '500',
                                    human_readable: 'Fout bij uitvoeren van service',
                                }),
                            );
                        }
                    }
                } else {
                    const id = Date.now();
                    service.client.send(JSON.stringify({
                        status: '700',
                        human_readable: 'service call',
                        args: data?.args || [],
                        serviceId: service.id,
                        callbackId: id,
                    }));
                    awaitingResponses[id] = ws;
                    ws.send(JSON.stringify({
                        status: '202',
                        human_readable: 'Verzoek verzonden naar service client',
                        calbackId: id,
                    }));
                }
            } else {
                ws.send(JSON.stringify({ status: '404', human_readable: 'Service niet gevonden' }));
            }
        }
        else if (data?.action == "register") {
            const newSerivice: ServiceDef = {
                id: data?.service,
                args: data?.args || [],
                client: ws,
            };
            servicesAvailable[data?.service as string] = newSerivice;
            ws.send(JSON.stringify({
                status: '201',
                human_readable: `Service ${data?.service} geregistreerd.`,
                data: { serviceId: newSerivice.id },
            }));

        }
        else if (data?.action == "response") {
            const callbackId = data?.callbackId;
            const responseData = data?.data;

            const originalRequester = awaitingResponses[callbackId];
            if (originalRequester) {
                originalRequester.send(JSON.stringify({
                    status: '200',
                    human_readable: 'Response van service client',
                    data: responseData,
                }));
                delete awaitingResponses[callbackId];
            } else {
                ws.send(JSON.stringify({
                    status: '404',
                    human_readable: 'Oorspronkelijke aanvrager niet gevonden voor deze callbackId',
                }));
            }

        };
    });

    ws.on('close', () => {
        // vewijder alles wat deze client heet geregistreerd
        for (const [name, service] of Object.entries(servicesAvailable)) {
            if (service.client === ws) {
                delete servicesAvailable[name];
                console.log(`Service ${name} verwijderd vanwege client disconnect.`);
            }
        }
        clients.delete(ws);
        console.log('Client weg');

    });
});

console.log('Server draait op ws://localhost:8765');