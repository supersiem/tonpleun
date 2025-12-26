import asyncio
import json
from typing import Any, Callable, Dict, List, Optional, TypedDict
import websockets

url = "ws://localhost:8765"


class Message(TypedDict, total=False):
    status: str
    human_readable: str
    callbackId: int
    serviceId: str
    args: List[Any]
    data: Any


ws: Optional[websockets.WebSocketClientProtocol] = None

success_handler: Optional[Callable[[Any], None]] = None
error_handler: Optional[Callable[[Any], None]] = None
debug_logging: bool = False
service_handlers: Dict[str, Callable[[List[Any]], Any]] = {}

_listen_task: Optional[asyncio.Task] = None


def debug_log(*message: Any) -> None:
    if debug_logging:
        print("[DEBUG]", *message)


async def parse_data(msg: Message) -> None:
    global ws, success_handler, error_handler

    if ws is None:
        print("WebSocket is niet geïnitialiseerd.")
        return

    status = msg.get("status")

    if status == "200":
        debug_log("Ontvangen data:", msg.get("data"))
        if success_handler:
            try:
                success_handler(msg.get("data"))
            finally:
                # reset handlers after one-shot call
                success_handler = None
                error_handler = None

    elif status == "700":
        debug_log("Service oproep ontvangen:", msg.get("callbackId"))
        service_id = msg.get("serviceId", "")
        handler = service_handlers.get(service_id)
        args = msg.get("args", []) or []
        result: Any = args

        if handler:
            try:
                result = handler(args)
            except Exception as e:
                debug_log("Service handler fout:", e)
                result = {"error": str(e)}

        await ws.send(
            json.dumps(
                {
                    "action": "response",
                    "callbackId": msg.get("callbackId"),
                    "data": result,
                }
            )
        )
    else:
        if error_handler:
            error_handler(msg)
        else:
            print("Onbekend bericht:", msg)


async def _listen() -> None:
    global ws
    assert ws is not None

    try:
        while True:
            raw = await ws.recv()
            try:
                data = json.loads(raw)
            except Exception:
                debug_log("Kon bericht niet parsen:", raw)
                continue
            await parse_data(data)
    except websockets.ConnectionClosed:
        debug_log("Verbinding gesloten tijdens luisteren.")


async def register_service(
    service_id: str,
    handler: Callable[[List[Any]], Any],
    args: Optional[List[str]] = None,
) -> None:
    global ws, service_handlers
    if ws is None:
        print("WebSocket is niet geïnitialiseerd.")
        return

    service_handlers[service_id] = handler
    await ws.send(
        json.dumps(
            {
                "action": "register",
                "service": service_id,
                "args": args or [],
            }
        )
    )


async def call_service(
    service_id: str,
    args: List[Any],
    on_success: Callable[[Any], None],
    on_error: Callable[[Any], None],
) -> None:
    global ws, success_handler, error_handler
    if ws is None:
        print("WebSocket is niet geïnitialiseerd.")
        return

    success_handler = on_success
    error_handler = on_error
    await ws.send(
        json.dumps(
            {
                "action": "get",
                "service": service_id,
                "args": args,
            }
        )
    )


async def call_service_async(service_id: str, args: List[Any]) -> Any:
    global ws, success_handler, error_handler
    if ws is None:
        raise RuntimeError("WebSocket is niet geïnitialiseerd.")

    loop = asyncio.get_running_loop()
    fut: asyncio.Future[Any] = loop.create_future()

    def _ok(data: Any) -> None:
        if not fut.done():
            fut.set_result(data)

    def _err(error: Any) -> None:
        if not fut.done():
            fut.set_exception(
                RuntimeError(error if isinstance(error, str) else str(error))
            )

    success_handler = _ok
    error_handler = _err

    await ws.send(
        json.dumps(
            {
                "action": "get",
                "service": service_id,
                "args": args,
            }
        )
    )

    return await fut


async def initialize_client() -> None:
    global ws, _listen_task

    ws = await websockets.connect(url)

    debug_log("Verbonden met de server")
    print("Verbonden met tonpleun server.")

    _listen_task = asyncio.create_task(_listen())
