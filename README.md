# humblebundle-ebook-downloader

Tool for easily downloading ebooks from Humblebundle

## Installation

```shell
$ git clone https://github.com/DMarby/humblebundle-ebook-downloader.git
$ cd humblebundle-ebook-downloader
$ npm install
$ node index
```

## Usage

```
 Usage: index [options]

  Options:

    -h, --help                                 output usage information
    -V, --version                              output the version number
    -d, --download_folder <downloader_folder>  Download folder
    -a, --auth_token <auth_token>              Authentication cookie (_simpleauth_sess)
    -l, --download_limit <download_limit>      Parallel download limit
    -f, --format <format>                      What format to download the ebook in
    -m, --title_matches <title_matches>        Title Matches
    -r, --read_cache                           Read Cache
    -c, --checksum                             Checksum Checks
    -L, --leaf                                 Use bundle-named leaf dirs
    -D, --disable download                     Only refresh existing files
    -A, --all                                  Do all bundles
    -H, --html                                 Write an index page
```

The `humbebundle-ebook-downloader` will list bundles you have purchased.  If you are not in `-r/--read_cache` mode then a cache file containing bundles will be written.  In `-r/--read_cache` or if the cache file does not exist it will access the humblebundle site to get the list.

*NB*: For an unknown reason the number of bundles returned is not always the same!  While the cache read mode is much faster to access it shouldn't be considered definitive.

The `-m/--title_matches` option will filter to include only bundle titles that match the string provided.  This is applied after the cache is saved and after it is read.

Files which exist and are non-zero size will be re-downloaded.  If the files are zero-size they will be deleted before they are downloaded.

If the `-c/--checksum` option is enabled the md5 checksums will be verified.  If the match fails, the item will be re-downloaded.  After downloading the checksum will be done again and a log produced if it does not match.

Using `-L/--leaf` will move and download the book files into a directory named as the bundle is named, e.g. 'Humble Book Bundle Electronics Presented by Make'.

Using `-D/--disable-download` stops the actual downloading in the case of missing files, md5 mismatches, etc but will still copy files to the leaf directory if enabled.

*Warning*: Using `-A/--all` without disabling downloads or having a  `--title_matches` filter will grab a lot!  Abusing this may end up getting API access limited. 

The `-H, --html` creates a simple HTML file with book artwork, book names, a link the publisher provided, the publisher's name and supported formats.  The supported formats link to the local instance (and not the online reference).  In `--leaf` mode these files are placed in the bundle directories and named `index.html`, in non-leaf mode they will be named the bundle name with a `.html` suffix.

The HTML file will be created for non-book bundles, so you may end up with apps and soundtracks, for example, in the index file but not have them locally linked.



### Example Usage

```node index -f mobi -d ~/humblebooks/ -a "\"youneedtogetthisfromyourbrowser_simpleauthsession_quotesaremandatory\"" -m book  -c  ```

Get `mobi` files, place them in `~/humblebooks`, using the session auth key, search for bundles with `book` in the title, verify checksums (if book exists on disk), create a cache file.

```node index -f mobi -d ~/humblebooks/ -m book  -c  -r```

Get `mobi` files, place them in `~/humblebooks`, a session auth is not necessary when reading the cache, search for bundles with `book` in the title, verify checksums (if book exists on disk), read the cache file.

```node index -f mobi -d ~/humblebooks/ -m Sci-Fi -r -D -L -A```

Move all your mobi Sci-Fi bundles into their leaf directories without downloading them, even if they are damaged.

## License

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org/>
```