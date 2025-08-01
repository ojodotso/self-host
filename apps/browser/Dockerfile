FROM ubuntu:jammy AS node

ENV DEBIAN_FRONTEND=noninteractive
ENV NVM_DIR "/root/.nvm"
ENV NVM_VERSION "0.39.7"
ENV NODE_VERSION "20.11.0"
ENV NODE_PATH "$NVM_DIR/v$NODE_VERSION/lib/node_modules"
ENV PATH "$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

RUN rm /bin/sh && ln -s /bin/bash /bin/sh
RUN apt update && apt -y install curl libatomic1 ffmpeg make python3 gcc g++ lsb-core && apt-get clean
RUN curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/v$NVM_VERSION/install.sh" | bash && rm -rf "$NVM_DIR/.cache"

FROM node AS base

RUN npm i -g playwright-core && rm -rf /root/.npm

ENV IMAGE_INFO="$(lsb_release -ds), Node $(node -v), Playwright $(playwright-core -V)"
CMD eval echo $IMAGE_INFO

FROM base AS pnpm

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm i -g pnpm && rm -rf /root/.npm

FROM pnpm AS chrome

RUN [ $(arch) == "armv7l" ] || [ $(arch) == "aarch64" ] || playwright-core install --with-deps chrome

ENV IMAGE_INFO="$IMAGE_INFO, $(/usr/bin/google-chrome --version)"

FROM pnpm AS builder

RUN pnpm add -g turbo@2.0.4
COPY . .
RUN turbo prune browser --docker

FROM pnpm AS installer

WORKDIR /app

COPY --from=builder /out/json/ .
COPY --from=builder /out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install

COPY --from=builder /out/full/ .
COPY turbo.json turbo.json

RUN pnpm turbo build --filter=browser

FROM chrome AS production

WORKDIR /server

COPY --from=installer /app .

CMD cd apps/browser && pnpm start
