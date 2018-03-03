const $ = require('jquery')
const path = require('path')
const SerialPort = require('serialport')
const XBeeAPI = require('xbee-api')
const C = XBeeAPI.constants
// const serialUtil = SerialPort.SerialPort
const EventEmitter = require('events')
const {GraphTab} = require('./tab.js')

module.exports.Serial = class Serial extends EventEmitter {
  constructor (listNode, refreshNode, iconNode, statusNode, toggleNode, graphicsManager, logger, data) {
    super()
    this.graphicsManager = graphicsManager
    this.listNode = listNode
    this.refreshNode = refreshNode
    this.iconNode = iconNode
    this.statusNode = statusNode
    this.toggleNode = toggleNode
    this.logger = logger
    this.data = data
    this.xbee = undefined
    this.connection = undefined
    this.toggleEnable = true
    this.listPorts()
    let serial = this
    this.refreshNode.on('click', function () { serial.listPorts() })
    this.toggleNode.on('click', function () { serial.toggleConnection() })
  }

  listPorts () {
    this.listNode.html('')
    let serial = this
    SerialPort.list(function (err, ports) {
      if (err) {
        serial.listNode.append($('<option value=\'null\'>ERROR</option'))
      } else {
        ports.forEach(function (port) {
          let basename = port.comName.split('/')
          let comId = basename[basename.length - 1]
          serial.listNode.append($('<option id=\'' + comId + '\'value=\'' + port.comName + '\'>' + port.comName + '</option>'))
        })
      }
    })
  }

  toggleConnection () {
    if (this.listNode.val() === null || this.listNode.val() === 'null') return
    if (this.toggleEnable) {
      this.statusNode.html('Serial Loading...')
      this.toggleEnable = false
      let serial = this
      setTimeout(function () { serial.toggleEnable = true }, 1000)
      if (this.connection) this.closePort()
      else this.openPort()
    }
  }

  openPort () {
    let portName = this.listNode.val()
    console.log('attempt connection to', portName)
    this.xbee = new XBeeAPI.XBeeAPI({
      api_mode: 2,
      parser_buffer_size: 128,
      builder_buffer_size: 128
    })

    this.connection = new SerialPort(portName, {
      autoOpen: false,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      flowControl: false
    })

    this.connection.pipe(this.xbee.parser)
    this.xbee.builder.pipe(this.connection)

    let serial = this
    this.connection.open(function (err) {
      if (err) {
        console.log('connection failed', err)
        serial.iconNode.attr('src', path.join(path.dirname(path.dirname(__dirname)), 'static', 'disconnect-icon.png'))
        serial.statusNode.html('Serial Disconnected')
      } else {
        console.log('connection opened')
        serial.iconNode.attr('src', path.join(path.dirname(path.dirname(__dirname)), 'static', 'connect-icon.png'))
        serial.statusNode.html('Serial Connected')
        serial.xbee.parser.on('data', function (frame) { serial.unpackData(frame) })
        serial.xbee.on('err', function () { serial.retryPort() })
        let testFrameObj = {
          type: 0x10, // xbee_api.constants.FRAME_TYPE.ZIGBEE_TRANSMIT_REQUEST
          destination64: '0013a2004070d534',
          data: '' // Can either be string or byte array.
        }
        serial.xbee.builder.write(testFrameObj)
      }
    })
  }

  closePort () {
    let serial = this
    this.connection.close(function () {
      console.log('connection closed')
      serial.connection = undefined
      serial.iconNode.attr('src', path.join(path.dirname(path.dirname(__dirname)), 'static', 'disconnect-icon.png'))
      serial.statusNode.html('Serial Disconnected')
    })
  }

  retryPort () {
    console.log('connection retrying')
    if (this.connection) {
      this.toggleEnable = false
      let serial = this
      this.connection.close(function () {
        console.log('connection closed')
        serial.connection = undefined
        serial.iconNode.attr('src', path.join(path.dirname(path.dirname(__dirname)), 'static', 'disconnect-icon.png'))
        serial.openPort()
        setTimeout(function () { serial.toggleEnable = true }, 1000)
      })
    }
  }

  unpackData (frame) {
    // console.log('got frame type: ', frame.type)
    if (frame.type === 0x90) {
      let buffer = frame.data
      let cadence = buffer[1] | (buffer[2] << 8)
      let airSpeedRotation = buffer[3] | (buffer[4] << 8)
      let heading = buffer[5] | buffer[6] << 8
      let roll = buffer[7] | buffer[8] << 8
      let pitch = buffer[9] | buffer[10] << 8
      let accelX = buffer[11] | buffer[12] << 8
      let accelY = buffer[13] | buffer[14] << 8
      let accelZ = buffer[15] | buffer[16] << 8
      if (heading & 0x8000) heading -= 0x10000 // 2byte signed から 4byte signed に変換
      if (roll & 0x8000) roll -= 0x10000 // 2byte signed から 4byte signed に変換
      if (pitch & 0x8000) pitch -= 0x10000 // 2byte signed から 4byte signed に変換
      if (accelX & 0x8000) accelX -= 0x10000 // 2byte signed から 4byte signed に変換
      if (accelY & 0x8000) accelY -= 0x10000 // 2byte signed から 4byte signed に変換
      if (accelZ & 0x8000) accelZ -= 0x10000 // 2byte signed から 4byte signed に変換
      heading -= 180
      roll /= 100
      pitch /= 100
      accelX /= 100
      accelY /= 100
      accelZ /= 100
      /* let calibAccelerometer = (buffer[17] & 0x03)
      let calibMagnetometer = (buffer[17] & 0x0C) >> 2
      let calibGyrosensor = (buffer[17] & 0x30) >> 4
      let calibSystem = (buffer[17] & 0xC0) >> 6 */
      let altitude = (buffer[18] | buffer[19] << 8) / 100
      if (altitude > 10) altitude = 10
      else if (altitude < 0) altitude = 0
      let longitude = (buffer[20] | buffer[21] << 8 | buffer[22] << 16 | buffer[23] << 24) / 1000000
      let latitude = (buffer[24] | buffer[25] << 8 | buffer[26] << 16 | buffer[27] << 24) / 1000000
      // let satellites = buffer[37]
      let rudderPos = buffer[63] | buffer[64] << 8
      if (rudderPos & 0x8000) rudderPos -= 0x10000 // 2byte signed から 4byte signed に変換
      let rudderLoad = buffer[69] | (buffer[70] << 8)
      let rudderTemp = buffer[71] | (buffer[72] << 8)
      let rudderVolt = (buffer[73] | (buffer[74] << 8)) / 100
      let elevatorPos = buffer[82] | buffer[83] << 8
      if (elevatorPos & 0x8000) elevatorPos -= 0x10000 // 2byte signed から 4byte signed に変換
      let elevatorLoad = buffer[88] | (buffer[89] << 8)
      let elevatorTemp = buffer[90] | (buffer[91] << 8)
      let elevatorVolt = (buffer[92] | (buffer[93] << 8)) / 100
      let timeNow = Date.now()
      this.data.clock.setValue(timeNow)
      this.data.cadence.setValue(cadence)
      this.data.rudder.setValue(rudderPos) // TODO
      this.data.elevator.setValue(elevatorPos) // TODO
      this.data.altitude.setValue(altitude)
      this.data.airSpeed.setValue(airSpeedRotation / 500)
      this.data.groundSpeed.setValue(0) // TODO
      this.data.yaw.setValue(heading)
      this.data.pitch.setValue(pitch)
      this.data.roll.setValue(roll)
      this.data.latitude.setValue(latitude)
      this.data.longitude.setValue(longitude)
      this.data.rudderLoad.setValue(rudderLoad)
      this.data.rudderTemp.setValue(rudderTemp)
      this.data.rudderVolt.setValue(rudderVolt)
      this.data.elevatorLoad.setValue(elevatorLoad)
      this.data.elevatorTemp.setValue(elevatorTemp)
      this.data.elevatorVolt.setValue(elevatorVolt)
      for (let i = 0; i < GraphTab.tabs.length; i++) {
        GraphTab.tabs[i].emit('update', timeNow)
      }
      this.logger.emit('data')
      this.graphicsManager.emit('update')
    } else if (frame.type === C.FRAME_TYPE.AT_COMMAND_RESPONSE) {
      // テストパケットの受信
      console.log('Node identifier:', frame)
    }
  }
}
