# --- Stage 1: build the static web app ---
FROM node:20-slim AS builder

WORKDIR /app

# Install deps first so this layer is cached unless package.json changes
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# app.config.js reads secrets from a real .env file (not process.env) unless CI=true,
# so write one from the build args instead of relying on ENV vars alone.
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
RUN printf "EXPO_PUBLIC_SUPABASE_URL=%s\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\n" \
      "$EXPO_PUBLIC_SUPABASE_URL" "$EXPO_PUBLIC_SUPABASE_ANON_KEY" > .env

RUN npm run build:web

# --- Stage 2: serve the static output with nginx ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
