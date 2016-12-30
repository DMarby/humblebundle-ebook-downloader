var commander = require('commander')
var async = require('async')
var inquirer = require('inquirer')
var unirest = require('unirest')
var readline = require('readline')
var fs = require('fs')
var exec = require('child_process').exec
var pjson = require('./package.json')
var path = require('path')
var https = require('https')
var striptags = require('striptags')

var CACHE_FILENAME = "/tmp/humblecache.json"

commander
  .version(pjson.version)
  .option('-d, --download_folder <downloader_folder>', 'Download folder', 'download')
  .option('-a, --auth_token <auth_token>', 'Authentication cookie (_simpleauth_sess)')
  .option('-l, --download_limit <download_limit>', 'Parallel download limit', 5)
  .option('-f, --format <format>', 'What format to download the ebook in', 'EPUB')
  .option('-m, --title_matches <title_matches>', 'Title Matches', '')
  .option('-r, --read_cache <read_cache>', 'Read Cache [true|false]', 'false')
  .parse(process.argv)

var read_cache = commander.read_cache === "true"

var order_list
if (read_cache) {
    try {
      order_list = JSON.parse(fs.readFileSync(CACHE_FILENAME))
    } catch (err) {
      console.log("Cache read error: " + err.message)
      fs.unlinkSync(CACHE_FILENAME)
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

var i = 0;

function fetch_books(order_list) {
  var precount = order_list.length
  orders = order_list.filter(function (item) {
    return item.product.human_name.toLowerCase().match(commander.title_matches.toLowerCase())
  })
  var postcount = orders.length

  console.log("%s of %s shown", postcount, precount)

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
    var downloads = orders.filter(function (item) {
      return answers.bundle == item.product.human_name
    })[0].subproducts.filter(function (item) {
      return item.downloads.length
    })

    async.eachLimit(downloads, commander.download_limit, function (download, next) {
      var human_name = striptags(download.human_name)
      var filename = (download.downloads[0].machine_name + '.' + commander.format.toLowerCase()).replace(/\.pdf \(hd\)/, '.pdf')
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

      var download_path = path.resolve(commander.download_folder, filename)
      if (fs.existsSync(download_path)) {
        console.log('Skipping %s (%s of %s) - %s', human_name, (i++ + 1), downloads.length, filename)
        next()
      } else {
        var url = download_url[0].url.web
        console.log('Downloading %s (%s of %s) - %s', human_name, (i++ + 1), downloads.length, filename)

        var file = fs.createWriteStream(download_path)
        if (download.downloads.length > 1) {
          console.log('More than one download for %s', human_name)
        }

        https.get(url, function (response) {
          response.pipe(file)
          file.on('finish', function () {
            file.close(function () {
              next()
            })
          })
        })
      }
    }, function (error) {
      console.log('Done!')
    })
  })
}
if (read_cache) {
  fetch_books(order_list)
} else {
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
