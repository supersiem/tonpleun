import asyncio
import json
from typing import Any, Dict

from websockets.server import serve as ws_serve
from websockets.legacy.server import WebSocketServerProtocol

from python.types import (
    RequestType,
    StringPacketOptions,
)
from python.clientlib import initialize_client, register_config_item, set_config_item, get_config_value, register_service, get_service, close


class TestServer:
    def __init__(self) -> None:
        self._service_response_future: asyncio.Future = asyncio.get_running_loop().create_future()

    async def handler(self, ws: WebSocketServerProtocol) -> None:
        async for raw in ws:
            pkt = json.loads(raw)
            t = pkt.get("type")
            data = pkt.get("data", {})

            if t == RequestType.Init:
                # Ack init
                await ws.send(json.dumps({
                    "type": RequestType.Success,
                    "data": {"msg": "ok", "for": StringPacketOptions.initSuccess},
                }))

            elif t == RequestType.RegisterConifg:
                # Ack register config
                await ws.send(json.dumps({
                    "type": RequestType.Success,
                    "data": {"msg": "ok", "for": StringPacketOptions.registerConfigSuccess},
                }))

            elif t == RequestType.SetConfig:
                # Ack set config
                await ws.send(json.dumps({
                    "type": RequestType.Success,
                    "data": {"msg": "ok", "for": StringPacketOptions.setConfigSuccess},
                }))
                # Broadcast config update to client
                await ws.send(json.dumps({
                    "type": RequestType.SetConfig,
                    "data": data,
                }))

            elif t == RequestType.RegisterService:
                # Ack register service
                await ws.send(json.dumps({
                    "type": RequestType.Success,
                    "data": {"msg": "ok", "for": StringPacketOptions.registerServiceSuccess},
                }))
                # Trigger service call from server -> client
                await ws.send(json.dumps({
                    "type": RequestType.GetService,
                    "data": {
                        "ServiceId": data.get("ServiceId"),
                        "args": [2, 3],
                        "connectionId": "conn-server-1",
                    },
                }))

            elif t == RequestType.GetServiceResponse:
                # Response from client to server-initiated call
                # Validate result and resolve future
                result = data.get("result")
                assert result == 5, f"Expected 5, got {result}"
                if not self._service_response_future.done():
                    self._service_response_future.set_result(True)

            elif t == RequestType.GetService:
                # Client invokes server service; echo back a computed result
                args = data.get("args", [])
                result = sum(a for a in args if isinstance(a, (int, float)))
                await ws.send(json.dumps({
                    "type": RequestType.GetServiceResponse,
                    "data": {
                        "result": result,
                        "serviceId": data.get("ServiceId"),
                        "connectionId": data.get("connectionId"),
                    },
                }))

    async def wait_service_response(self) -> None:
        await self._service_response_future


async def main() -> None:
    server = TestServer()
    # Start server
    async with ws_serve(server.handler, "localhost", 8765, max_queue=1024):
        # Run client flows
        await initialize_client("py-client-1")

        await register_config_item("example", "desc", "default", "cfg-1")
        await set_config_item("cfg-1", "updated")
        assert get_config_value("cfg-1") == "updated"

        # Register local service and ensure server-initiated call works
        async def add(a: Any, b: Any) -> Any:
            return (a or 0) + (b or 0)

        await register_service("svc-add", ["number", "number"], add)
        await server.wait_service_response()

        # Client-initiated get_service to server
        res = await get_service("svc-server-sum", "py-client-1", [1, 2, 3])
        assert res == 6, f"Expected 6, got {res}"

        await close()
        print("TEST PASSED")


if __name__ == "__main__":
    asyncio.run(main())
