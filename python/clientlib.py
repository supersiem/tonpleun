import asyncio
import inspect
import json
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
from websockets.client import connect as ws_connect
from websockets.legacy.client import WebSocketClientProtocol
import types
from uuid import uuid4
from python.types import (
    RequestType,
    StringPacketOptions,
    RegisterConfigPacket,
    SetConfigPacket,
)

Callback = Callable[..., Any]

async def _maybe_await(fn: Optional[Callback], *args, **kwargs) -> None:
    if not fn:
        return
    res = fn(*args, **kwargs)
    if inspect.isawaitable(res):
        await res  # type: ignore[func-returns-value]

class WSClient:
    def __init__(
        self,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        subprotocols: Optional[Iterable[str]] = None,
        reconnect: bool = True,
        reconnect_min_delay: float = 1.0,
        reconnect_max_delay: float = 30.0,
        ping_interval: Optional[float] = 20.0,
        ping_timeout: Optional[float] = 20.0,
    ) -> None:
        self.url = url
        self.headers = headers
        self.subprotocols = list(subprotocols) if subprotocols else None
        self.reconnect = reconnect
        self.reconnect_min_delay = reconnect_min_delay
        self.reconnect_max_delay = reconnect_max_delay
        self.ping_interval = ping_interval
        self.ping_timeout = ping_timeout

        self._ws: Optional[WebSocketClientProtocol] = None
        self._send_q: "asyncio.Queue[str]" = asyncio.Queue()
        self._stop = asyncio.Event()

        self.on_connect: Optional[Callback] = None
        self.on_message: Optional[Callback] = None
        self.on_disconnect: Optional[Callback] = None

    async def send(self, message: str) -> None:
        await self._send_q.put(message)

    async def close(self) -> None:
        self._stop.set()
        if self._ws and not self._ws.closed:
            await self._ws.close(code=1000, reason="client closing")

    async def run(self) -> None:
        delay = self.reconnect_min_delay
        while not self._stop.is_set():
            try:
                async with ws_connect(
                    self.url,
                    extra_headers=self.headers,
                    subprotocols=self.subprotocols,
                    ping_interval=self.ping_interval,
                    ping_timeout=self.ping_timeout,
                    max_queue=1024,
                ) as ws:
                    self._ws = ws
                    await _maybe_await(self.on_connect)
                    delay = self.reconnect_min_delay

                    recv_task = asyncio.create_task(self._recv_loop(ws))
                    send_task = asyncio.create_task(self._send_loop(ws))
                    stop_task = asyncio.create_task(self._stop.wait())

                    _done, pending = await asyncio.wait(
                        {recv_task, send_task, stop_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for t in pending:
                        t.cancel()

                    if self._stop.is_set():
                        break

            except Exception as exc:
                await _maybe_await(self.on_disconnect, exc)
                if not self.reconnect or self._stop.is_set():
                    break
                await asyncio.sleep(delay)
                delay = min(delay * 2, self.reconnect_max_delay)
            else:
                await _maybe_await(self.on_disconnect, None)
                if not self.reconnect or self._stop.is_set():
                    break
                await asyncio.sleep(delay)
                delay = min(delay * 2, self.reconnect_max_delay)

    async def _recv_loop(self, ws: WebSocketClientProtocol) -> None:
        async for msg in ws:
            if isinstance(msg, (bytes, bytearray)):
                continue
            await _maybe_await(self.on_message, msg)

    async def _send_loop(self, ws: WebSocketClientProtocol) -> None:
        while True:
            msg = await self._send_q.get()
            await ws.send(msg)


# === Tonpleun-specific client, mirroring src/clientLib.ts ===

class TonpleunClient:
    def __init__(self, url: str = "ws://localhost:8765") -> None:
        self.url = url
        self.wsclient = WSClient(url)
        self.client_id: str = "error"
        self.service_callbacks: Dict[str, Callback] = {}
        self.local_configs: Dict[str, Dict[str, Any]] = {}

        # Each waiter: (predicate(pkt_dict) -> bool, future to resolve with pkt['data'])
        self._waiters: List[Tuple[Callable[[Dict[str, Any]], bool], asyncio.Future]] = []
        self._run_task: Optional[asyncio.Task] = None

        # Wire up callbacks
        self.wsclient.on_connect = self._on_connect
        self.wsclient.on_message = self._on_message
        self.wsclient.on_disconnect = self._on_disconnect

    async def start(self, client_id: str) -> None:
        self.client_id = client_id
        if self._run_task is None or self._run_task.done():
            self._run_task = asyncio.create_task(self.wsclient.run())
        # Wait for init success ack from server
        await self.await_service_message(StringPacketOptions.initSuccess)

    async def close(self) -> None:
        await self.wsclient.close()

    async def send_packet(self, packet: Dict[str, Any]) -> None:
        await self.wsclient.send(json.dumps(packet))

    async def await_service_message(self, expected_for: StringPacketOptions) -> Dict[str, Any]:
        future: asyncio.Future = asyncio.get_running_loop().create_future()

        def predicate(pkt: Dict[str, Any]) -> bool:
            try:
                return (
                    pkt.get("type") == RequestType.Success
                    and isinstance(pkt.get("data"), dict)
                    and pkt["data"].get("for") == expected_for
                )
            except Exception:
                return False

        # Register waiter before sending to avoid race conditions
        self._waiters.append((predicate, future))
        return await future

    async def register_config_item(self, name: str, description: str, value: str, idthing: str) -> None:
        self.local_configs[idthing] = {
            "name": name,
            "id": idthing,
            "description": description,
            "type": type(value).__name__,
            "defaultValue": value,
        }
        # Prepare waiter before sending
        waiter = asyncio.create_task(self.await_service_message(StringPacketOptions.registerConfigSuccess))
        await self.send_packet({
            "type": RequestType.RegisterConifg,
            "data": {
                "name": name,
                "description": description,
                "defaultValue": value,
                "type": type(value).__name__,
                "id": idthing,
            },
        })
        await waiter

    async def set_config_item(self, idthing: str, new_value: str, client_id: Optional[str] = None) -> None:
        # Prepare waiter before sending
        waiter = asyncio.create_task(self.await_service_message(StringPacketOptions.setConfigSuccess))
        await self.send_packet({
            "type": RequestType.SetConfig,
            "data": {
                "ClientId": client_id or self.client_id,
                "id": idthing,
                "newValue": new_value,
            },
        })
        await waiter
        existing = self.local_configs.get(idthing)
        if existing:
            existing["value"] = new_value
            self.local_configs[idthing] = existing

    async def register_service(self, service_id: str, args: Iterable[str], callback: Callback) -> None:
        self.service_callbacks[service_id] = callback
        waiter = asyncio.create_task(self.await_service_message(StringPacketOptions.registerServiceSuccess))
        await self.send_packet({
            "type": RequestType.RegisterService,
            "data": {
                "ServiceId": service_id,
                "args": list(args),
            },
        })
        await waiter

    async def get_service(self, service_id: str, client_id: str, inputs: Iterable[Any]) -> Any:
        connection_id = str(uuid4())

        future: asyncio.Future = asyncio.get_running_loop().create_future()

        def predicate(pkt: Dict[str, Any]) -> bool:
            try:
                return (
                    pkt.get("type") == RequestType.GetServiceResponse
                    and isinstance(pkt.get("data"), dict)
                    and pkt["data"].get("serviceId") == service_id
                    and pkt["data"].get("connectionId") == connection_id
                )
            except Exception:
                return False

        self._waiters.append((predicate, future))
        await self.send_packet({
            "type": RequestType.GetService,
            "data": {
                "ClientId": client_id,
                "ServiceId": service_id,
                "args": list(inputs),
                "connectionId": connection_id,
            },
        })

        data = await future
        # Server response data should contain 'result'
        return data.get("result")

    def get_config_value(self, idthing: str) -> Any:
        item = self.local_configs.get(idthing)
        if not item:
            return None
        return item.get("value") if "value" in item else item.get("defaultValue")

    async def _on_connect(self) -> None:
        # Send Init packet when connection is established
        await self.send_packet({
            "type": RequestType.Init,
            "data": {
                "ClientId": self.client_id,
            },
        })

    async def _on_disconnect(self, exc: Optional[BaseException]) -> None:
        # Optional: log or handle reconnection strategies
        return

    async def _on_message(self, raw_msg: str) -> None:
        try:
            pkt = json.loads(raw_msg)
            # Handle server-initiated service execution
            if pkt.get("type") == RequestType.GetService:
                data = pkt.get("data", {})
                service_id = data.get("ServiceId")
                args = data.get("args", [])
                connection_id = data.get("connectionId")
                callback = self.service_callbacks.get(service_id)
                if callback:
                    try:
                        # Support sync and async callbacks
                        res = callback(*args)
                        if inspect.isawaitable(res):
                            res = await res  # type: ignore[assignment]
                        await self.send_packet({
                            "type": RequestType.GetServiceResponse,
                            "data": {
                                "result": res,
                                "ServiceId": service_id,
                                "connectionId": connection_id,
                            },
                        })
                    except Exception:
                        # Swallow exceptions to avoid breaking recv loop; server may handle errors
                        pass
            elif pkt.get("type") == RequestType.SetConfig:
                data = pkt.get("data", {})
                idthing = data.get("id")
                new_value = data.get("newValue")
                if idthing in self.local_configs:
                    existing = self.local_configs[idthing]
                    existing["value"] = new_value
                    self.local_configs[idthing] = existing

            # Resolve any waiters that match this packet
            if self._waiters:
                remaining: List[Tuple[Callable[[Dict[str, Any]], bool], asyncio.Future]] = []
                for predicate, fut in self._waiters:
                    if not fut.done() and predicate(pkt):
                        try:
                            fut.set_result(pkt.get("data", {}))
                        except Exception:
                            # If setting result fails, keep waiter to avoid dropping it silently
                            remaining.append((predicate, fut))
                    else:
                        remaining.append((predicate, fut))
                self._waiters = remaining
        except Exception:
            # Ignore malformed JSON or unexpected payloads
            pass


# Module-level singleton-style API mirroring TS functions
_client: Optional[TonpleunClient] = None


async def initialize_client(client_id: str, url: str = "ws://localhost:8765") -> None:
    global _client
    _client = TonpleunClient(url)
    await _client.start(client_id)


async def await_service_message(expected_for: StringPacketOptions) -> Dict[str, Any]:
    if not _client:
        raise RuntimeError("Client not initialized. Call initialize_client() first.")
    return await _client.await_service_message(expected_for)


async def register_config_item(name: str, description: str, value: str, idthing: str) -> None:
    if not _client:
        raise RuntimeError("Client not initialized. Call initialize_client() first.")
    await _client.register_config_item(name, description, value, idthing)


async def set_config_item(idthing: str, new_value: str, client_id: Optional[str] = None) -> None:
    if not _client:
        raise RuntimeError("Client not initialized. Call initialize_client() first.")
    await _client.set_config_item(idthing, new_value, client_id)


async def register_service(service_id: str, args: Iterable[str], callback: Callback) -> None:
    if not _client:
        raise RuntimeError("Client not initialized. Call initialize_client() first.")
    await _client.register_service(service_id, args, callback)


async def get_service(service_id: str, client_id: str, inputs: Iterable[Any]) -> Any:
    if not _client:
        raise RuntimeError("Client not initialized. Call initialize_client() first.")
    return await _client.get_service(service_id, client_id, inputs)


def get_config_value(idthing: str) -> Any:
    if not _client:
        return None
    return _client.get_config_value(idthing)


async def close() -> None:
    if _client:
        await _client.close()


