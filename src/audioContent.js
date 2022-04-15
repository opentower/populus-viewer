import { h, createRef, Fragment, Component } from 'preact';
import Resource from './utils/resource.js'
import Location from './utils/location.js'
import WaveSurfer from 'wavesurfer.js'
import './styles/audioContent.css'

export default class AudioContent extends Component {
  constructor(props) {
    super(props)
    this.hasFetched = new Promise((resolve, reject) => {
      this.resolveFetch = resolve
      this.rejectFetch = reject
    })
  }

  componentDidMount() { this.fetchAudio() }

  componentWillUnmount() { this.wavesurfer.destroy() }

  hasSelection() {
    return false
  }

  static Store = {}

  waveform = createRef()

  play = _ => {
    this.wavesurfer.seekAndCenter(this.wavesurfer.getCurrentTime() / this.wavesurfer.getDuration() )
    //this gets a little dicy, just because you want all the repositioning to
    //be done *before* there's any risk of scroll events unsetting the autoCenter
    this.lastLeft = this.wavesurfer.drawer.wrapper.scrollLeft
    this.wavesurfer.drawer.params.autoCenter = true
    this.wavesurfer.play()
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
    this.props.setAudioLoadingStatus("rendering waveform...")
    this.wavesurfer = new WaveSurfer.create({
      container: '#waveform',
      scrollParent: true
    })
    this.wavesurfer.loadBlob(audio)
    this.wavesurfer.on('ready', _ => {
      this.props.setAudioLoadingStatus(null)
      const width = document.body.clientWidth
      const height = document.body.clientHeight
      const duration = Math.ceil(this.wavesurfer.getDuration())
      this.props.setAudioDuration(Math.ceil(this.wavesurfer.getDuration()))
      if (this.props.currentTime) this.wavesurfer.seekAndCenter(this.props.currentTime / duration)
      this.props.setContentDimensions(height,width)
    });
    this.wavesurfer.on('scroll', e => { 
      if (Math.abs(this.lastLeft - e.target.scrollLeft) > 25) {
        this.wavesurfer.drawer.params.autoCenter = false;
      } else {
        this.lastLeft = e.target.scrollLeft
      }
    })
  }

  render() {
    return <div id="audio-view">
      <div ref={this.waveform} onscroll={this.handleScroll} id="waveform"></div>
    </div>
  }
}
