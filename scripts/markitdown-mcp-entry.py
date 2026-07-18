"""Security bootstrap for Microsoft's pinned MarkItDown MCP stdio server.

The upstream 0.0.1a4 package permits arbitrary URI schemes supported by
MarkItDown. Agent-OPT supplies only a validated sandbox file URI and blocks
network and subprocess primitives before importing the exact upstream tool.
"""

from __future__ import annotations

import os
import subprocess
import sys
import urllib.request
from typing import NoReturn


def _denied(*_args: object, **_kwargs: object) -> NoReturn:
    raise PermissionError("Agent-OPT disables network and subprocess access for MarkItDown MCP")


for key in list(os.environ):
    upper = key.upper()
    if upper.startswith(("AZURE_", "OPENAI_")) or upper in {
        "ALL_PROXY",
        "EXIFTOOL_PATH",
        "FTP_PROXY",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "MARKITDOWN_ENABLE_PLUGINS",
        "NO_PROXY",
    }:
        os.environ.pop(key, None)

from markitdown_mcp.__main__ import main  # noqa: E402
import httpx  # noqa: E402
import requests  # noqa: E402

requests.sessions.Session.request = _denied
requests.get = _denied
requests.post = _denied
httpx.Client.request = _denied
httpx.AsyncClient.request = _denied
urllib.request.urlopen = _denied
subprocess.Popen = _denied
subprocess.call = _denied
subprocess.check_call = _denied
subprocess.check_output = _denied
subprocess.run = _denied
os.system = _denied


if __name__ == "__main__":
    if "--security-probe" in sys.argv:
        checks = 0
        for operation in (
            lambda: requests.get("http://127.0.0.1/"),
            lambda: subprocess.run(["python", "--version"]),
        ):
            try:
                operation()
            except PermissionError:
                checks += 1
        leaked = [
            key for key in os.environ
            if key.upper().startswith(("AZURE_", "OPENAI_"))
            or key.upper() in {"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "EXIFTOOL_PATH", "MARKITDOWN_ENABLE_PLUGINS"}
        ]
        if checks != 2 or leaked:
            raise RuntimeError("MarkItDown bootstrap security probe failed")
        print("network-and-subprocess-disabled")
        raise SystemExit(0)
    main()
