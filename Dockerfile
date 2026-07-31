# Build the SPA, then run the API which also serves it. Optional path — the
# bare-metal + systemd setup in docs/DEPLOY.md is the primary one for a home box.
FROM node:26-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim AS run
WORKDIR /app
ENV JOURNEY_ENV=production
# DB + attachments live on a persistent volume (see VOLUME below).
ENV JOURNEY_DB_PATH=/data/journey.db
ENV PORT=8787
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
VOLUME /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
