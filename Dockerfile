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
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN cd client && \
    npm install --legacy-peer-deps && \
    npm run build

# Port ve Oturum Klasörü
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
