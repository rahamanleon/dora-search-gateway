# Mock SearXNG origin for Dora Search (Fly.io) - serves real DuckDuckGo results
FROM node:20-alpine
WORKDIR /app
COPY ./server.mjs ./server.mjs
ENV PORTS=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
