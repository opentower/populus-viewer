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

  componentWillUnmount() { this.wavesurfer.stop() }

  hasSelection() {
    return false
  }

  static Store = {}

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
      this.wavesurfer.play();
      this.props.setAudioLoadingStatus(null)
      const width = document.body.clientWidth
      const height = document.body.clientHeight
      this.props.setContentDimensions(height,width)
    });

  }

  render() {
    return <div id="audio-view">
      <div id="waveform"></div>
    </div>
  }
}
