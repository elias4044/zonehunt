# Builds the static app and bundles it with PocketBase into one small image.
# Works for Coolify (Dockerfile build pack, port 8090) or plain `docker build`.
#
# NOT TESTED: written without a running Docker daemon. If the build fails, the error will
# most likely be in the download line (PocketBase release file name) or the npm step.

FROM node:22-alpine AS web
WORKDIR /src
COPY package.json ./
RUN npm install
COPY . .
# Empty means "talk to the origin that served the page", which is right for one hostname.
ARG PB_URL=""
ENV NEXT_PUBLIC_PB_URL=$PB_URL
RUN npx next build

FROM alpine:3.20
ARG PB_VERSION=0.30.0
# Set by buildx to amd64 or arm64, which are also the names PocketBase uses for its downloads.
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip -q /tmp/pb.zip -d /pb \
 && rm /tmp/pb.zip \
 && chmod +x /pb/pocketbase
COPY pocketbase/pb_hooks /pb/pb_hooks
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY --from=web /src/out /pb/pb_public
WORKDIR /pb
# Mount a volume here so the database and your superuser survive redeploys.
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
