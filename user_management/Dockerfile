FROM node:20-alpine

RUN apk add --no-cache python3 make g++ pkgconf sqlite

WORKDIR /app

# Copy package.json and package-lock.json for dependencies
COPY user_management/package*.json ./
COPY user_management/tsconfig.json ./

# Install dependencies (including typescript as devDependency)
RUN npm install

# Copy rest of the source code
COPY user_management/site ./site
RUN mkdir -p /app/site/build/db-users

# Build the TypeScript project (assumes your tsconfig outputs to build/)
RUN npx tsc

ENV NODE_PATH=/app/node_modules
EXPOSE 5100
#RUN mkdir -p /app/site/build

# Compile or run init-db
CMD ["node", "/app/site/build/manage.js"]
