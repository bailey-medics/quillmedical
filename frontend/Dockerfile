FROM node:24-alpine3.21

WORKDIR /app

# Install dependencies (use package-lock if present for reproducible installs)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy app sources
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]