import { h, createRef, Fragment, Component } from 'preact';
import Resource from './utils/resource.js'
import Location from './utils/location.js'
import Toast from "./toast.js"
import History from './history.js'
import WaveSurfer from 'wavesurfer.js'
import Client from './client.js'
import { mulberry32, hashString } from './utils/math.js'
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import { onlineOrAlert } from "./utils/alerts.js"
import Regions from 'wavesurfer.js/src/plugin/regions/'
import './styles/mediaContent.css'
import { mscLocation, mscMediaFragment, populusHighlight, lastViewed } from "./constants.js"

export default class MediaContent extends Component {

  // we expose this method so that we can unformly sanatize position-strings
  // before passing them to components that expect timestamps
  static positionToTimestamp(pos, room) {
    const tryLastPosition = room?.getAccountData(lastViewed)?.getContent().position
    const tryParse = parseInt(pos, 10)
    return Number.isInteger(tryParse)
      ? tryParse 
      // need isInteger because 0 is falsey
      : Number.isInteger(tryLastPosition)
      ? tryLastPosition
      : 0
  }

  constructor(props) {
    super(props)
    this.hasFetched = new Promise((resolve, reject) => {
      this.resolveFetch = resolve
      this.rejectFetch = reject
    })
    // inertia for keyboard selection
    this.isVideo = props.mimetype.match(/^video/)
    this.rightInertia = 1
    this.leftInertia = 1
    this.zoomFactor = 1 
  }

  componentDidMount() { 
    this.fetchMedia() 
  }

  componentWillUnmount() { 
    clearTimeout(this.inertiaTimeout)
    clearTimeout(this.longPressTimeout)
    clearTimeout(this.saveLocationTimeout)
    if (this.wavesurfer) this.wavesurfer.destroy() 
  }

  componentDidUpdate(prev) {
    if (this.state.ready) {
      const duration = this.wavesurfer.getDuration()
      const timeSec = this.wavesurfer.getCurrentTime()
      if (this.props.focus && this.props.focus?.getChild() !== prev.focus?.getChild() ) {
        // focusing new annotation: jump to that 
        if (this.stampMatchesFocus()) this.centerLocation(this.props.focus)
        // if the timestamp is the same as the one we get from the focus, we center the beginning of the focus on the nose
        else if (this.props.timeStamp < 0 || this.props.timeStamp > duration ) this.handleBadTimeStamp()
        // if the timestamp is invalid, we handle it
        else this.wavesurfer.seekAndCenter(this.props.timeStamp / duration)
        // otherwise we center based on the timestamp
      } else if ("timeStamp" in this.props && 
        Math.abs(this.props.timeStamp - prev.timeStamp) > 2 && //timestamp changed signifiantly, and
        Math.abs(this.props.timeStamp - timeSec) > 2 //we're not already at the location
      ) {
        // If there's no focus, we center based on the timestamp (use "in"
        // since 0 is falsey), assuming it's changed by enough
        if (this.props.timeStamp < 0 || this.props.timeStamp > duration) this.handleBadTimeStamp()
        // if the timestamp is invalid, we handle it
        else this.wavesurfer.seekAndCenter(this.props.timeStamp / duration)
        // otherwise we center based on the timestamp
      } else if (this.props.secondaryFocus && this.props.secondaryFocus?.getIntervalStart() !== prev.secondaryFocus?.getIntervalStart() ) {
        // and if the only thing that has changed is the secondary focus, we jump to that.
        this.centerLocation(this.props.secondaryFocus)
      }
      if (prev.filteredAnnotationContents.length !== this.props.filteredAnnotationContents.length) {
        // annotation added or deleted
        this.updateVideoLocation()
      }
    }
  }

  hasSelection() { return !!this.state.selection }

  mediaView = createRef()

  videoElement = createRef()

  videoOverlay = createRef()

  video = createRef()

  createSelection = (start, end) => {
    const userId = Client.client.getUserId()
    const color = new UserColor(userId).solid
    this.clearSelection()
    this.pause()
    const selection = this.wavesurfer.addRegion({ 
      start, 
      end, 
      color,
      drag: false,
      id: "active-selection"
    })
    this.setState({ selection }, _ => document.dispatchEvent(new Event("selectionchange")))
  }

  clearSelection = _ => {
    if (this.state.selection) {
      this.state.selection.remove()
      this.video.current?.clearOverlayPosition()
      this.setState({selection: null}, _ => document.dispatchEvent(new Event("selectionchange")))
    }
  }

  generateLocation = _ => {
    return {
      [mscMediaFragment]: {
        start: Math.floor(this.state.selection.start * 1000),
        end: Math.ceil(this.state.selection.end * 1000),
        ...(this.videoOverlay.current 
          ? {
            x: this.videoOverlay.current.spotlightX,
            y: this.videoOverlay.current.spotlightY,
            w: this.videoOverlay.current.spotlightWidth,
            h: this.videoOverlay.current.spotlightHeight,
          }
          : null
        )
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
    const theLevels = theRoomState.getStateEvents(Matrix.EventType.RoomPowerLevels, "")
    const locationData = this.generateLocation()
    return Client.client.createRoom({
      visibility: "private",
      name: `highlighted interval from ${this.state.selection.start} to ${this.state.selection.end}`,
      power_level_content_override: {
        users: Object.assign({}, theLevels.getContent().users, {
          [Client.client.getUserId()]: 100
        })
      },
      initial_state: [{
        type: Matrix.EventType.RoomJoinRules,
        state_key: "",
        content: {join_rule: "public"}
      },
      {
        type: Matrix.EventType.SpaceParent, // we indicate that the current room is the parent
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
        type: Matrix.EventType.SpaceChild,
        origin_server_ts: new Date().getTime(),
        room_id: this.props.room.roomId,
        sender: Client.client.getUserId(),
        state_key: roominfo.room_id,
        content: childContent
      })
      Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.SpaceChild, childContent, roominfo.room_id)
      this.props.setFocus(new Location(fakeEvent))
      this.props.showChat()
    })
  }

  handlePointerdown = e => {
    if (e.target.tagName === "WAVE") {
      clearTimeout(this.longPressTimeout)
      const percentAcross = (e.clientX + e.target.scrollLeft) / e.target.scrollWidth
      this.longPressTimeout = setTimeout(_ => {
        this.wavesurfer.seekTo(percentAcross)
        this.createSelection(percentAcross * this.wavesurfer.getDuration(), percentAcross * this.wavesurfer.getDuration() + 5)
      }, 500) 
    }
    else if (["REGION","HANDLE"].includes(e.target.tagName)) return
    else {
      if (e.noClear || this.video.current?.base.contains(e.target)) return
      clearTimeout(this.longPressTimeout)
      this.clearSelection()
    } 
  }

  getCurrentLocations = _ => {
    const currentSec = this.wavesurfer.getCurrentTime()
    return this.props.filteredAnnotationContents
      .filter(loc => {
        if (currentSec < (loc.getIntervalStart() / 1000)) return false
        if (currentSec > (loc.getIntervalEnd() / 1000)) return false
        return this.filterAnnotations(loc)
      })
  }

  cancelPointer = _ => clearTimeout(this.longPressTimeout)

  static MediaStore = {}

  static PCMStore = {}

  waveform = createRef()

  play = _ => {
    if (this.state.selection) {
      this.state.selection.play()
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

  playPause = _ => {
    if (this.wavesurfer.isPlaying()) this.pause()
    else this.play()
  }

  scrubRight = _ => {
    clearTimeout(this.inertiaTimeout)
    this.wavesurfer.skip(1 * this.rightInertia * (1 / this.zoomFactor))
    this.leftInertia = 1
    this.rightInertia += .1
    this.inertiaTimeout = setTimeout(this.resetInertia, 500)
  }

  scrubLeft = _ => {
    clearTimeout(this.inertiaTimeout)
    this.wavesurfer.skip(-1 * this.leftInertia * (1 / this.zoomFactor))
    this.rightInertia = 1
    this.leftInertia += .1
    this.inertiaTimeout = setTimeout(this.resetInertia, 500)
  }

  resetInertia = _ => {
    this.leftInertia = 1
    this.rightInertia = 1
  }

  selRight = e => {
    e.preventDefault()
    if (this.state.selection) {
      clearTimeout(this.inertiaTimeout)
      if (e.shiftKey) {
        this.state.selection.onResize(.2 * this.rightInertia * (1 / this.zoomFactor), "start") 
        this.wavesurfer.seekAndCenter(this.state.selection.start / this.wavesurfer.getDuration())
      } else {
        this.state.selection.onResize(.2 * this.rightInertia * (1 / this.zoomFactor)) 
        this.wavesurfer.seekAndCenter(this.state.selection.end / this.wavesurfer.getDuration())
      }
      this.leftInertia = 1
      this.rightInertia += .1
      this.inertiaTimeout = setTimeout(this.resetInertia, 500)
    }
    else this.scrubRight()
  }

  selLeft = e => {
    e.preventDefault()
    if (this.state.selection) {
      clearTimeout(this.inertiaTimeout)
      if (e.shiftKey) {
        this.state.selection.onResize(-.2 * this.leftInertia * (1 / this.zoomFactor), "start") 
        this.wavesurfer.seekAndCenter(this.state.selection.start / this.wavesurfer.getDuration())
      }
      else {
        this.state.selection.onResize(-.2 * this.leftInertia * (1 / this.zoomFactor)) 
        this.wavesurfer.seekAndCenter(this.state.selection.end / this.wavesurfer.getDuration())
      }
      this.rightInertia = 1
      this.leftInertia += .1
      this.inertiaTimeout = setTimeout(this.resetInertia, 500)
    }
    else this.scrubLeft()
  }

  centerLocation = loc => {
    this.wavesurfer.seekAndCenter(loc.getIntervalStart() / (this.wavesurfer.getDuration() * 1000))
  }

  setZoom = n => {
    this.zoomFactor = Math.max(1, Math.min(n, 200))
    this.wavesurfer.zoom(15 * this.zoomFactor)
  }

  handleBadTimeStamp = _ => {
    const newTS = Math.floor(this.props.timeStamp < 0 ? 0 : this.wavesurfer.getDuration())
    History.replace(`/${encodeURIComponent(this.props.resourceAlias)}` + 
      `/${newTS}` + 
      `${this.props.roomFocused ? `/${this.props.roomFocused}` : ""}` +
      `${this.props.eventFocused ? `/${this.props.eventFocused}` : ""}`
    )
  }

  stampMatchesFocus = _ => {
    return this.props.timeStamp == Math.floor(this.props.focus.getIntervalStart() / 1000)
  }

  catchFetchMediaError = e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">Не зміг знайти {this.isVideo ? "audio file" : "video"}...</h3>
      <div>Tried to fetch: </div>
      <pre>{this.props.resourceAlias}</pre>
      <div>Нижче наведено повідомлення про помилку:</div>
      <pre>{e.message}</pre>
    </Fragment>)
    History.push('/')
    this.errorCondition = true
  }

  async fetchMedia () {
    const theMedia = new Resource(this.props.room)
    if (!MediaContent.MediaStore[theMedia.url]) {
      MediaContent.MediaStore[theMedia.url] = window.fetch(theMedia.httpUrl)
        .then(async response => {
          const theClone = response.clone()
          const contentLength = +response.headers.get('Content-Length')
          const reader = response.body.getReader()
          let accumulator = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) { break }
            accumulator = accumulator + value.length
            this.props.setMediaLoadingStatus(accumulator / contentLength)
          }
          const blob = await theClone.blob()
          // XXX someday, most browsers will let <video> use a blob as an srcObj, and then this can be simplified
          return URL.createObjectURL(blob)
        })
        .catch(this.catchFetchMediaError)
    } else { console.log(`found file for ${this.props.room.name} in store` ) }
    if (theMedia.pcm && !MediaContent.MediaStore[theMedia.pcm]) {
      MediaContent.PCMStore[theMedia.pcm] = window.fetch(Client.client.getHttpUriForMxcFromHS(theMedia.pcm))
        .then(response => response.json())
        .catch(err => console.log("Не вдалося отримати дані PCM", err))
    } else if (theMedia.pcm) { console.log(`знайдено PCM для ${this.props.room.name} ` ) }
    if (this.isVideo) this.props.setMobileButtonColor("var(--contrast-text)")
    if (this.errorCondition) return
    MediaContent.MediaStore[theMedia.url].then(mediaUrl => this.props.resource.resolveFetch(mediaUrl))
    MediaContent.MediaStore[theMedia.url].then(this.drawMedia(MediaContent.PCMStore[theMedia.pcm]))
    // TODO: this throws an error when the user exits the page before the media
    // has been drawn. it should be caught, similarly for PDF fetching
  }

  drawMedia = pcm => async mediaUrl => {
    this.props.setMediaLoadingStatus("Rendering waveform...")
    this.wavesurfer = new WaveSurfer.create({
      container: '#waveform',
      backend: 'MediaElement',
      barWidth: 5,
      scrollParent: true,
      plugins: [ Regions.create() ],
    })
    if (!pcm) {
      pcm = []
      const prng = mulberry32(hashString(this.props.resourceAlias))
      for (let i = 0; i < 2048; i++) pcm.push((prng() * 2) - 1)
    } else {
      pcm = await pcm
    }
    if (this.isVideo) this.videoElement.current.src = mediaUrl
    this.wavesurfer.load(this.videoElement.current || mediaUrl, pcm)
    this.wavesurfer.on('ready', _ => {
      this.wavesurfer.zoom(15)
      this.props.setMediaLoadingStatus(null)
      const width = document.body.clientWidth
      const height = document.body.clientHeight
      const duration = Math.ceil(this.wavesurfer.getDuration())
      this.props.setMediaDuration(duration)
      if ("timeStamp" in this.props) {
        if (this.props.timeStamp < 0 || this.props.timeStamp > duration) this.handleBadTimeStamp()
        else if (this.props.focus && this.stampMatchesFocus()) this.centerLocation(this.props.focus)
        else this.wavesurfer.seekAndCenter(this.props.timeStamp / duration)
      }
      this.props.setContentDimensions(height,width)
      this.setState({ready: true})
    });
    this.wavesurfer.on('seek', _ => {
      if (this.state.ready) {
        clearTimeout(this.seekTimeout)
        this.seekTimeout = setTimeout(_ => {
          const timeSec = Math.floor(this.wavesurfer.getCurrentTime())
          if (timeSec !== this.props.timeStamp) History.push(
            `/${encodeURIComponent(this.props.resourceAlias)}` + 
            `/${timeSec}` + 
            `${this.props.roomFocused ? `/${this.props.roomFocused}` : ""}` +
            `${this.props.eventFocused ? `/${this.props.eventFocused}` : ""}`
          )
          if (this.hasSelection) {
            const currentSec = this.wavesurfer.getCurrentTime()
            if (currentSec < this.state.selection?.start - .01) this.clearSelection()
            if (currentSec > this.state.selection?.end + .01) this.clearSelection()
          }
        }, 250)
      }
      this.updateSavedLocation()
      this.updateVideoLocation()
    });
    this.wavesurfer.on('scroll', e => { 
      if (Math.abs(this.lastLeft - e.target.scrollLeft) > 25) {
        this.wavesurfer.drawer.params.autoCenter = false;
        this.cancelPointer()
      } else {
        this.lastLeft = e.target.scrollLeft
      }
    })
    this.wavesurfer.on("audioprocess", _ => {
      this.updateSavedLocation()
      !this.updateVideoLocationLocked && this.updateVideoLocation()
    })
  }

  filterAnnotations = loc => loc.getType() === "media-fragment"

  setVideo = videoLocation => this.setState({ videoLocation })

  updateSavedLocation = _ => {
    // we only save if you've stopped zipping around for more than a second
    clearTimeout(this.saveLocationTimeout)
    this.saveLocationTimeout = setTimeout(_ => {
        Client.client.setRoomAccountData(this.props.room.roomId, lastViewed, {
          deviceId: Client.deviceId,
          position: this.props.timeStamp
        })
    }, 1500)
  }

  updateVideoLocation = _ => {
    const locations = this.getCurrentLocations()
    if (locations.length == 0) this.setVideo(null)
    else {
      locations.sort((a,b) => {
        if (a.getIntervalStart() > b.getIntervalStart()) return -1
        if (a.getIntervalStart() < b.getIntervalStart()) return 1
        return 0
      })
      this.setVideo(locations[0])
    }
    this.updateVideoLocationLocked = true
    //tiny debouncer in case this gets expensive with lots of highlights
    setTimeout(_ => this.updateVideoLocationLocked = false, 250)
  }

  getAnnotations() {
    let didFocus = false
    const annotationData = this.props.filteredAnnotationContents
      .filter(loc => {
        if (loc.getChild() === this.props.focus?.getChild()) didFocus = true
        return this.filterAnnotations(loc)
      }).sort((a,b) => {
        if (a.getIntervalStart() > b.getIntervalStart()) return 1
        if (a.getIntervalStart() < b.getIntervalStart()) return -1
        return 0
      })
    // We add the secondary focus
    if (this.props.secondaryFocus && this.filterAnnotations(this.props.secondaryFocus)) annotationData.push(this.props.secondaryFocus)
    // We add the focus back in if it's on the page but got screened out of filteredAnnotationContents
    if (this.props.focus && this.filterAnnotations(this.props.focus) && !didFocus) annotationData.push(this.props.focus)
    const gutter = {}
    const annotations = annotationData.map(loc => {
      for (const key in gutter) {
        if (gutter[key].getIntervalEnd() <= loc.getIntervalStart()) delete gutter[key]
      }
      let key = 0
      while (true) {
        if (gutter[key]) key++
        else {
          gutter[key] = loc
          break
        }
      }
      return <WaveRegion 
        setFocus={this.props.setFocus}
        wavesurfer={this.wavesurfer} 
        gutterDepth={key}
        key={loc.event.getId()}
        focused={this.props.focus?.getChild() === loc.getChild()}
        location={loc} 
      />})
    return annotations
  }

  render(props, state) {
    return <div id="media-view" 
      ref={this.mediaView}
      onPointerdown={this.handlePointerdown}
      onPointerup={this.cancelPointer}
      onPointerout={this.cancelPointer}
      data-media-is-video={this.isVideo}
    >
      { this.isVideo 
        ? <MediaViewVideo 
          ref={this.video}
          videoLocation={state.videoLocation}
          wavesurfer={this.wavesurfer}
          videoOverlay={this.videoOverlay}
          hasSelection={!!state.selection}
          createSelection={this.createSelection}
          clearSelection={this.clearSelection}
          videoElement={this.videoElement}
        /> 
        : null 
      }
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
      color: "rgba(0,0,0,0)"
    })
    this.region.element.style.setProperty('--user_solid', color)
    this.region.element.style.setProperty('--gutter_level', this.props.gutterDepth)
    if (this.props.focused) this.region.element.dataset.focused = true
    this.region.on("click", this.setFocus)
  }

  componentDidUpdate() {
    if (this.props.focused) this.region.element.dataset.focused = true
    else delete this.region.element.dataset.focused
    this.region.element.style.setProperty('--gutter_level', this.props.gutterDepth)
  }

  setFocus = e => {
    if (!this.props.focused) e.stopPropagation() //prevent a secondary seek
    this.props.setFocus(this.props.location)
  }

  componentWillUnmount() {
    this.region.remove()
  }

  render() { }
}

class MediaViewVideo extends Component {

  setOverlayPosition = e => {
    const time = this.props.wavesurfer.getCurrentTime()
    if (!this.props.hasSelection) this.props.createSelection(time, time + 1)
    const boundingRect = this.props.videoElement.current.getBoundingClientRect()
    const videoWidth = this.props.videoElement.current.videoWidth
    const videoHeight = this.props.videoElement.current.videoHeight
    const videoScale = boundingRect.width / videoWidth
    this.setState({ 
      initialPosition: new DOMRect(
        Math.min(videoWidth - ((100 / videoScale)), Math.round(e.offsetX / videoScale)),
        Math.min(videoHeight - ((100 / videoScale)), Math.round(e.offsetY / videoScale)),
        Math.round(100 / videoScale),
        Math.round(100 / videoScale) 
      )
    }) 
  }

  clearOverlayPosition = e => {
    if (e) e.noClear = true
    // we prevent any associated event from clearing the audio range selection
    this.setState({ initialPosition: null })
  }

  render(props, state) {
    return <div id="media-view-video">
      <div id="media-view-video-wrapper">
        <video onclick={this.setOverlayPosition} ref={props.videoElement} />
        {props.hasSelection
          ? state.initialPosition 
            ? <MediaViewVideoOverlay 
                mutable={true}
                ref={props.videoOverlay} 
                videoElement={props.videoElement} 
                clear={this.props.clearSelection} 
                initialPosition={state.initialPosition} 
            /> 
            : null
          : props.videoLocation?.getMediaRect() 
          ? <MediaViewVideoOverlay 
              mutable={false}
              ref={props.videoOverlay} 
              videoElement={props.videoElement} 
              initialPosition={props.videoLocation.getMediaRect()} 
          /> 
          : props.videoOverlay.current = null
        }
      </div>
    </div>
  }
}

class MediaViewVideoOverlay extends Component {
  constructor(props) {
    super(props)
    this.spotlightScale = props.videoElement.current.getBoundingClientRect().width / props.videoElement.current.videoWidth
    this.spotlightWidth = props.initialPosition.width
    this.spotlightHeight = props.initialPosition.height
    this.spotlightX = props.initialPosition.x
    this.spotlightY = props.initialPosition.y
  }

  componentDidUpdate(prev) {
    // we want to upday only when we start selection or when we're not mutable
    // and the playback location changes
    if (prev.mutable !== this.props.mutable || !this.props.mutable) {
      this.spotlightWidth = this.props.initialPosition.width
      this.spotlightHeight = this.props.initialPosition.height
      this.spotlightX = this.props.initialPosition.x
      this.spotlightY = this.props.initialPosition.y
      this.overlay.current.style.setProperty("--spotlightX", `${this.spotlightX}px`)
      this.overlay.current.style.setProperty("--spotlightY", `${this.spotlightY}px`)
      this.overlay.current.style.setProperty("--spotlightWidth", `${this.spotlightWidth}px`)
      this.overlay.current.style.setProperty("--spotlightHeight", `${this.spotlightHeight}px`)
    }
  }

  componentDidMount () {
    this.resizeObserver = new ResizeObserver(this.handleVideoResize)
    this.resizeObserver.observe(this.props.videoElement.current)
  }

  componentWillUnmount () {
    this.resizeObserver.disconnect()
  }

  overlay = createRef()

  handleVideoResize = _ => {
    this.spotlightScale = this.props.videoElement.current.getBoundingClientRect().width / this.props.videoElement.current.videoWidth
    this.overlay.current.style.setProperty("--spotlightScale", `${this.spotlightScale}`)
  }

  handleDrag = e => {
    e.preventDefault()
    const videoWidth = this.props.videoElement.current.videoWidth
    const videoHeight = this.props.videoElement.current.videoHeight
    this.spotlightX = Math.round(Math.min(Math.max(0, this.initialX + ((e.clientX  - this.initialClientX) / this.spotlightScale)), videoWidth - this.spotlightWidth))
    this.spotlightY = Math.round(Math.min(Math.max(0, this.initialY + ((e.clientY  - this.initialClientY) / this.spotlightScale)), videoHeight - this.spotlightHeight))
    this.overlay.current.style.setProperty("--spotlightX", `${this.spotlightX}px`)
    this.overlay.current.style.setProperty("--spotlightY", `${this.spotlightY}px`)
  }

  handleResizeX = e => {
    e.preventDefault()
    const videoWidth = this.props.videoElement.current.videoWidth
    //the 40px minimum here accomodates the handles
    this.spotlightWidth = Math.round(Math.min(videoWidth - this.spotlightX, Math.max(40, this.initialWidth + ((e.clientX - this.initialClientX) / this.spotlightScale))))
    this.overlay.current.style.setProperty("--spotlightWidth", `${this.spotlightWidth}px`)
  }

  handleResizeY = e => {
    e.preventDefault()
    const videoHeight = this.props.videoElement.current.videoHeight
    //the 40px minimum here accomodates the handles
    this.spotlightHeight = Math.round(Math.min(videoHeight - this.spotlightY, Math.max(40, this.initialHeight + ((e.clientY - this.initialClientY) / this.spotlightScale))))
    this.overlay.current.style.setProperty("--spotlightHeight", `${this.spotlightHeight}px`)
  }

  startDrag = e => {
    e.preventDefault()
    this.initialX = this.spotlightX
    this.initialY = this.spotlightY
    this.initialClientX = e.clientX
    this.initialClientY = e.clientY
    this.overlay.current.setPointerCapture(e.pointerId)
    this.overlay.current.addEventListener('pointermove', this.handleDrag)
    this.overlay.current.addEventListener('pointerup', e2 => {
      delete this.initialX
      delete this.initialY
      delete this.initialClientX
      delete this.initialClientY
      this.overlay.current?.releasePointerCapture(e.pointerId)
      this.overlay.current?.removeEventListener('pointermove', this.handleDrag)
    })
  }

  startResizeX = e => {
    e.preventDefault()
    this.overlay.current.setPointerCapture(e.pointerId)
    this.initialWidth = this.spotlightWidth
    this.initialClientX = e.clientX
    this.overlay.current.addEventListener('pointermove', this.handleResizeX)
    this.overlay.current.addEventListener('pointerup', e2 => {
      delete this.initialWidth
      delete this.initialClientX
      this.overlay.current?.releasePointerCapture(e.pointerId)
      this.overlay.current?.removeEventListener('pointermove', this.handleResizeX)
    })
  }

  startResizeY = e => {
    e.preventDefault()
    this.overlay.current.setPointerCapture(e.pointerId)
    this.initialHeight = this.spotlightHeight
    this.initialClientY = e.clientY
    this.overlay.current.addEventListener('pointermove', this.handleResizeY)
    this.overlay.current.addEventListener('pointerup', e2 => {
      delete this.initialHeight
      delete this.initialClientY
      this.overlay.current?.releasePointerCapture(e.pointerId)
      this.overlay.current?.removeEventListener('pointermove', this.handleResizeY)
    })
  }

  render(props, state) {
    const styleVars = {
      "--spotlightX": `${this.spotlightX}px`,
      "--spotlightY": `${this.spotlightY}px`,
      "--spotlightWidth": `${this.spotlightWidth}px`,
      "--spotlightHeight": `${this.spotlightHeight}px`,
      "--spotlightScale": this.spotlightScale,
    }
    return <div id="media-view-video-overlay" 
      data-media-selection-mutable={props.mutable}
      style={styleVars}
      ref={this.overlay}>
      <div onpointerdown={props.mutable && props.clear} id="media-view-video-overlay-header"/>
      <div onpointerdown={props.mutable && props.clear} id="media-view-video-overlay-left"/>
      <div onpointerdown={props.mutable && this.startDrag} id="media-view-video-overlay-overlight"/>
      <div onpointerdown={props.mutable && this.startDrag} id="media-view-video-overlay-leftlight"/>
      <div onpointerdown={props.mutable && this.startResizeX} id="media-view-video-overlay-rightlight"/>
      <div onpointerdown={props.mutable && this.startResizeY} id="media-view-video-overlay-underlight"/>
      <div onpointerdown={props.mutable && this.startDrag} id="media-view-video-overlay-spotlight" />
      <div onpointerdown={props.mutable && props.clear} id="media-view-video-overlay-right"/>
      <div onpointerdown={props.mutable && props.clear} id="media-view-video-overlay-footer"/>
    </div>
  }
}
