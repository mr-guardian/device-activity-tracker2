# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install git, unzip and build dependencies
RUN apk add --no-cache git python3 make g++ unzip

# Copy backend package files
COPY package*.json ./
COPY tsconfig.json ./

# Install backend dependencies
RUN npm install --ignore-scripts

# Copy backend source code
COPY src ./src

# Build Backend TypeScript
RUN npm run build

# --- Frontend Build Etabı ---
COPY client ./client

# Client bağımlılıklarını kur, ajv çakışmasını gider ve derle
RUN cd client && \
    npm install --legacy-peer-deps && \
    npm install ajv@^8.0.0 --legacy-peer-deps && \
    TSC_COMPILE_ON_ERROR=true npm run build

# Expose port
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

# Oturum arşivini kopyala ve çıkart
COPY auth.zip ./
RUN unzip -q auth.zip && rm auth.zip

CMD ["node", "dist/server.js"]
