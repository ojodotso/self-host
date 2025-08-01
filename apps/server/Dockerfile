ARG APP_NAME="server"
ARG PNPM_HOME="/root/.local/share/pnpm"

FROM node:22-alpine AS base

FROM base AS builder

WORKDIR /app

ARG APP_NAME
ARG PNPM_HOME
ENV PNPM_HOME=${PNPM_HOME}
ENV PATH="${PATH}:${PNPM_HOME}"

RUN corepack enable && npm install -g corepack@latest
RUN pnpm add -g turbo@2.0.4
COPY . .

RUN turbo prune ${APP_NAME} --docker

FROM base AS installer

WORKDIR /app

ARG APP_NAME
ARG PNPM_HOME
ENV PNPM_HOME=${PNPM_HOME}
ENV PATH="${PATH}:${PNPM_HOME}"

RUN corepack enable && npm install -g corepack@latest

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

RUN pnpm turbo build --filter=${APP_NAME}

FROM base AS production

WORKDIR /app

ARG APP_NAME
ARG PNPM_HOME
ENV PNPM_HOME=${PNPM_HOME}
ENV PATH="${PATH}:${PNPM_HOME}"
ENV NODE_ENV="production"

RUN corepack enable && npm install -g corepack@latest

COPY --from=installer /app .

USER node

WORKDIR /app/apps/${APP_NAME}

CMD ["pnpm", "start"]
