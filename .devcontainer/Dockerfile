FROM oven/bun:1-debian

# wrangler requires Node alongside Bun
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
