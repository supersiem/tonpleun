import asyncio
from typing import Any

from python.clientlib import (
    initialize_client,
    register_config_item,
    set_config_item,
    get_config_value,
    register_service,
    get_service,
    close,
)


async def main() -> None:
    # Connect to TS server running on localhost:8765
    await initialize_client("py-client-1")

    # Config roundtrip: register and update
    await register_config_item("example", "desc", "default", "cfg-1")
    await set_config_item("cfg-1", "updated")
    assert get_config_value("cfg-1") == "updated", "Config value did not update"

    # Register a local service and then request via server to ourselves
    async def add(a: Any, b: Any) -> Any:
        return (a or 0) + (b or 0)

    await register_service("svc-add", ["number", "number"], add)

    # Client-initiated request routed by TS server back to our client
    res = await get_service("svc-add", "py-client-1", [2, 3])
    assert res == 5, f"Expected 5, got {res}"

    # Call a local Tonpleun service to retrieve services map
    services_map = await get_service("getServices", "tonpleun", [])
    assert "py-client-1" in services_map, "Our client services not listed"
    assert "svc-add" in services_map["py-client-1"], "svc-add not registered"

    await close()
    print("TS SERVER TEST PASSED")


if __name__ == "__main__":
    asyncio.run(main())
