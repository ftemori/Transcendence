FROM node:20-alpine

RUN apk add --no-cache python3 make g++ pkgconf sqlite

WORKDIR /app

# Copy package.json and package-lock.json for dependencies
COPY user_auth/package*.json ./
COPY user_auth/tsconfig.json ./

# Install dependencies (including typescript as devDependency)
RUN npm install

# Copy rest of the source code
COPY user_auth/site ./site
RUN mkdir -p /app/site/build/db-auth


# Build the TypeScript project (assumes your tsconfig outputs to build/)
RUN npx tsc

ENV NODE_PATH=/app/node_modules
EXPOSE 4000

# Run DB init first, then your app
CMD ["node", "/app/site/build/auth.js"]

