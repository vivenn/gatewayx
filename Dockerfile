# Multi-stage build: compile TypeScript in a full node image, run the
# compiled output in a slim one — keeps the production image small and free
# of dev dependencies/toolchain.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/config/routes.docker.yaml ./dist/config/routes.docker.yaml

# Runs as the non-root `node` user baked into the base image, not root.
USER node

EXPOSE 8080
CMD ["node", "dist/src/index.js"]
