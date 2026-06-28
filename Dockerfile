# Stage 1: deps — install node_modules
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: test — run unit tests
FROM deps AS test
COPY . .
RUN npm test

# Stage 3: build — produce /app/dist
FROM deps AS build
COPY . .
ARG VITE_APP_VERSION=docker
ARG VITE_METAR_PROXY_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_METAR_PROXY_URL=$VITE_METAR_PROXY_URL
RUN npm run build

# Stage 4: serve for local preview
FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html/drone-weather
