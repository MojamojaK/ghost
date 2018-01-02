const path = require('path')
const EventEmitter = require('events')
const settings = require('electron-settings')

module.exports.Graphics = class Graphics extends EventEmitter {
  constructor (iconNode, statusNode, toggleNode, data) {
    super()
    this.iconNode = iconNode
    this.statusNode = statusNode
    this.toggleNode = toggleNode
    this.data = data
    this.graphicsEnabled = settings.get('graphics.enabled', true)
    let graphics = this
    this.toggleNode.on('click', function () { graphics.toggleGraphics() })
    this.on('update', function () { graphics.updateGraphics() })
    this.setupStatus()
  }

  setupStatus () {
    if (this.graphicsEnabled) {
      this.statusNode.html('Graphics Running')
      this.iconNode.attr('src', path.join(path.dirname(path.dirname(__dirname)), 'static', 'graphics-start.png'))
      this.emit('update')
    } else {
      this.statusNode.html('Graphics Paused')
      this.iconNode.attr('src', path.join(path.dirname(path.dirname(__dirname)), 'static', 'graphics-stop.png'))
    }
  }

  toggleGraphics () {
    this.graphicsEnabled = !this.graphicsEnabled
    settings.set('graphics.enabled', this.graphicsEnabled)
    this.setupStatus()
  }

  updateGraphics () {
    let graphics = this
    if (this.graphicsEnabled) {
      Object.keys(this.data).map(function (key, index) {
        graphics.data[key].emit('update')
      })
    } else {
      this.data.clock.emit('update')
    }
  }
}
