import { h, createRef, Fragment, Component } from 'preact';
import { toClockTime } from './utils/temporal.js'
import * as Icons from './icons.js'
import AudioVisualizer from "./audioVisualizer.js"
import "./styles/locationPreview.css"

export default class LocationPreview extends Component{
  constructor(props) {
    super(props)
  }

  componentDidMount() {
    if (this.props.location.getType() === "media-fragment" && this.props.resource) {
      this.initializeUrl()
    }
  }

  componentWillUnmount() {
    this.mediaElement.current?.pause?.()
    this.secondaryAudio.current?.pause?.()
  }

  mediaElement = createRef()

  canvasElement = createRef()

  secondaryAudio = createRef()

  handleMediaClick = _ => {
      if (this.mediaElement.current.paused) {
        this.mediaElement.current.currentTime = this.props.location.getIntervalStart() / 1000
        this.mediaElement.current.play()
        if (this.canvasElement.current) this.projectToCanvas()
        this.secondaryAudio.current?.play()
      }
      else {
        this.mediaElement.current.pause()
        this.secondaryAudio.current?.pause()
      }
  }

  mediaRect = this.props.location.getMediaRect()

  handleLoadedMetadata = _ => {
    if (!this.mediaRect) {
      const theWidth = this.mediaElement.current.videoWidth || this.mediaElement.current.width
      const theHeight = this.mediaElement.current.videoHeight || this.mediaElement.current.height
      this.canvasElement.current.width = theWidth
      this.canvasElement.current.height = theHeight
      this.mediaRect = new DOMRect( 0, 0, theWidth, theHeight)
    }
  }

  handleLoadedData = _ => {
    const stream = this.mediaElement.current.mozCaptureStream?.() || this.mediaElement.current.captureStream()
    this.setState({ stream })
  }

  refreshCanvas = _ => {
    const ctx = this.canvasElement.current.getContext('2d', {alpha: false})
    ctx.drawImage(
      this.mediaElement.current, 
      this.mediaRect.x,
      this.mediaRect.y,
      this.mediaRect.width,
      this.mediaRect.height,
      0,
      0,
      this.mediaRect.width,
      this.mediaRect.height,
    )
  }

  projectToCanvas = _ => {
    this.refreshCanvas()
    if (this.mediaElement.current.paused) return
    requestAnimationFrame(this.projectToCanvas)
  }

  handleTimeUpdate = _ => {
    if (this.mediaElement.current?.currentTime > (this.props.location.getIntervalEnd() / 1000)) {
      this.mediaElement.current.pause()
      this.secondaryAudio.current?.pause()
    }
  }

  initializeUrl = async _ => {
    const mediaSrc = await this.props.resource.hasFetched
    this.setState({mediaSrc}, _ => {
      if (this.props.resource?.mimetype?.match(/^video|^audio/)) {
        const location = this.props.location.getIntervalStart()
        if (location !== 0) {
          this.mediaElement.current.currentTime = location / 1000 
        } else {
          this.mediaElement.current.currentTime = 1
          //we build in a millisecond seek to make sure the seeked event is triggered
        }
      }
    })
  }

  render(props, state) {
    if (props.location.getType() === "highlight") {
      return <div class="preview-quote">
          <span>{Icons.quote}</span>
          {props.location.getText()}
        </div>
    } else if (props.location.getType() === "text") {
      return <div class="preview-pin">
          {Icons.pin} <span>on page {props.location.getPageIndex()}</span>
        </div>
    } else if (props.location.getType() === "media-fragment") {
      return <div class="preview-media-fragment">
          {props.showPosition && props.resource?.mimetype?.match(/^image/)
            ? <div class="preview-media-fragment-position">{Icons.image}
              <span>Вибрано зображення на {this.mediaRect.x},{this.mediaRect.y}</span>
            </div>
            : props.showPosition
            ? <div class="preview-media-fragment-position">{Icons.headphones}
              <span>З {toClockTime(props.location.getIntervalStart() / 1000)} по {toClockTime(props.location.getIntervalEnd() / 1000)}</span>
            </div>
            : null
          }
          {props.resource?.mimetype?.match(/^audio/)
            ? <div class="preview-media-fragment-audio">
              <audio src={state.mediaSrc} ref={this.mediaElement} onloadeddata={this.handleLoadedData} ontimeupdate={this.handleTimeUpdate}/>
              {state.stream 
                ? <Fragment>
                  {//workaround for firefox bug: https://bugzilla-dev.allizom.org/show_bug.cgi?id=1178751
                    this.mediaElement.current.mozCaptureStream ? <audio ref={this.secondaryAudio} srcObject={state.stream} /> : null 
                  }
                  <AudioVisualizer onclick={this.handleMediaClick} height={100} width={500} stream={state.stream} /> 
                </Fragment>
                : null}
            </div>
            : props.resource?.mimetype?.match(/^video/)
            ? <div class="preview-media-fragment-video">
              <video src={state.mediaSrc} ref={this.mediaElement} onloadedmetadata={this.handleLoadedMetadata} onseeked={this.refreshCanvas} ontimeupdate={this.handleTimeUpdate} />
              <canvas width={this.mediaRect?.width} height={this.mediaRect?.height} onclick={this.handleMediaClick} ref={this.canvasElement}/>
            </div>
            : props.resource?.mimetype?.match(/^image/)
            ? <div class="preview-media-fragment-image">
              <img src={state.mediaSrc} ref={this.mediaElement} onload={this.refreshCanvas} />
              <canvas width={this.mediaRect?.width} height={this.mediaRect?.height} ref={this.canvasElement}/>
            </div>
            : null 
          }
        </div>
    }
  }
}
