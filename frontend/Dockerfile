# Build stage
FROM node:22.13.1-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Install openssl for certificate generation
RUN apk add --no-cache openssl


# Copy build artifacts
COPY --from=build /app/dist /usr/share/nginx/html

# SSL certificates directory
RUN mkdir -p /etc/nginx/ssl

# Copy nginx config and entrypoint
COPY nginx-http.conf /etc/nginx/conf.d/nginx-http.conf.placeholder
COPY nginx-https.conf /etc/nginx/conf.d/nginx-https.conf.placeholder
COPY entrypoint.sh /entrypoint.sh

# Make entrypoint executable
RUN chmod +x /entrypoint.sh

# Runtime configuration directory
VOLUME /runtime-config

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
#CMD ["sleep","infinity"]
CMD ["nginx", "-g", "daemon off;"]