# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Create SSL directory
RUN mkdir -p ssl

# Generate self-signed certificates for development
RUN apk add --no-cache openssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout ssl/private.key -out ssl/certificate.crt \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Expose ports
EXPOSE 3003 3443

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003
ENV HTTPS_PORT=3443

# Start the application
CMD ["npm", "start"] 