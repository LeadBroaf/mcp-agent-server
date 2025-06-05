FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Install all dependencies (including devDependencies) for build
RUN npm install
# Ensure tsc is available globally
RUN npm install -g typescript

COPY . .

RUN npm run build
# Remove devDependencies for production
RUN npm prune --production
RUN npx prisma generate

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
