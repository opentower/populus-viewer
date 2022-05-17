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
import { mscLocation, mscMediaFragment, populusHighlight, spaceChild, spaceParent } from "./constants.js"

export default class MediaContent extends Component {
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
  }

  componentDidMount() { 
    this.fetchMedia() 
  }

  componentWillUnmount() { if (this.wavesurfer) this.wavesurfer.destroy() }

  componentDidUpdate(prev) {
    if (this.state.ready) {
      if (this.props.focus && this.props.focus?.getChild() !== prev.focus?.getChild() ) {
        // focusing new annotation: jump to that 
        const duration = this.wavesurfer.getDuration()
        this.wavesurfer.seekAndCenter(this.props.focus.getIntervalStart() / (duration * 1000))
      }
      if (this.props.secondaryFocus && this.props.secondaryFocus?.getIntervalStart() !== prev.secondaryFocus?.getIntervalStart() ) {
        // focusing new annotation message: jump to that 
        const duration = this.wavesurfer.getDuration()
        this.wavesurfer.seekAndCenter(this.props.secondaryFocus.getIntervalStart() / (duration * 1000))
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
    })
    this.setState({ selection }, _ => document.dispatchEvent(new Event("selectionchange")))
  }

  clearSelection = _ => {
    if (this.state.selection) {
      this.state.selection.remove()
      this.setState({selection: null}, _ => document.dispatchEvent(new Event("selectionchange")))
    }
  }

  generateLocation = _ => {
    return {
      [mscMediaFragment]: {
        start: Math.floor(this.state.selection.start * 1000),
        end: Math.floor(this.state.selection.end * 1000),
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
    const theLevels = theRoomState.getStateEvents("m.room.power_levels")
    const locationData = this.generateLocation()
    return Client.client.createRoom({
      visibility: "private",
      name: `highlighted interval from ${this.state.selection.start} to ${this.state.selection.end}`,
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
      this.props.setFocus(new Location(fakeEvent))
      this.props.showChat()
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
      if (e.noClear || this.video.current?.base.contains(e.target)) return
      clearTimeout(this.longPressTimeout)
      this.clearSelection()
    } 
  }

  cancelPointer = _ => clearTimeout(this.longPressTimeout)

  static Store = {}

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
    this.wavesurfer.skip(1 * this.rightInertia)
    this.leftInertia = 1
    this.rightInertia += .1
    this.inertiaTimeout = setTimeout(this.resetInertia, 500)
  }

  scrubLeft = _ => {
    clearTimeout(this.inertiaTimeout)
    this.wavesurfer.skip(-1 * this.leftInertia)
    this.rightInertia = 1
    this.leftInertia += .1
    this.inertiaTimeout = setTimeout(this.resetInertia, 500)
  }

  resetInertia = _ => {
    this.leftInertia = 1
    this.rightInertia = 1
  }

  selRight = _ => {
    if (this.state.selection) {
      clearTimeout(this.inertiaTimeout)
      this.state.selection.onResize(.2 * this.rightInertia) 
      this.wavesurfer.seekAndCenter(this.state.selection.end / this.wavesurfer.getDuration())
      this.leftInertia = 1
      this.rightInertia += .1
      this.inertiaTimeout = setTimeout(this.resetInertia, 500)
    }
    else this.scrubRight()
  }

  selLeft = _ => {
    if (this.state.selection) {
      clearTimeout(this.inertiaTimeout)
      this.state.selection.onResize(-.2 * this.leftInertia) 
      this.wavesurfer.seekAndCenter(this.state.selection.end / this.wavesurfer.getDuration())
      this.rightInertia = 1
      this.leftInertia += .1
      this.inertiaTimeout = setTimeout(this.resetInertia, 500)
    }
    else this.scrubLeft()
  }

  catchFetchMediaError = e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">Couldn't fetch the {this.isVideo ? "audio file" : "video"}...</h3>
      <div>Tried to fetch: </div>
      <pre>{this.props.resourceAlias}</pre>
      <div>Here's the error message:</div>
      <pre>{e.message}</pre>
    </Fragment>)
    History.push('/')
    this.errorCondition = true
  }

  async fetchMedia () {
    const theMedia = new Resource(this.props.room)
    if (!MediaContent.Store[theMedia.url]) {
      MediaContent.Store[theMedia.url] = window.fetch(theMedia.httpUrl)
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
          return theClone.blob()
        })
        .catch(this.catchFetchMediaError)
    } else { console.log(`found file for ${this.props.room.name} in store` ) }
    if (this.isVideo) this.props.setMobileButtonColor("var(--contrast-text)")
    if (this.errorCondition) return
    MediaContent.Store[theMedia.url].then(this.drawMedia)
    // TODO: this throws an error when the user exits the page before the media
    // has been drawn. it should be caught, similarly for PDF fetching
  }

  drawMedia = media => {
    this.props.setMediaLoadingStatus("Rendering waveform...")
    this.wavesurfer = new WaveSurfer.create({
      container: '#waveform',
      backend: 'MediaElement',
      barWidth: 5,
      scrollParent: true,
      plugins: [ Regions.create() ],
    })
    this.pcm = []
    const prng = mulberry32(hashString(this.props.resourceAlias))
    const objectUrl = URL.createObjectURL(media)
    if (this.isVideo) this.videoElement.current.src = objectUrl
    for (let i = 0; i < 2048; i++) this.pcm.push((prng() * 2) - 1)
    this.wavesurfer.load(this.videoElement.current || URL.createObjectURL(media), this.pcm) // URL indirection here so that we can eventually prerender
    this.wavesurfer.on('ready', _ => {
      this.props.setMediaLoadingStatus(null)
      const width = document.body.clientWidth
      const height = document.body.clientHeight
      const duration = Math.ceil(this.wavesurfer.getDuration())
      this.props.setMediaDuration(Math.ceil(this.wavesurfer.getDuration()))
      if (this.props.timeStamp) this.wavesurfer.seekAndCenter(this.props.timeStamp / duration)
      this.props.setContentDimensions(height,width)
      this.setState({ready: true})
    });
    this.wavesurfer.on('seek', _ => {
      if (this.state.ready) {
        clearTimeout(this.seekTimeout)
        this.seekTimeout = setTimeout(_ => {
          const timeSec = Math.floor(this.wavesurfer.getCurrentTime())
          const focus = this.props.roomFocused
          if (focus) History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${timeSec}/${focus}`)
          else History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${timeSec}/`)
        }, 250)
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

  filterAnnotations = loc => loc.getType() === "media-fragment"

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
          location={props.focus}
          videoOverlay={this.videoOverlay}
          hasSelection={!!state.selection}
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
      color
    })
    if (this.props.focused) this.region.element.dataset.focused = true
    this.region.on("click", this.setFocus)
  }

  componentDidUpdate() {
    if (this.props.focused) this.region.element.dataset.focused = true
    else delete this.region.element.dataset.focused
  }

  setFocus = e => {
    if (!this.props.focused) {
      e.stopPropagation() //prevent a secondary seek
      this.props.setFocus(this.props.location)
    }
  }

  componentWillUnmount() {
    this.region.remove()
  }

  render() { }
}

class MediaViewVideo extends Component {

  setOverlayPosition = e => this.props.hasSelection 
    ? this.setState({ initialPosition: new DOMRect(e.offsetX, e.offsetY, 50, 50) }) 
    : null

  clearOverlayPosition = e => {
    e.noClear = true // we prevent the event from clearing the audio range selection
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
                clear={this.clearOverlayPosition} 
                initialPosition={state.initialPosition} 
            /> 
            : null
          : props.location?.getMediaRect() 
          ? <MediaViewVideoOverlay 
              mutable={false}
              ref={props.videoOverlay} 
              videoElement={props.videoElement} 
              initialPosition={props.location.getMediaRect()} 
          /> 
          : null
        }
      </div>
    </div>
  }
}

class MediaViewVideoOverlay extends Component {
  constructor(props) {
    super(props)
    this.spotlightWidth = props.initialPosition.width
    this.spotlightHeight = props.initialPosition.height
    this.spotlightX = props.initialPosition.x
    this.spotlightY = props.initialPosition.y
  }

  overlay = createRef()

  componentDidUpdate() {
    if (!this.props.mutable) {
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

  handleDrag = e => {
    e.preventDefault()
    const videoRect = this.props.videoElement.current.getBoundingClientRect()
    this.spotlightX = Math.min(Math.max(0, this.initialX + (e.clientX  - this.initialClientX)), videoRect.width - this.spotlightWidth - 40)
    this.spotlightY = Math.min(Math.max(0, this.initialY + (e.clientY  - this.initialClientY)), videoRect.height - this.spotlightHeight - 40)
    this.overlay.current.style.setProperty("--spotlightX", `${this.spotlightX}px`)
    this.overlay.current.style.setProperty("--spotlightY", `${this.spotlightY}px`)
  }

  handleResizeX = e => {
    e.preventDefault()
    const videoRect = this.props.videoElement.current.getBoundingClientRect()
    this.spotlightWidth = Math.min(videoRect.width- this.spotlightX - 40, Math.max(10, this.initialWidth + (e.clientX - this.initialClientX)))
    this.overlay.current.style.setProperty("--spotlightWidth", `${this.spotlightWidth}px`)
  }

  handleResizeY = e => {
    e.preventDefault()
    const videoRect = this.props.videoElement.current.getBoundingClientRect()
    this.spotlightHeight = Math.min(videoRect.height - this.spotlightY - 40, Math.max(10, this.initialHeight + (e.clientY - this.initialClientY)))
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
      "--spotlightHeight": `${this.spotlightHeight}px`
    }
    return <div id="media-view-video-overlay" style={styleVars} ref={this.overlay}>
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
