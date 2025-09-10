FROM node:24-alpine3.21

WORKDIR /app

# Copy dependency files and Yarn Berry config
COPY package.json yarn.lock .yarnrc.yml ./
RUN mkdir -p .yarn/releases
COPY .yarn/releases/* ./.yarn/releases/

# Install dependencies using Yarn Berry
RUN yarn install

# Copy the rest of the application
COPY . .

EXPOSE 3000

CMD ["yarn", "dev", "-H", "0.0.0.0"]