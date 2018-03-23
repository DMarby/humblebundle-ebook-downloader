#!/usr/bin/env node

const async = require('async')
const commander = require('commander')
const packageInfo = require('./package.json')
const Nightmare = require('nightmare')
const request = require('request')
const Breeze = require('breeze')
const Bottleneck = require('bottleneck')
const colors = require('colors')
const crypto = require('crypto')
const inquirer = require('inquirer')
const keypath = require('nasa-keypath')
const mkdirp = require('mkdirp')
const sanitizeFilename = require('sanitize-filename')
const url = require('url')
const util = require('util')
const path = require('path')
const fs = require('fs')
const userAgent = util.format('Humblebundle-Ebook-Downloader/%s', packageInfo.version)

const SUPPORTED_FORMATS = ['epub', 'mobi', 'pdf', 'pdf_hd', 'cbz']
const ALLOWED_FORMATS = SUPPORTED_FORMATS.concat(['all']).sort()

commander
  .version(packageInfo.version)
  .option('-d, --download-folder <downloader_folder>', 'Download folder', 'download')
  .option('-l, --download-limit <download_limit>', 'Parallel download limit', 1)
  .option('-f, --format <format>', util.format('What format to download the ebook in (%s)', ALLOWED_FORMATS.join(', ')), 'epub')
  .option('--auth-token <auth-token>', 'Optional: If you want to run headless, you can specify your authentication cookie from your browser (_simpleauth_sess)')
  .option('-a, --all', 'Download all bundles')
  .option('--debug', 'Enable debug logging', false)
  .parse(process.argv)

if (ALLOWED_FORMATS.indexOf(commander.format) === -1) {
  console.error(colors.red('Invalid format selected.'))
  commander.help()
}

const configPath = path.resolve(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE, '.humblebundle_ebook_downloader.json')
const flow = Breeze()
const limiter =  new Bottleneck({
  maxConcurrent: commander.downloadLimit,
}) // Limit concurrent downloads

console.log(colors.green('Starting...'))

function loadConfig (next) {
  fs.access(configPath, (error) => {
    if (error) {
      if (error.code === 'ENOENT') {
        return next(null, {})
      }

      return next(error)
    }

    var config

    try {
      config = require(configPath)
    } catch (ignore) {
      config = {}
    }

    next(null, config)
  })
}

function getRequestHeaders (session) {
  return {
    'Accept': 'application/json',
    'Accept-Charset': 'utf-8',
    'User-Agent': userAgent,
    'Cookie': '_simpleauth_sess=' + session + ';'
  }
}

function validateSession (next, config) {
  console.log('Validating session...')

  var session = config.session

  if (!commander.authToken) {
    if (!config.session || !config.expirationDate) {
      return next()
    }

    if (config.expirationDate < new Date()) {
      return next()
    }
  } else {
    session = util.format('"%s"', commander.authToken.replace(/^"|"$/g, ""))
  }

  request.get({
    url: 'https://www.humblebundle.com/api/v1/user/order?ajax=true',
    headers: getRequestHeaders(session),
    json: true
  }, (error, response) => {
    if (error) {
      return next(error)
    }

    if (response.statusCode === 200) {
      return next(null, session)
    }

    if (response.statusCode === 401 && !commander.authToken) {
      return next(null)
    }

    return next(new Error(util.format('Could not validate session, unknown error, status code:', response.statusCode)))
  })
}

function saveConfig (config, callback) {
  fs.writeFile(configPath, JSON.stringify(config, null, 4), 'utf8', callback)
}

function debug () {
  if (commander.debug) {
    console.log(colors.yellow('[DEBUG] ' + util.format.apply(this, arguments)))
  }
}

function authenticate (next) {
  console.log('Authenticating...')

  var nightmare = Nightmare({
    show: true,
    width: 800,
    height: 600
  })

  nightmare.useragent(userAgent)

  const redirectUrl = url.parse('https://www.humblebundle.com/home/library')

  nightmare.on('will-navigate', (event, targetUrl) => {
    var parsedUrl = url.parse(targetUrl, true)

    if (parsedUrl.hostname !== redirectUrl.hostname || parsedUrl.pathname !== redirectUrl.pathname) {
      return
    }

    nightmare
      .cookies.get({
        secure: true,
        name: '_simpleauth_sess'
      })
      .then((sessionCookie) => {
        if (!sessionCookie) {
          return next(new Error('Could not get session cookie'))
        }

        nightmare._endNow()

        saveConfig({
          session: sessionCookie.value,
          expirationDate: new Date(sessionCookie.expirationDate * 1000)
        }, (error) => {
          if (error) {
            return next(error)
          }

          next(null, sessionCookie.value)
        })
      })
      .catch((error) => next(error))
  })

  nightmare
    .goto('https://www.humblebundle.com/login?goto=%2Fhome%2Flibrary')
    .then()
    .catch((error) => next(error))
}

function fetchOrders (next, session) {
  console.log('Fetching bundles...')

  request.get({
    url: 'https://www.humblebundle.com/api/v1/user/order?ajax=true',
    headers: getRequestHeaders(session),
    json: true
  }, (error, response) => {
    if (error) {
      return next(error)
    }

    if (response.statusCode !== 200) {
      return next(new Error(util.format('Could not fetch orders, unknown error, status code:', response.statusCode)))
    }

    var total = response.body.length
    var done = 0

    var orderInfoLimiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 500
    })

    async.concat(response.body, (item, next) => {
      orderInfoLimiter.submit((next) => {
        request.get({
          url: util.format('https://www.humblebundle.com/api/v1/order/%s?ajax=true', item.gamekey),
          headers: getRequestHeaders(session),
          json: true
        }, (error, response) => {
          if (error) {
            return next(error)
          }

          if (response.statusCode !== 200) {
            return next(new Error(util.format('Could not fetch orders, unknown error, status code:', response.statusCode)))
          }

          console.log('Fetched bundle information... (%s/%s)', colors.yellow(++done), colors.yellow(total))
          next(null, response.body)
        })
      }, next)
    }, (error, orders) => {
      if (error) {
        return next(error)
      }

      var filteredOrders = orders.filter((order) => {
        return flatten(keypath.get(order, 'subproducts.[].downloads.[].platform')).indexOf('ebook') !== -1
      })

      next(null, filteredOrders, session)
    })
  })
}

function getWindowHeight () {
  var windowSize = process.stdout.getWindowSize()
  return windowSize[windowSize.length - 1]
}

function displayOrders (next, orders) {
  var options = []

  for (var order of orders) {
    options.push(order.product.human_name)
  }

  options.sort((a, b) => {
    return a.localeCompare(b)
  })

  process.stdout.write('\x1Bc') // Clear console

  inquirer.prompt({
    type: 'checkbox',
    name: 'bundle',
    message: 'Select bundles to download',
    choices: options,
    pageSize: getWindowHeight() - 2
  }).then((answers) => {
    next(null, orders.filter((item) => {
      return answers.bundle.indexOf(item.product.human_name) !== -1
    }))
  })
}

function sortBundles (next, bundles) {
  next(null, bundles.sort((a, b) => {
    return a.product.human_name.localeCompare(b.product.human_name)
  }))
}

function flatten (list) {
  return list.reduce((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), [])
}

function ensureFolderCreated (folder, callback) {
  fs.access(folder, (error) => {
    if (error && error.code !== 'ENOENT') {
      return callback(error)
    }

    mkdirp(folder, (error) => {
      if (error) {
        return callback(error)
      }

      callback()
    })
  })
}

function normalizeFormat (format) {
  switch (format.toLowerCase()) {
    case '.cbz':
      return 'cbz'
    case 'pdf (hq)':
    case 'pdf (hd)':
      return 'pdf_hd'
    case 'download':
      return 'pdf'
    default:
      return format.toLowerCase()
  }
}

function getExtension (format) {
  switch (format.toLowerCase()) {
    case 'pdf_hd':
      return ' (hd).pdf'
    default:
      return util.format('.%s', format)
  }
}

function checkSignatureMatch (filePath, download, callback) {
  fs.access(filePath, (error) => {
    if (error) {
      if (error.code === 'ENOENT') {
        return callback()
      }

      return callback(error)
    }

    var hashType = download.sha1 ? 'sha1' : 'md5'
    var hashToVerify = download[hashType]

    var hash = crypto.createHash(hashType)
    hash.setEncoding('hex')

    var stream = fs.createReadStream(filePath)

    stream.on('error', (error) => {
      return callback(error)
    })

    stream.on('end', () => {
      hash.end()

      return callback(null, hash.read() === hashToVerify)
    })

    stream.pipe(hash)
  })
}

function downloadBook (bundle, name, download, callback) {
  var downloadPath = path.resolve(commander.downloadFolder, sanitizeFilename(bundle))

  ensureFolderCreated(downloadPath, (error) => {
    if (error) {
      return callback(error)
    }

    var fileName = util.format('%s%s', name.trim(), getExtension(normalizeFormat(download.name)))
    var filePath = path.resolve(downloadPath, sanitizeFilename(fileName))

    checkSignatureMatch(filePath, download, (error, matches) => {
      if (error) {
        return callback(error)
      }

      if (matches) {
        return callback(null, true)
      }

      var file = fs.createWriteStream(filePath)

      file.on('finish', () => {
        file.close(() => {
          callback()
        })
      })

      request.get({
        url: download.url.web
      }).on('error', (error) => {
        callback(error)
      }).pipe(file)
    })
  })
}

function downloadBundles (next, bundles) {
  if (!bundles.length) {
    console.log(colors.green('No bundles selected, exiting'))
    return next()
  }

  var downloads = []

  for (var bundle of bundles) {
    var bundleName = bundle.product.human_name
    var bundleDownloads = []
    var bundleFormats = []

    for (var subproduct of bundle.subproducts) {
      var filteredDownloads = subproduct.downloads.filter((download) => {
        return download.platform === 'ebook'
      })

      var downloadStructs = flatten(keypath.get(filteredDownloads, '[].download_struct'))
      var filteredDownloadStructs = downloadStructs.filter((download) => {
        if (!download.name || !download.url) {
          return false
        }

        var normalizedFormat = normalizeFormat(download.name)

        if (bundleFormats.indexOf(normalizedFormat) === -1 && SUPPORTED_FORMATS.indexOf(normalizedFormat) !== -1) {
          bundleFormats.push(normalizedFormat)
        }

        return commander.format == 'all' || normalizedFormat === commander.format
      })

      for (var filteredDownload of filteredDownloadStructs) {
        bundleDownloads.push({
          bundle: bundleName,
          download: filteredDownload,
          name: subproduct.human_name
        })
      }
    }

    if (!bundleDownloads.length) {
      console.log(colors.red('No downloads found matching the right format (%s) for bundle (%s), available formats: (%s)'), commander.format, bundleName, bundleFormats.sort().join(', '))
      continue
    }

    for (var download of bundleDownloads) {
      downloads.push(download)
    }
  }

  if (!downloads.length) {
    console.log(colors.red('No downloads found matching the right format (%s), exiting'), commander.format)
  }

  async.each(downloads, (download, next) => {
    limiter.submit((next) => {
      console.log('Downloading %s - %s (%s) (%s)... (%s/%s)', download.bundle, download.name, download.download.name, download.download.human_size, colors.yellow(downloads.indexOf(download) + 1), colors.yellow(downloads.length))
      downloadBook(download.bundle, download.name, download.download, (error, skipped) => {
        if (error) {
          return next(error)
        }

        if (skipped) {
          console.log('Skipped downloading of %s - %s (%s) (%s) - already exists... (%s/%s)', download.bundle, download.name, download.download.name, download.download.human_size, colors.yellow(downloads.indexOf(download) + 1), colors.yellow(downloads.length))
        }

        next()
      })
    }, next)
  }, (error) => {
    if (error) {
      return next(error)
    }

    console.log(colors.green('Done'))
    next()
  })
}

flow.then(loadConfig)
flow.then(validateSession)
flow.when((session) => !session, authenticate)
flow.then(fetchOrders)
flow.when(!commander.all, displayOrders)
flow.when(commander.all, sortBundles)
flow.then(downloadBundles)

flow.catch((error) => {
  console.error(colors.red('An error occured, exiting.'))
  console.error(error)
  process.exit(1)
})
