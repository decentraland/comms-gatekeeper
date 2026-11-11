ARG RUN

FROM node:24-alpine@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873 as builderenv

WORKDIR /app

# some packages require a build step
RUN apk update && apk add wget

# build the app
COPY . /app
RUN yarn install --frozen-lockfile
RUN yarn build

# remove devDependencies, keep only used dependencies
RUN yarn install --prod --frozen-lockfile

########################## END OF BUILD STAGE ##########################

FROM node:24-alpine@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873

RUN apk update && apk add --update wget && apk add --update tini

# NODE_ENV is used to configure some runtime options, like JSON logger
ENV NODE_ENV production

ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local}

ARG CURRENT_VERSION=Unknown
ENV CURRENT_VERSION=${CURRENT_VERSION:-Unknown}

WORKDIR /app
COPY --from=builderenv /app /app

RUN echo "" > /app/.env

# Drop root: the official node image ships an unprivileged `node` user (uid 1000). The app
# only reads its bundle and talks to the DB/LiveKit over the network, so it does not need root.
USER node

ENTRYPOINT ["/sbin/tini", "--"]
# Run the program under Tini
CMD [ "/usr/local/bin/node", "--trace-warnings", "--abort-on-uncaught-exception", "--unhandled-rejections=strict", "dist/index.js" ]
