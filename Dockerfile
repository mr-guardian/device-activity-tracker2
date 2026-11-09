# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

# Gerekli sistem araçları
RUN apk add --no-cache git python3 make g++

# --- Backend Etabı ---
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

# --- Frontend Etabı ---
COPY client ./client
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV TSC_COMPILE_ON_ERROR=true

RUN cd client && \
    npm install --legacy-peer-deps && \
    npm install ajv@^6.12.6 ajv-keywords@^3.5.2 --legacy-peer-deps && \
    npm run build && \
    ls -la build/

# Port ve Kalıcı Hafıza
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
