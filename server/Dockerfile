FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# --include=dev es explícito a propósito: Coolify pasa las variables de entorno
# como build args, así que NODE_ENV=production llega hasta acá y sin esto npm
# saltea las devDependencies — dejando al build sin TypeScript.
RUN npm ci --include=dev || npm install --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
RUN npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "dist/index.js"]
