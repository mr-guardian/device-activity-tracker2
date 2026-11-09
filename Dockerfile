# Backend & Frontend Unified Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install git and build dependencies
RUN apk add --no-cache git python3 make g++

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
# Client klasörünü kopyala
COPY client ./client

# Client bağımlılıklarını kur, ajv çakışmasını gider ve derle
RUN cd client && \
    npm install --legacy-peer-deps && \
    npm install ajv@^8.0.0 --legacy-peer-deps && \
    TSC_COMPILE_ON_ERROR=true npm run build

# Expose port (can be overridden by environment variable)
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

# Create directory for WhatsApp auth state
RUN mkdir -p /app/auth_info_baileys

CMD ["node", "dist/server.js"]
