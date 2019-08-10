FROM node:8.16.0-alpine

RUN npm install -g humblebundle-ebook-downloader --unsafe-perm=true

ENTRYPOINT ["humblebundle-ebook-downloader"]
