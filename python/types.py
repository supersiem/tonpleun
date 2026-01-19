from enum import IntEnum
from typing import Any, List, Literal, TypedDict
from typing import NotRequired
from typing_extensions import NotRequired

# filepath: /Users/siemvankeulen/Documents/Tonpleun/python/types.py


class RequestType(IntEnum):
    Init = 0
    Success = 1
    Error = 2
    RegisterService = 3
    GetServiceResponse = 4
    GetService = 5
    RegisterConifg = 6  # Note: kept original misspelling to match TS
    SetConfig = 7


class StringPacketOptions(IntEnum):
    Error = 0
    initSuccess = 1
    registerServiceSuccess = 2
    getServiceSuccess = 3
    registerConfigSuccess = 4
    setConfigSuccess = 5


# TS: export type fakeTypeType = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";
FakeTypeType = Literal[
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined",
    "object",
    "function",
]


# TS: export type packet = { type: requestType, data: any }
class Packet(TypedDict):
    type: RequestType
    data: Any


# TS: export type InitPacket = { ClientId: string }
class InitPacket(TypedDict):
    ClientId: str


# TS: export type StringPacket = { msg: string, for: stringPacketOptions }
StringPacket = TypedDict(
    "StringPacket",
    {
        "msg": str,
        "for": StringPacketOptions,  # 'for' is a reserved keyword in Python; use functional TypedDict
    },
)


# TS: export type RegisterServicePacket = { ServiceId: string, args: fakeTypeType[] }
class RegisterServicePacket(TypedDict):
    ServiceId: str
    args: List[FakeTypeType]


# TS: export type getServicePacket = { ClientId: string, ServiceId: string, connectionId: string, args: any[] }
class GetServicePacket(TypedDict):
    ClientId: str
    ServiceId: str
    connectionId: str
    args: List[Any]


# TS: export type args = fakeTypeType[]
Args = List[FakeTypeType]  # 'args' name kept as alias below to match TS


# TS: export type getServicePacketClient = { ServiceId: string, args: any[], connectionId: string }
class GetServicePacketClient(TypedDict):
    ServiceId: str
    args: List[Any]
    connectionId: str


# TS: export type GetServiceResponsePacketToServer = { ServiceId: string, result: any, connectionId: string }
class GetServiceResponsePacketToServer(TypedDict):
    ServiceId: str
    result: Any
    connectionId: str


# TS: export type GetServiceResponsePacketToClient = { result: any, serviceId: string, connectionId: string }
class GetServiceResponsePacketToClient(TypedDict):
    result: Any
    serviceId: str
    connectionId: str


# TS: export type registerConfigPacket = {
#   name: string, id: string, description: string, type: fakeTypeType,
#   defaultValue: any, value?: any
# }
class RegisterConfigPacket(TypedDict, total=False):
    # optional fields go in total=False; required re-declared below
    value: NotRequired[Any]

class RegisterConfigPacket(RegisterConfigPacket, total=True):
    name: str
    id: str
    description: str
    type: FakeTypeType
    defaultValue: Any


# TS: export type setConfigPacket = { ClientId: string, newValue: any, id: string }
class SetConfigPacket(TypedDict):
    ClientId: str
    newValue: Any
    id: str


# Aliases to preserve original TS export names (optional, for convenience)
requestType = RequestType
stringPacketOptions = StringPacketOptions
fakeTypeType = FakeTypeType
packet = Packet
getServicePacket = GetServicePacket
getServicePacketClient = GetServicePacketClient
GetServiceResponsePacket = GetServiceResponsePacketToServer  # not in TS, but common alias
registerConfigPacket = RegisterConfigPacket
setConfigPacket = SetConfigPacket
args = Args