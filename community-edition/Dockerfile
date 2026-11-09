FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npx", "tsx", "src/http/server.ts"]
