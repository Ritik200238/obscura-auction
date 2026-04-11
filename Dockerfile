FROM node:20-alpine AS builder

WORKDIR /app

# Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY backend/ ./backend/
RUN cd backend && npm run build

# Production
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
