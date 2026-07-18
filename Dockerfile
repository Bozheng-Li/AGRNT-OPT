# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.ts tsconfig.json ./
COPY catalog ./catalog
COPY scripts ./scripts
COPY src ./src
COPY public ./public
RUN npm run build

FROM base AS runtime

ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1 \
  PIP_DISABLE_PIP_VERSION_CHECK=1 \
  PYTHONUNBUFFERED=1 \
  DOTNET_ROOT=/opt/dotnet \
  DOTNET_CLI_TELEMETRY_OPTOUT=1 \
  DOTNET_NOLOGO=1 \
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
  DOTNET_MULTILEVEL_LOOKUP=0

# .NET 8 SDK for BumpGuard (Linux x64). Kept outside /app/var so runtime volumes do not hide it.
ARG DOTNET_SDK_VERSION=8.0.423
RUN mkdir -p /opt/dotnet /app/var/runtime \
  && curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
  && bash /tmp/dotnet-install.sh --version "${DOTNET_SDK_VERSION}" --install-dir /opt/dotnet \
  && rm /tmp/dotnet-install.sh \
  && /opt/dotnet/dotnet --version

COPY package.json package-lock.json requirements-mcp.txt requirements-markitdown-mcp.txt next.config.ts tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY catalog ./catalog
COPY scripts ./scripts
COPY public ./public

# Python MCP servers used by timezone / fetch / git / sqlite / defluff / oxidize-pdf / bumpguard.
RUN python3 -m venv /app/.venv \
  && /app/.venv/bin/pip install --upgrade pip \
  && /app/.venv/bin/pip install -r requirements-mcp.txt \
  && python3 -m venv /app/.venv-markitdown \
  && /app/.venv-markitdown/bin/pip install --upgrade pip \
  && /app/.venv-markitdown/bin/pip install -r requirements-markitdown-mcp.txt \
  && /app/.venv-markitdown/bin/pip install --no-deps markitdown-mcp==0.0.1a4 \
  && mkdir -p /app/var/runtime \
  && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:3000/" >/dev/null || exit 1

CMD ["npm", "run", "start"]
