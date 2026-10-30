"""The address a request came from, as far as it can be trusted.

The rate limits and the access log both need the client's address, and
neither may take it from ``X-Forwarded-For`` as it arrives. The load
balancer appends the real address to that header but passes through
whatever the client wrote before it, and uvicorn, run with
``--forwarded-allow-ips *``, reads the leftmost entry: the client's own.
A limit keyed on that is a limit per request, not per client.

So the address is read from a header the load balancer writes itself,
``TRUSTED_CLIENT_IP_HEADER``. Google's external Application Load
Balancer overwrites a custom request header of the same name a client
sends, so its value is the address that opened the connection. The
header is configured on the backend service in
``infra/modules/load-balancer/main.tf``, and the setting in
``infra/main.tf`` beside it.

Where the setting is unset, as in development and tests, or the header
is missing, as on a call from inside the VPC that never passed the load
balancer, the connection's peer address is used, as before.
"""

import ipaddress

from starlette.requests import Request

from app.config import settings

#: What slowapi's own ``get_remote_address`` answers with no peer at all,
#: kept so a request with neither header nor peer is still limited.
_NO_ADDRESS = "127.0.0.1"


def client_address(request: Request) -> str:
    """The address of the client that sent *request*.

    Args:
        request: The incoming request.

    Returns:
        The address from the trusted header when it is configured and
        holds a valid IP address, otherwise the connection's peer.
    """
    header = settings.TRUSTED_CLIENT_IP_HEADER

    if header:
        value = request.headers.get(header, "").strip()
        try:
            return str(ipaddress.ip_address(value))
        except ValueError:
            pass

    if request.client and request.client.host:
        return request.client.host

    return _NO_ADDRESS
