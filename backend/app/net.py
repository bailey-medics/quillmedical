"""How the backend reaches other services over the network."""

#: The address a client connects *from*, which is how ``httpx`` is told
#: to use IPv4 only. The backend on Cloud Run has no IPv6 route out, and
#: a host with IPv6 addresses is tried in the order the resolver gives
#: them: each IPv6 address hangs for the whole connect timeout before an
#: IPv4 one is reached. Resend's API has two. On 3 October 2026 that made
#: a save from the Settings switch take 10.5 seconds, and the day after
#: it made "forgot password" take 60, long enough for the page to give up
#: with "Request timed out" although the email had been sent.
IPV4_ONLY = "0.0.0.0"  # nosec B104 - a source address, not a listener
