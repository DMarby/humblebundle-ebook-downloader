var commander = require('commander')
var async = require('async')
var inquirer = require('inquirer')
var unirest = require('unirest')
var readline = require('readline')
var fs = require('fs')
var pjson = require('./package.json')
var path = require('path')
var https = require('https')
var striptags = require('striptags')
var sanitize = require("sanitize-filename");

const CACHE_FILENAME = "/tmp/humblecache.json"


commander
  .version(pjson.version)
  .option('-d, --download_folder <downloader_folder>', 'Download folder', 'download')
  .option('-a, --auth_token <auth_token>', 'Authentication cookie (_simpleauth_sess)')
  .option('-l, --download_limit <download_limit>', 'Parallel download limit', 5)
  .option('-f, --format <format>', 'What format to download the ebook in', 'EPUB')
  .option('-m, --title_matches <title_matches>', 'Title Matches', '')
  .option('-r, --read_cache', 'Read Cache')
  .option('-c, --checksum', 'Checksum Checks')
  .option('-b, --bundle', 'Use bundle named leaf dirs')
  .option('-D, --disable download', 'Only refresh existing files')
  .option('-A, --all', 'Do all bundles')
  .option('-H, --html', 'Write an index page')
  .parse(process.argv)

var crypto = null
if (commander.checksum) {
  crypto = require('crypto')
}

var read_cache = commander.read_cache

var order_list
if (read_cache) {
    try {
      order_list = JSON.parse(fs.readFileSync(CACHE_FILENAME))
    } catch (err) {
      console.log("Cache read error: " + err.message)
      if (fs.existsSync(CACHE_FILENAME)) {
        fs.unlinkSync(CACHE_FILENAME)
      }
      read_cache = false
    }
}


if (!read_cache && !commander.auth_token) {
  return commander.help();
}

fs.mkdir(commander.download_folder, function(e) {})

var headers = {
  'Accept': 'application/json',
  'Accept-Charset': 'utf-8',
  'Keep-Alive': 'true',
  'Cookie': '_simpleauth_sess=' + commander.auth_token + ';'
}

var orders = []

function calculate_md5(download_path) {
  var stream = fs.openSync(download_path, 'r')

  var hash = crypto.createHash('md5')
  const chunkSize = 1024
  var data = new Buffer(chunkSize, 'binary');

  var sumlength = 0
  var length
  while ((length = fs.readSync(stream, data, 0, chunkSize, null)) > 0) {
    sumlength += length
    if (length == chunkSize) {
      hash.update(data)
    } else {
      hash.update(data.slice(0, length));
    }
  }
  var file_md5 = hash.digest('hex'); // 34f7a3113803f8ed3b8fd7ce5656ebec
  return file_md5;
}

function fetch_books(order_list) {
  var precount = order_list.length
  orders = order_list.filter(function (item) {
    return item.product.human_name.toLowerCase().match(commander.title_matches.toLowerCase())
  })
  var postcount = orders.length

  console.log("%s of %s shown", postcount, precount)

  function work_on_bundle(answers) {
    var downloads = orders.filter(function (item) {
      return answers.bundle == item.product.human_name
    })[0].subproducts.filter(function (item) {
      return item.downloads.length
    })

    if (commander.bundle) {
      const leaf_download_dir = path.resolve(commander.download_folder, sanitize(answers.bundle))
      const leaf_dir_exists = fs.existsSync(leaf_download_dir)
      if (!leaf_dir_exists) {
        fs.mkdirSync(leaf_download_dir)
      }
    }

    if (commander.html) {
      const bundleName = answers.bundle
      var htmlpath = path.resolve(commander.download_folder, sanitize(answers.bundle) + ".html")
      if (commander.bundle) {
        htmlpath = path.resolve(commander.download_folder, sanitize(answers.bundle), "index.html")
      }
      if (!fs.existsSync(htmlpath)) {
        var html = fs.createWriteStream(htmlpath)
        html.write("<html><head>")
        html.write("<script type='text/javascript' src='https://www.google.com/books/jsapi.js'></script>")
        html.write('<script type="text/javascript">')
        html.write('google.books.load();')
        html.write('function initialize() {')
        html.write('  var viewer = new google.books.DefaultViewer(document.getElementById("viewerCanvas"));')
        html.write('  viewer.load("ISBN:0738531367"); ')
        html.write('}')
        html.write('google.books.setOnLoadCallback(initialize);')
        html.write('</script>')
        html.write("</head><body>")
        html.write("<h1>" + bundleName + "</h1>" + "<table>")
        html.write('<div id="viewerCanvas" style="width: 600px; height: 500px"></div>')
        for (var d in downloads) {
          html.write("<tr>")
          html.write("<td><img src='" + downloads[d].icon + "'/></td>")
          html.write("<td><a href='" + downloads[d].url + "'>" + striptags(downloads[d].human_name) + "</a></td>")
          html.write("<td>" + striptags(downloads[d].payee.human_name) + "</a></td>")
          for (var e in downloads[d].downloads[0].download_struct) {
            html.write("<td>")
            var filename = sanitize(downloads[d].downloads[0].machine_name + '.' + commander.format.toLowerCase()).replace(/\.pdf \(hd\)/, '.pdf')
            html.write("<a href='" + filename + "'>")
            html.write(downloads[d].downloads[0].download_struct[e].name)
            html.write("</a>")
            html.write("</td>")
          }
          html.write("</tr>")
        }
        html.write("</table>" + "</body></html>")
        html.end()
      }
    }
    var i = 0;
    async.eachLimit(downloads, commander.download_limit, function (download, next) {
      // const util = require('util')
      // console.log(util.inspect(download, {showHidden: false, depth: null}))

      var human_name = striptags(download.human_name)
      var filename = sanitize(download.downloads[0].machine_name + '.' + commander.format.toLowerCase()).replace(/\.pdf \(hd\)/, '.pdf')
      var download_url = download.downloads[0].download_struct.filter(function (item) {
        return item.name.toLowerCase() == commander.format.toLowerCase()
      })

      if (download_url.length < 1) {
        var types = []
        download.downloads[0].download_struct.forEach(function (item) {
          if (types.indexOf(item.name.toLowerCase()) === -1) {
            types.push(item.name.toLowerCase())
          }
        })

        console.log('No download of this format found for %s (%s of %s) Formats available: %s', human_name, (i++ + 1), downloads.length, types.join(', '))
        return next()
      }

      const root_download_path = path.resolve(commander.download_folder, filename)
      var download_path = root_download_path
      var exists = fs.existsSync(root_download_path)
      if (commander.bundle) {
        const leaf_download_path = path.resolve(commander.download_folder, sanitize(answers.bundle), filename)
        if (exists) {
          console.log("Moving %s to %s directory", filename, answers.bundle)
          fs.renameSync(root_download_path, leaf_download_path)
        }
        download_path = leaf_download_path
        exists = fs.existsSync(download_path)
      }

      const download_md5 = download_url[0].md5
      if (exists) {
        var file_size = fs.statSync(download_path)["size"]
        exists &= file_size > 0
        if (file_size == 0) {
          fs.unlinkSync(download_path)
        }
        if (exists && commander.checksum) {
          var file_md5 = calculate_md5(download_path);
          exists &= file_md5 === download_md5
          if (!exists) {
            console.log("%s - MD5 MISMATCH %s - %s", human_name, file_md5, download_md5)
          }
        }
      }

      if (exists) {
        console.log('Skipping %s (%s of %s) - %s', human_name, (i++ + 1), downloads.length, filename)
        next()
      } else {
        if (!commander.disable_download) {
          var url = download_url[0].url.web
          console.log('Downloading %s (%s of %s) - %s', human_name, (i++ + 1), downloads.length, filename)

          var file = fs.createWriteStream(download_path)
          if (download.downloads.length > 1) {
            console.log('More than one download for %s', human_name)
          }

          var req = null
          try {
            req = https.get(url, function (response) {
              response.pipe(file)
              file.on('finish', function () {
                file.close(function () {
                  var file_size = fs.statSync(download_path)["size"]
                  if (commander.checksum) {
                    var file_md5 = calculate_md5(download_path);
                    exists = file_md5 === download_md5
                    if (!exists) {
                      console.log("%s - POST MD5 MISMATCH %s - %s", human_name, file_md5, download_md5)
                    }
                  }
                  next()
                })
              })
            }).on('error', function (e) {
              console.log("%s - http error", human_name)
              console.error(e);
              next()
            });
          } catch (e) {

            console.log("%s - http error", human_name)
            console.log(e)
            next()
          }
        }
      }
    }, function (error) {
      console.log('Done!')
    })
  }

  if (commander.all) {
    orders.forEach(function(order) {
      work_on_bundle({"bundle": order.product.human_name})
    })
  } else {
    var options = []
    orders.forEach(function (order) {
      options.push(order.product.human_name)
    })

    inquirer.prompt({
      type: 'list',
      name: 'bundle',
      message: 'Select a bundle to download',
      choices: options
    }, function (answers) {
      work_on_bundle(answers);
    })
  }
}




if (read_cache) {
  fetch_books(order_list)
} else {
  // fetch bundle list
  unirest
    .get('https://www.humblebundle.com/api/v1/user/order?ajax=true')
    .headers(headers)
    .end(function (response) {
      if (response.code == 200) {
        async.concat(response.body, function (item, next) {
          unirest
            .get('https://www.humblebundle.com/api/v1/order/' + item.gamekey +'?ajax=true')
        .headers(headers)
        .end(function (response) {
          next(null, response.body)
        })
      }, function (error, order_list) {
        if (error) {
          return console.log('Error using the humblebundle API, invalid session cookie?')
        }

        if (!read_cache) {
          fs.writeFile(CACHE_FILENAME, JSON.stringify(order_list), function(err) {
            if(err) {
              return console.log(err);
            }
            console.log("Cache was saved to \"%s\"!", CACHE_FILENAME);
          });
        }

        /* start repeat section */
        fetch_books(order_list)
        /* end repeat section */
      })
    } else {
      console.log('Error using the humblebundle API, invalid session cookie?')
    }
  })
}
