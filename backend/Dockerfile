FROM node:20-alpine

WORKDIR /app

# Copy dependencies and install with npm
COPY backend/package.json ./backend/
RUN cd backend && npm install

COPY . .

# Build TypeScript
RUN cd backend && npm run build

CMD ["node", "backend/build/backend/src/server.js"]
