# ONLY FOR LINUX - Change the download for alternate platforms


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
RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip" \
 && unzip -q /tmp/pb.zip -d /pb \
 && rm /tmp/pb.zip \
 && chmod +x /pb/pocketbase
COPY pocketbase/pb_hooks /pb/pb_hooks
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY --from=web /src/out /pb/pb_public
WORKDIR /pb
# Mount a volume here so the database and your superuser survive redeploys.
VOLUME /pb/pb_data
EXPOSE 2041
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:2041/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:2041"]
