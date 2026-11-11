FROM hyperledger/besu:26.10.0 AS besu

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY apps ./apps
COPY src ./src
COPY scripts ./scripts
COPY network ./network
RUN VITE_BASE_PATH=/blockchain/ npm run build:blockchain
RUN VITE_BASE_PATH=/explorer/ npm run build:explorer
RUN VITE_BASE_PATH=/dapp/ npm run build:dapp

FROM node:22-bookworm-slim
ENV NODE_ENV=production
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/opt/besu/bin:/opt/java/openjdk/bin:${PATH}"
ENV JAVA_TOOL_OPTIONS="-Xms32m -Xmx192m -XX:MaxMetaspaceSize=96m -XX:MaxDirectMemorySize=64m"
WORKDIR /app
COPY --from=besu /opt/besu /opt/besu
COPY --from=besu /opt/java/openjdk /opt/java/openjdk
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/history-index.mjs ./scripts/history-index.mjs
COPY --from=build /app/scripts/render-server.mjs ./scripts/render-server.mjs
COPY --from=build /app/network/besu/genesis.js ./network/besu/genesis.js
COPY --from=build /app/apps/blockchain/dist ./apps/blockchain/dist
COPY --from=build /app/apps/explorer/dist ./apps/explorer/dist
COPY --from=build /app/apps/dapp/dist ./apps/dapp/dist
USER node
EXPOSE 10000
CMD ["node", "scripts/render-server.mjs"]
