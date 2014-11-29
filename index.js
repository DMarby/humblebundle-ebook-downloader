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

commander
  .version(pjson.version)
  .option('-a, --auth_token <auth_token>', 'Authentication cookie (_simpleauth_sess)')
  .option('-d, --download_folder <downloader_folder>', 'Download folder', 'download')
  .option('-l, --download_limit <download_limit>', 'Paralell download limit', 5)
  .option('-f, --format <format>', 'What format to download the ebook in', 'EPUB')
  .parse(process.argv)

if (!commander.auth_token) {
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
      
      orders = order_list
      var options = []
      
      orders.forEach(function (order) {
        options.push(order.product.human_name)
      })
      
      inquirer.prompt({ type: 'list', name: 'bundle', message: 'Select a bundle to download', choices: options }, function (answers) {
        var downloads = orders.filter(function (item) { return answers.bundle == item.product.human_name })[0].subproducts
        async.eachLimit(downloads, commander.download_limit, function (download, next) {
          if (download.downloads.length > 1) {
            console.log('More than one download for %s', download.human_name)
          }
          
          var filename = download.downloads[0].machine_name + '.' + commander.format.toLowerCase()
          var url = download.downloads[0].download_struct.filter(function (item) { return item.name.toLowerCase() == commander.format.toLowerCase() })[0].url.web
  
          console.log('Downloading %s (%s of %s) - %s', download.human_name, (i++ + 1), downloads.length, filename)

          var file = fs.createWriteStream(path.resolve(commander.download_folder, filename))
          
          var handleDownload = function (response) {
            response.pipe(file)
            file.on('finish', function () {
              file.close(function () {
                next()
              })
            })
          }

          https.get(url, handleDownload)
        }, function (err) {
          console.log('Done!')
        })
      })
    })
  }
})