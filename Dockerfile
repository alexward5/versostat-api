# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Need curl here if you keep the CA download in this stage
RUN apk add --no-cache curl ca-certificates

ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Add the Amazon RDS trust bundle (covers all regions)
RUN mkdir -p /etc/ssl/certs \
 && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    -o /etc/ssl/certs/rds-global-bundle.pem \
 && chmod 0644 /etc/ssl/certs/rds-global-bundle.pem

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Needed for HEALTHCHECK and TLS trust store
RUN apk add --no-cache wget ca-certificates

# Bring the CA bundle into the runtime image
COPY --from=build /etc/ssl/certs/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=build /app/dist ./dist

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

# Run as non-root
USER node
CMD ["node", "dist/index.js"]
