# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git python3 make g++

# 1. Backend Hazırlık
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

# 2. Frontend Hazırlık
COPY client ./client
WORKDIR /app/client

ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV TSC_COMPILE_ON_ERROR=true
ENV ESLINT_NO_DEV_ERRORS=true

RUN npm install --legacy-peer-deps --no-audit --no-fund
RUN CI=false TSC_COMPILE_ON_ERROR=true GENERATE_SOURCEMAP=false DISABLE_ESLINT_PLUGIN=true node_modules/.bin/react-scripts build

# 3. Kök dizine dön ve başlat
WORKDIR /app
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
