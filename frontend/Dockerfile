FROM node:20-alpine

WORKDIR /app

# Copy dependencies and install with npm
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install

# Copy the full app (including shared_types)
COPY . .

# Copy SSL certificates
COPY certs/ /app/certs/

# Build TypeScript
RUN cd frontend && npm run build

# Start the frontend
CMD ["node", "frontend/src/server.js"]
EXPOSE 8080
