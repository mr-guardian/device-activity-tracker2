FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm install
RUN cd client && npm install

COPY . .

RUN cd client && npm run build

RUN mkdir -p /app/auth_data

ENV PORT=3000
ENV AUTH_PATH=/app/auth_data

EXPOSE 3000

CMD ["npm", "run", "start:server"]
