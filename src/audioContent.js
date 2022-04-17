import { h, createRef, Fragment, Component } from 'preact';
import Resource from './utils/resource.js'
import Location from './utils/location.js'
import History from './history.js'
import WaveSurfer from 'wavesurfer.js'
import Client from './client.js'
import { UserColor } from './utils/colors.js'
import Regions from 'wavesurfer.js/src/plugin/regions/'
import './styles/audioContent.css'

export default class AudioContent extends Component {
  constructor(props) {
    super(props)
    this.state = {
      regions: []
    }
    this.hasFetched = new Promise((resolve, reject) => {
      this.resolveFetch = resolve
      this.rejectFetch = reject
    })
  }

  componentDidMount() { this.fetchAudio() }

  componentWillUnmount() { this.wavesurfer.destroy() }

  hasSelection() { return !!this.selection }

  audioView = createRef()

  createSelection = (start, end) => {
    const userId = Client.client.getUserId()
    const color = new UserColor(userId).solid
    this.selection = this.wavesurfer.addRegion({ 
      start, 
      end, 
      color,
      drag: false,
    })
  }

  clearSelection = _ => {
    if (this.selection) {
      this.selection.remove()
      this.selection = null
    }
  }

  handlePointerdown = e => {
    if (["WAVE","REGION","HANDLE"].includes(e.target.tagName)) {
      if (this.selection) return // do nothing if there's already a selection
      clearTimeout(this.longPressTimeout)
      const percentAcross = (e.clientX + e.target.scrollLeft) / e.target.scrollWidth
      this.longPressTimeout = setTimeout(_ => {
        this.wavesurfer.seekTo(percentAcross)
        this.createSelection(percentAcross * this.wavesurfer.getDuration(), percentAcross * this.wavesurfer.getDuration() + 5)
      }, 2000) 
    } else {
      clearTimeout(this.longPressTimeout)
      this.clearSelection()
    } 
  }

  cancelPointer = _ => clearTimeout(this.longPressTimeout)

  static Store = {}

  waveform = createRef()

  play = _ => {
    if (this.selection) {
      this.selection.play()
    } else {
      this.wavesurfer.seekAndCenter(this.wavesurfer.getCurrentTime() / this.wavesurfer.getDuration() )
      //this gets a little dicy, just because you want all the repositioning to
      //be done *before* there's any risk of scroll events unsetting the autoCenter
      this.lastLeft = this.wavesurfer.drawer.wrapper.scrollLeft
      this.wavesurfer.drawer.params.autoCenter = true
      this.wavesurfer.play()
    }
  }

  pause = _ => this.wavesurfer.pause()

  async fetchAudio () {
    const theAudio = new Resource(this.props.room)
    if (!AudioContent.Store[theAudio.url]) {
      AudioContent.Store[theAudio.url] = window.fetch(theAudio.httpUrl)
        .then(async response => {
          const theClone = response.clone()
          const contentLength = +response.headers.get('Content-Length')
          const reader = response.body.getReader()
          let accumulator = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) { break }
            accumulator = accumulator + value.length
            this.props.setAudioLoadingStatus(accumulator / contentLength)
          }
          return theClone.blob()
        })
        .catch(this.catchFetchPdfError)
    } else { console.log(`found audio for ${this.props.room.name} in store` ) }
    if (this.errorCondition) return
    AudioContent.Store[theAudio.url].then(this.drawAudio)
  }

  drawAudio = audio => {
    this.props.setAudioLoadingStatus("Rendering waveform...")
    this.wavesurfer = new WaveSurfer.create({
      container: '#waveform',
      scrollParent: true,
      plugins: [ Regions.create() ],
    })
    this.wavesurfer.load(URL.createObjectURL(audio)) // URL indirection here so that we can eventually prerender
    this.wavesurfer.on('ready', _ => {
      this.props.setAudioLoadingStatus(null)
      const width = document.body.clientWidth
      const height = document.body.clientHeight
      const duration = Math.ceil(this.wavesurfer.getDuration())
      this.props.setAudioDuration(Math.ceil(this.wavesurfer.getDuration()))
      if (this.props.currentTime) this.wavesurfer.seekAndCenter(this.props.currentTime / duration)
      this.props.setContentDimensions(height,width)
    });
    this.wavesurfer.on('seek', _ => {
      const timeSec = Math.floor(this.wavesurfer.getCurrentTime())
      History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${timeSec}/`)
    });
    this.wavesurfer.on('scroll', e => { 
      if (Math.abs(this.lastLeft - e.target.scrollLeft) > 25) {
        this.wavesurfer.drawer.params.autoCenter = false;
      } else {
        this.lastLeft = e.target.scrollLeft
      }
    })
  }

  render(props, state) {
    return <div id="audio-view" 
      ref={this.audioView}
      onPointerdown={this.handlePointerdown}
      onPointerup={this.cancelPointer}
      onPointerout={this.cancelPointer}
    >
      <div ref={this.waveform} id="waveform"></div>
    </div>
  }
}

class WaveRegion extends Component {

  componentDidMount() {
    console.log(this.props.start)
    this.region = this.props.wavesurfer.addRegion({
      start: this.props.start,
      end: this.props.start + 5,
    })
  }

  componentWillUnmount() {
    this.region.remove()
  }

  render() { 
    console.log("rendered")
  }
}
