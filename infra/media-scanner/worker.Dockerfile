FROM node:24.19.0-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848 AS build

WORKDIR /workspace
COPY . .
RUN corepack pnpm install --frozen-lockfile --ignore-scripts --filter @sallah/media-scanner...
RUN ./services/media-scanner/node_modules/.bin/tsc -p services/media-scanner/tsconfig.build.json
# The scanner production graph does not use the mobile query-string patch.
# Permit unused metadata only during this pruned deploy; actual patch failures still fail.
RUN corepack pnpm --config.allow-unused-patches=true --filter @sallah/media-scanner deploy --legacy --prod --ignore-scripts /opt/media-scanner

FROM node:24.19.0-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848 AS runtime

ENV NODE_ENV=production
RUN rm -f /etc/apt/sources.list.d/* \
    && printf '%s\n' \
      'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20260823T000000Z bookworm main' \
      'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/20260823T000000Z bookworm-security main' \
      > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install --yes --no-install-recommends 'ffmpeg=7:5.1.9-0+deb12u1' \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/sallah-media/bin \
    && ln -s /usr/bin/ffmpeg /opt/sallah-media/bin/ffmpeg \
    && ln -s /usr/bin/ffprobe /opt/sallah-media/bin/ffprobe
WORKDIR /opt/media-scanner
COPY --from=build --chown=65532:65532 /opt/media-scanner/ ./
COPY --from=build --chown=65532:65532 /workspace/services/media-scanner/dist/ ./dist/
COPY --chown=65532:65532 infra/media-scanner/start-worker.mjs ./start-worker.mjs
COPY --chown=65532:65532 infra/media-scanner/container-probe.mjs ./container-probe.mjs
COPY --chown=65532:65532 infra/media-scanner/remux-probe.mjs ./remux-probe.mjs

USER 65532:65532
CMD ["node", "start-worker.mjs"]
