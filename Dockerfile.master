FROM node:20-alpine AS build-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
# Copy the built frontend into a directory the master can serve (we'll update server.js to serve this)
COPY --from=build-frontend /app/frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "src/master/server.js"]
