FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
RUN npm ci
COPY . .
RUN npx prisma generate && npx turbo run build --filter=@billbistro/api...

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
