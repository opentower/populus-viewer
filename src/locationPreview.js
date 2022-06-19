import { h, createRef, Component } from 'preact';
import { toClockTime } from './utils/temporal.js'
import * as Icons from './icons.js'
import "./styles/locationPreview.css"

export default class LocationPreview extends Component{

  componentDidMount() {
    if (this.props.location.getType() === "media-fragment" && this.props.resource) {
      this.initializeUrl()
    }
  }

  mediaElement = createRef()

  handleVideoClick = _ => {
      if (this.mediaElement.current.paused) {
        this.mediaElement.current.currentTime = this.props.location.getIntervalStart() / 1000
        this.mediaElement.current.play()
      }
      else this.mediaElement.current.pause()
  }

  handleTimeUpdate = _ => {
    if (this.mediaElement.current?.currentTime > (this.props.location.getIntervalEnd() / 1000)) {
      this.mediaElement.current.pause()
    }
  }

  handleSeeked = _ => {
    if (this.mediaElement.current?.currentTime > (this.props.location.getIntervalEnd() / 1000) ||
      this.mediaElement.current?.currentTime < (this.props.location.getIntervalStart() / 1000)
    ) { this.mediaElement.current.currentTime = this.props.location.getIntervalStart() / 1000 }
  }

  initializeUrl = async _ => {
    const mediaSrc = await this.props.resource.hasFetched
    this.setState({mediaSrc}, _ => 
      this.mediaElement.current.currentTime = this.props.location.getIntervalStart() / 1000 )
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
          {props.showPosition 
            ? <div class="preview-media-fragment-position">{Icons.headphones}
              <span>From {toClockTime(props.location.getIntervalStart() / 1000)} to {toClockTime(props.location.getIntervalEnd() / 1000)}</span>
            </div>
            : null
          }
          {props.resource?.mimetype?.match(/^audio/)
            ? <audio controls src={state.mediaSrc} ref={this.mediaElement} onseeked={this.handleSeeked} ontimeupdate={this.handleTimeUpdate} />
            : props.resource?.mimetype?.match(/^video/)
            ? <div class="preview-media-fragment-video">
              <video src={state.mediaSrc} ref={this.mediaElement} onseeked={this.handleSeeked} ontimeupdate={this.handleTimeUpdate} onclick={this.handleVideoClick} />
            </div>
            : null 
          }
        </div>
    }
  }
}
