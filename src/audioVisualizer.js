import { h, createRef, Component } from 'preact';

export default class AudioVisualizer extends Component {
  constructor(props) {
    super(props)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    this.analyser = audioCtx.createAnalyser()
    const source = audioCtx.createMediaStreamSource(props.stream)
    source.connect(this.analyser)
    this.analyser.fftSize = 2048
    this.bufferLength = this.analyser.frequencyBinCount
    this.dataArray = new Uint8Array(this.bufferLength)
    this.draw = this.draw.bind(this)
  }

  componentDidMount () {
    this.width = this.theCanvas.current.width
    this.height = this.theCanvas.current.height
    this.canvasCtx = this.theCanvas.current.getContext('2d')
    this.canvasCtx.clearRect(0, 0, this.width, this.height)
    this.draw()
  }

  componentWillUnmount () {
    this.paused = true
  }

  play () {
    this.paused = false
    this.draw()
  }

  pause () {
    this.paused = true
  }

  theCanvas = createRef()

  draw () {
    this.analyser.getByteTimeDomainData(this.dataArray)
    this.canvasCtx.fillStyle = 'rgb(0, 0, 0)'
    this.canvasCtx.fillRect(0, 0, this.width, this.height)
    this.canvasCtx.lineWidth = 2
    this.canvasCtx.strokeStyle = 'rgb(200, 200, 200)'
    this.canvasCtx.beginPath()
    const sliceWidth = this.width * 1.0 / this.bufferLength
    let x = 0
    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.dataArray[i] / 128.0
      const y = v * this.height / 2

      if (i === 0) this.canvasCtx.moveTo(x, y)
      else this.canvasCtx.lineTo(x, y)

      x += sliceWidth
    }
    this.canvasCtx.lineTo(this.width, this.height / 2)
    this.canvasCtx.stroke()
    if (this.paused) return
    requestAnimationFrame(this.draw)
  }

  render(props) {
    return <canvas class={`audioVisualizer ${props.class}`}
      onclick={props.onclick}
      height={props.height}
      width={props.width}
      ref={this.theCanvas} />
  }
}
