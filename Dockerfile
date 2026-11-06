# Dora Search Gateway - Node.js container for Fly.io (and other Docker hosts)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
CMD ["node", "dist/index.js"]
