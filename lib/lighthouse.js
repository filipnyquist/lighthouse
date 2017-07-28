module.exports = function (options, callback) {
  options = options || {}
  const Logger = require('bunyan')
  const _ = require('lodash')
  const fs = require('fs')
  const level = require('level-party') // WOHOO,we can share the leveldb via unix sockets!
  const searchindex = require('search-index')
  // If a search-index is being passed to lighthouse- use
  var lighthouseHome = options.lighthouseHome || 'lighthouse-index'
  fs.mkdir(lighthouseHome, function (err) {
    options = _.defaults(
      options, {
        cors: null,
        lighthouseHome: lighthouseHome,
        log: new Logger.createLogger({ // eslint-disable-line
          name: 'lighthouse',
          level: options.logLevel || 'info',
          serializers: {
            req: function (req) {
              return {
                method: req.method,
                url: req.url,
                headers: req.headers
              }
            }
          },
          streams: [
            {
              path: lighthouseHome + '/info.log',
              level: 'info'
            },
            {
              path: lighthouseHome + '/error.log',
              level: 'error'
            }
          ]
        }),
        port: 3030,
        machineReadable: true,
        si: null,
        siOptions: {}
      })
    if (err) options.log.info(err)
    if (process.argv.indexOf('-h') === -1) {
      if (options.si) {
        return startServer(options, callback)
      } else {
        var siOps = Object.assign({}, {
          indexPath: lighthouseHome + '/data',
          log: options.log
        })
         //console.log(siOps)
        searchindex(siOps, function (err, si) {
          if (err) {
            console.log(err)
          } else {
            options.si = si
            // maybe delete lighthouseHome?
            return startServer(options, callback)
          }
        })
      }
    }
  })
}

var startServer = function (options, callback) {
  options.log.info('server starting')
  if (!options.machineReadable) {
    require('./printLogo.js')(options)
  }
  var fs = require('fs')
  var restify = require('restify')
  var routes = require('./routeFunctions.js')(options)

  var lighthouse = restify.createServer({
    name: 'lighthouse',
    version: require('../package.json').version,
    log: options.log
  })
  lighthouse.listen(options.port)
  lighthouse.pre(function (request, response, next) {
    request.log.info({
      req: request,
      req_id: request.getId()
    }, 'REQUEST')
    next()
  })
  lighthouse.use(restify.queryParser())
  lighthouse.use(restify.requestLogger({}))
  lighthouse.use(restify.CORS(options.cors))

  // initialise snapshot dir
  try {
    fs.mkdirSync('./snapshots')
  } catch (e) {
    // what to do here?
  }

  // ******* GET *********

  lighthouse.get('/availableFields', routes.availableFields)
  lighthouse.get('/docCount', routes.docCount)
  lighthouse.get('/buckets', routes.buckets)
  lighthouse.get('/categorize', routes.categorize)
  lighthouse.get('/get', routes.get)
  lighthouse.get('/latestSnapshot', routes.latestSnapshot)
  lighthouse.get('/matcher', routes.match)   // deprecated
  lighthouse.get('/match', routes.match)
  lighthouse.get('/search', routes.search)
  lighthouse.get('/totalHits', routes.totalHits)
  lighthouse.get('/listSnapshots', routes.listSnapshots)
  lighthouse.get(/\//, restify.serveStatic({
    directory: __dirname,
    file: './index.html'
  }))

  // ******* POST *********

  lighthouse.post('/add', routes.add)
  lighthouse.post('/classify', routes.classify)
  lighthouse.post('/concurrentAdd', restify.bodyParser(), routes.concurrentAdd)
  lighthouse.post('/import', routes.replicate)
  lighthouse.post('/snapshot', routes.snapshot)

  // ******* DEL *********

  // TODO: throw error if user tries to GET or POST flush
  lighthouse.del('/flush', routes.flush)
  lighthouse.del('/delete', routes.del)

  lighthouse.options = options
  return callback(null, lighthouse)
}
