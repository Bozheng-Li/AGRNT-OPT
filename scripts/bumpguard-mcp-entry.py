"""Launch BumpGuard without exposing the MCP protocol stream to child tools."""

from __future__ import annotations

import subprocess
from typing import Any


_original_run = subprocess.run


def _run_without_mcp_stdin(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[Any]:
    kwargs.setdefault("stdin", subprocess.DEVNULL)
    return _original_run(*args, **kwargs)


subprocess.run = _run_without_mcp_stdin

from bumpguard.server import main  # noqa: E402


if __name__ == "__main__":
    main()
