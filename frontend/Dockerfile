# Build stage
FROM node:22.13.1-alpine AS build

WORKDIR /app

# Copy package.json and package-lock.json to install dependencies (leverage cache)
COPY package*.json ./
RUN npm install

# Copy the rest of the application files and build the frontend
COPY . .

# Set environment variable for build process
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy the build artifacts from the build stage to the nginx HTML directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the custom nginx configuration and entrypoint script
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set entrypoint and command for nginx
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
