'use strict'

const fs = require('fs')
    , ui = require('../ui')
    , url = require('url')
    , path = require('path')
    , log = require('../log')
    , config = require('../config')
    , watch = require('./watch')
    , chrome = require('../chrome')
    , utils = require('../utils')
    , js = require('./js')

const styles = new Map()

module.exports = function() {
  chrome.on('CSS.styleSheetAdded', styleSheetParsed)
}

module.exports.styles = styles
module.exports.set = setStyle

function styleSheetParsed(style) {
  style = style.header

  if (style.isInline || !style.sourceURL || !style.sourceURL.startsWith(config.url))
    return

  const pathname = style.sourceURL && decodeURIComponent(url.parse(style.sourceURL).pathname)
      , localPath = pathname && path.join(config.serve, pathname)
      , css = config.css.find(s => pathname === s.path || pathname === '/' + s.path)

  if (!style.ownerNode || (!css && path.extname(localPath) !== '.css'))
    return

  style.path = localPath

  if (!css) {
    fs.readFile(localPath, 'utf8', (err, content) => {
      if (err)
        return

      style.text = content || ''
      styles.set(localPath, style)
    })
  }

  watch(css ? css.watch : localPath, file => {
    const notification = ui.notification('Injecting', file)
        , pathname = css ? css.path : path.relative(config.serve, file)
        , href = url.resolve(config.url, pathname)

    log.debug('Injecting', file)
    chrome.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('link').forEach(el => {
        if (el.href.startsWith('${ href }'))
          el.href = '${href + '?' + Date.now()}'
      })`
    })
    .then(() => js.run(localPath))
    .then(() => {
      ui.error()
      notification.done()
    })
    .catch(err => {
      ui.error('Injection failed for ' + file, err)
      notification.close()
      log.error(err)
    })
  }, css)
}

function setStyle(style) {
  return chrome.send('CSS.setStyleSheetText', {
    styleSheetId: style.styleSheetId,
    text: style.text
  })
}
