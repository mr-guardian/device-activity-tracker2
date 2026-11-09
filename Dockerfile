# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git python3 make g++

# Backend
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

# Frontend (Hızlı Derleme)
COPY client ./client
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV TSC_COMPILE_ON_ERROR=true
ENV GENERATE_SOURCEMAP=false

RUN cd client && \
    npm install --legacy-peer-deps && \
    npm run build

ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
