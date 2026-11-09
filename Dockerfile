# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

# Gerekli sistem paketleri
RUN apk add --no-cache git python3 make g++

# Backend bağımlılıkları ve derleme
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

# Frontend hazırlık ve derleme
COPY client ./client
RUN cd client && \
    npm install --legacy-peer-deps && \
    CI=false npm run build

# Port ve klasör tanımları
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
