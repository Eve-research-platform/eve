FROM node:20-bookworm-slim

LABEL org.opencontainers.image.title="Eve"
LABEL org.opencontainers.image.description="Privacy-first user research platform"
LABEL org.opencontainers.image.version="63.0.0"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    RESEARCHOS_RELAY_DATA=/data/eve

COPY --chown=node:node package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node . /app

RUN mkdir -p /data/eve && chown -R node:node /data/eve /app

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node","server.js"]
