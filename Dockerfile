FROM node:20-slim AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    libarchive-tools \
    python3 \
    make \
    g++ \
    xauth \
    xvfb \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libnotify4 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libwayland-client0 \
    libwayland-cursor0 \
    libwayland-egl1 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    libfuse2 \
    fakeroot \
    rpm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

FROM base AS dev
CMD ["npm", "start"]

FROM base AS build
CMD ["npm", "run", "dist", "--", "--linux"]

FROM base AS build-win
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    wine \
    wine64 \
    wine32:i386 \
    && rm -rf /var/lib/apt/lists/*

ENV CSC_IDENTITY_AUTO_DISCOVERY=false \
    WINEDEBUG=-all

RUN xvfb-run -a wineboot --init \
    && wineserver -w

CMD ["npm", "run", "dist", "--", "--win"]
