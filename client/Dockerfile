# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

# Gerekli sistem paketleri
RUN apk add --no-cache git python3 make g++

# Backend
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

# Frontend
COPY client ./client
ENV CI=false
ENV TSC_COMPILE_ON_ERROR=true
ENV DISABLE_ESLINT_PLUGIN=true

RUN cd client && \
    npm install --legacy-peer-deps && \
    npm install ajv@^8.0.0 --legacy-peer-deps && \
    npm run build

# Port ve kalıcı volume klasörü
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
