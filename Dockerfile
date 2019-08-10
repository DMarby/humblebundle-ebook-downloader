FROM node:10.16.2-alpine

RUN npm install -g humblebundle-ebook-downloader --unsafe-perm=true

ENTRYPOINT ["humblebundle-ebook-downloader"]
