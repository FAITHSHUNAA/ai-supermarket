FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY client ./client
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/client/dist/ /usr/share/nginx/html/
