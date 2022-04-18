import { h, createRef, Fragment, Component } from 'preact';
import Resource from './utils/resource.js'
import Location from './utils/location.js'
import History from './history.js'
import WaveSurfer from 'wavesurfer.js'
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import { onlineOrAlert } from "./utils/alerts.js"
import Regions from 'wavesurfer.js/src/plugin/regions/'
import './styles/audioContent.css'
import { mscLocation, mscAudioInterval, populusHighlight, spaceChild, spaceParent } from "./constants.js"

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
    this.clearSelection()
    this.pause()
    this.selection = this.wavesurfer.addRegion({ 
      start, 
      end, 
      color,
      drag: false,
    })
    document.dispatchEvent(new Event("selectionchange"))
  }

  clearSelection = _ => {
    if (this.selection) {
      this.selection.remove()
      this.selection = null
    }
    document.dispatchEvent(new Event("selectionchange"))
  }

  generateLocation = _ => {
    return {
      [mscAudioInterval]: {
        start: Math.floor(this.selection.start * 1000),
        end: Math.floor(this.selection.end * 1000)
      },
      [populusHighlight]: {
        activityStatus: "pending",
        creator: Client.client.getUserId()
      }
    }
  }

  commitRegion = _ => {
    if (!onlineOrAlert()) return
    const theDomain = Client.client.getDomain()
    const theRoomState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theLevels = theRoomState.getStateEvents("m.room.power_levels")
    const locationData = this.generateLocation()
    // TODO: we should set room_alias_name and name, in a useful way based on the selection
    return Client.client.createRoom({
      visibility: "public",
      name: `highlighted interval from ${this.selection.start} to ${this.selection.end}`,
      power_level_content_override: {
        users: Object.assign({}, theLevels[0].getContent().users, {
          [Client.client.getUserId()]: 100
        })
      },
      initial_state: [{
        type: "m.room.join_rules",
        state_key: "",
        content: {join_rule: "public"}
      },
      {
        type: spaceParent, // we indicate that the current room is the parent
        content: { via: [theDomain], [mscLocation]: locationData },
        state_key: this.props.room.roomId
      }
      ]
    }).then(roominfo => {
      // set child event in pdfRoom State
      this.clearSelection()
      const childContent = { via: [theDomain], [mscLocation]: locationData }
      // We focus on a new fake placeholder event to potentially insert the highlight immediately
      const fakeEvent = new Matrix.MatrixEvent({
        type: "m.space.child",
        origin_server_ts: new Date().getTime(),
        room_id: this.props.room.roomId,
        sender: Client.client.getUserId(),
        state_key: roominfo.room_id,
        content: childContent
      })
      Client.client.sendStateEvent(this.props.room.roomId, spaceChild, childContent, roominfo.room_id)
      return fakeEvent
    })
  }

  handlePointerdown = e => {
    if (["WAVE","REGION","HANDLE"].includes(e.target.tagName)) {
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
      backend: 'MediaElement',
      barWidth: 5,
      scrollParent: true,
      plugins: [ Regions.create() ],
    })
    this.pcm = []
    for (let i = 0; i < 2048; i++) {
      this.pcm.push((Math.random() * 2) - 1)
    }
    this.wavesurfer.load(URL.createObjectURL(audio), this.pcm) // URL indirection here so that we can eventually prerender
    this.wavesurfer.on('ready', _ => {
      this.props.setAudioLoadingStatus(null)
      const width = document.body.clientWidth
      const height = document.body.clientHeight
      const duration = Math.ceil(this.wavesurfer.getDuration())
      this.props.setAudioDuration(Math.ceil(this.wavesurfer.getDuration()))
      if (this.props.currentTime) this.wavesurfer.seekAndCenter(this.props.currentTime / duration)
      this.props.setContentDimensions(height,width)
      this.setState({ready: true})
    });
    this.wavesurfer.on('seek', _ => {
      if (this.state.ready) {
        const timeSec = Math.floor(this.wavesurfer.getCurrentTime())
        History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${timeSec}/`)
      }
    });
    this.wavesurfer.on('scroll', e => { 
      if (Math.abs(this.lastLeft - e.target.scrollLeft) > 25) {
        this.wavesurfer.drawer.params.autoCenter = false;
        this.cancelPointer()
      } else {
        this.lastLeft = e.target.scrollLeft
      }
    })
  }

  filterAnnotations = loc => loc.getType() === "audio-interval"

  getAnnotations() {
    let didFocus = false
    const annotationData = this.props.filteredAnnotationContents
      .filter(loc => {
        if (loc.getChild() === this.props.focus?.getChild()) didFocus = true
        return this.filterAnnotations(loc)
      })
    // We add the secondary focus
    if (this.props.secondaryFocus && this.filterAnnotations(this.props.secondaryFocus)) annotationData.push(this.props.secondaryFocus)
    // We add the focus back in if it's on the page but got screened out of filteredAnnotationContents
    if (this.props.focus && this.filterAnnotations(this.props.focus) && !didFocus) annotationData.push(this.props.focus)
    const annotations = annotationData.map(loc => <WaveRegion 
      setFocus={this.props.setFocus}
      wavesurfer={this.wavesurfer} 
      key={loc.event.getId()}
      focused={this.props.focus?.getChild() === loc.getChild()}
      location={loc} 
    />)
    return annotations
  }

  render(props, state) {
    return <div id="audio-view" 
      ref={this.audioView}
      onPointerdown={this.handlePointerdown}
      onPointerup={this.cancelPointer}
      onPointerout={this.cancelPointer}
    >
      <div ref={this.waveform} data-annotations-focused={this.props.focus} id="waveform">
        {state.ready ? this.getAnnotations() : null}
      </div>
    </div>
  }
}

class WaveRegion extends Component {

  componentDidMount() {
    const color = new UserColor(this.props.location.getCreator()).solid
    this.region = this.props.wavesurfer.addRegion({
      start: this.props.location.getIntervalStart() / 1000,
      end: this.props.location.getIntervalEnd() / 1000,
      drag:false,
      resize:false,
      id: this.props.location.event.getId(),
      color
    })
    this.region.on("click", this.setFocus)
  }

  componentDidUpdate() {
    if (this.props.focused) this.region.element.dataset.focused = true
    else delete this.region.element.dataset.focused
  }

  setFocus = _ => {
    this.props.setFocus(this.props.location)
  }

  componentWillUnmount() {
    this.region.remove()
  }

  render() { }
}
