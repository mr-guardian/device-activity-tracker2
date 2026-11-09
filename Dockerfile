# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git python3 make g++

# 1. Backend
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

# 2. Frontend
COPY client ./client
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV TSC_COMPILE_ON_ERROR=true
ENV INLINE_RUNTIME_CHUNK=false
ENV NODE_OPTIONS="--max-old-space-size=1024"

RUN cd client && \
    npm install --legacy-peer-deps --no-audit --no-fund && \
    ./node_modules/.bin/react-scripts build

# Port ve kalıcı Baileys oturum klasörü
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
