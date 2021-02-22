# humblebundle-ebook-downloader

An easy way to download ebooks from your humblebundle account

## Installation

To run the tool, you can either install NodeJS and use npm to install it, or install Docker and run it as a docker container.

### NPM
To install it via npm, run:

```shell
$ npm install -g humblebundle-ebook-downloader
```

You can now use the tool by running the `humblebundle-ebook-downloader` command.

### Docker
To run the tool via Docker, run:

```shell
docker run -v $(PWD)/download:/download --rm -it dmarby/humblebundle-ebook-downloader -d /download --auth-token "auth_string_here"
```
This will download the books to the `download` folder in your current work directory.

Note that you need to get your auth token from the authentication cookie in your browser after logging in to the humblebundle website (_simpleauth_sess) when using Docker, as the option to interactively log in isn't available.
When using the tool installed via npm, it will launch a browser and let you log in interactively instead.

## Usage

```shell
$ humblebundle-ebook-downloader --help

  Usage: humblebundle-ebook-downloader [options]

  Options:

    -V, --version                              output the version number
    -d, --download-folder <downloader_folder>  Download folder (default: download)
    -l, --download-limit <download_limit>      Parallel download limit (default: 1)
    -f, --format <format...>                   What format (comma separated) to download the ebook in (all, cbz, epub, mobi, pdf, pdf_hd) (default: epub)
    --auth-token <auth-token>                  Optional: If you want to run headless, you can specify your authentication cookie from your browser (_simpleauth_sess)
    -a, --all                                  Download all bundles
    --debug                                    Enable debug logging
    -h, --help                                 output usage information
```

## Contributors
- [J. Longman](https://github.com/jlongman)
- [Johannes Löthberg](https://github.com/kyrias)
- [jaycuse](https://github.com/jaycuse)

## License
See [LICENSE.md](LICENSE.md)
