import { h, createRef, Component } from 'preact';
import { decode } from "blurhash"

export default class BlurhashCanvas extends Component {

  componentDidMount() {
    this.drawBlurhash()
  }

  blurhashCanvas = createRef()

  drawBlurhash = _ => {
    if (!this.props.height || !this.props.width || !this.props.blurhash) return
    const ctx = this.blurhashCanvas.current.getContext("2d")
    ctx.clearRect(0, 0, this.blurhashCanvas.current.wdith, this.blurhashCanvas.current.height)
    // we draw them small and scale up in CSS, following blurhash developer's advice
    const width = 32
    const height = Math.round(32 * (this.props.height / this.props.width))
    this.blurhashCanvas.current.width = width
    this.blurhashCanvas.current.height = height
    const imageData = ctx.createImageData(width, height);
    const pixels = decode(this.props.blurhash, width, height)
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
  }

  render(props) {
    const canvasWidthFromInfo = props.width && props.height && props.blurhash ? { 
      "width": `${props.width}px`,
      "max-width": `calc(min(100% - 20px, ${props.width}px))`
    } : null
    return <canvas ref={this.blurhashCanvas} style={canvasWidthFromInfo} class={this.props.class} />
  }
}
