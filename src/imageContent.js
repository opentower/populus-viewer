import { h, createRef, Fragment, Component } from 'preact';
import Resource from './utils/resource.js'
import Location from './utils/location.js'
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { onlineOrAlert } from "./utils/alerts.js"
import './styles/imageContent.css'
import { mscLocation, mscMediaFragment, populusHighlight } from "./constants.js"

export default class ImageContent extends Component {

  static ImageStore = {}

  componentDidMount() { 
    this.fetchImage() 
  }

  async fetchImage () {
    const theImage = new Resource(this.props.room)
    if (!ImageContent.ImageStore[theImage.url]) {
      ImageContent.ImageStore[theImage.url] = window.fetch(theImage.httpUrl)
        .then(async response => {
          const theClone = response.clone()
          const contentLength = +response.headers.get('Content-Length')
          const reader = response.body.getReader()
          let accumulator = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) { break }
            accumulator = accumulator + value.length
            this.props.setImageLoadingStatus(accumulator / contentLength)
          }
          const blob = await theClone.blob()
          return URL.createObjectURL(blob)
        })
        .catch(this.catchFetchImageError)
    } else { console.log(`found file for ${this.props.room.name} in store` ) }
    ImageContent.ImageStore[theImage.url].then(url => this.props.resource.resolveFetch(url))
    ImageContent.ImageStore[theImage.url].then(this.drawImage)
    // TODO: this throws an error when the user exits the page before the media
    // has been drawn. it should be caught, similarly for PDF fetching
  }

  drawImage = imageUrl => {
    const theImage = new Image()
    theImage.src = imageUrl
    theImage.onload = _ => {
      this.props.setContentDimensions(theImage.height, theImage.width)
      const widthRatio = this.props.contentContainer.current.offsetWidth / theImage.width
      if (widthRatio < 1) this.props.setZoom(_ => widthRatio)
      this.setState({imageUrl})
    }
  }

  hasSelection() { return !!this.state.selection }

  createSelection = e => {
    if (this.longPressTimeout) return
    const initialOffsetX = e.offsetX
    const initialOffsetY = e.offsetY
    // Firefox doesn't keep the offsets of the pointer event around, for some
    // reason, so we store them here.
    this.longPressTimeout = setTimeout(_ => {
      this.setState({
        selection: new ImageAnnotation({
          x: Math.round(initialOffsetX), 
          y: Math.round(initialOffsetY), 
          h:100, 
          w:100,
          imageWidth: this.props.contentWidthPx,
          imageHeight: this.props.contentHeightPx,
        })
      }, _ => document.dispatchEvent(new Event("selectionchange")))
    }, 500)
  }

  handlePointerCancel = _ => {
    clearTimeout(this.longPressTimeout)
    delete this.longPressTimeout
  }

  clearSelection = _ => {
    this.setState({
      selection: null
    }, _ => document.dispatchEvent(new Event("selectionchange")))
    // XXX If the clear is the result of a two-finger zoom gesture, this
    // prevents the second finger from triggering a new selection
    this.longPressTimeout = setTimeout(_ => { })
  }

  generateLocation = _ => {
    return {
      [mscMediaFragment]: {
          x: this.state.selection.x,
          y: this.state.selection.y,
          w: this.state.selection.w,
          h: this.state.selection.h
      },
      [populusHighlight]: {
        activityStatus: "pending",
        creator: Client.client.getUserId()
      }
    }
  }

  get zoomMin () { 
    if (!this.props.contentWidthPx) return 0
    return Math.min(
      1, 
      this.props.contentContainer.current.offsetWidth / this.props.contentWidthPx, 
      this.props.contentContainer.current.offsetHeight / this.props.contentHeightPx 
    )
  }

  zoomMax = 10

  commitRegion = _ => {
    if (!onlineOrAlert()) return
    const theDomain = Client.client.getDomain()
    const theRoomState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theLevels = theRoomState.getStateEvents(Matrix.EventType.RoomPowerLevels, "")
    const locationData = this.generateLocation()
    return Client.client.createRoom({
      visibility: "private",
      name: `обрана частина зображення ${this.state.selection.x},${this.state.selection.y}`,
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

  getAnnotations() {
    return this.props.filteredAnnotationContents.map(loc => {
      return new ImageAnnotation({
        location: loc,
        // we pass in focus so that it will be recalculated with renders
        focused: loc.getChild() === this.props.focus?.getChild(),
        imageWidth: this.props.contentWidthPx,
        imageHeight: this.props.contentHeightPx,
        setFocus: this.props.setFocus
      })
    })
  }

  render(props, state) {
    if (!props.contentWidthPx) return
    return <div id="image-view-wrapper">
      <div 
        data-image-selecting={!!state.selection}
        id="image-view" >
        <img src={state.imageUrl} />
        <ImageOverlay 
          focus={props.focus}
          handlePointerCancel={this.handlePointerCancel}
          handlePointerDown={state.selection ? this.clearSelection : this.createSelection}
          contentWidthPx={props.contentWidthPx}
          contentHeightPx={props.contentHeightPx}
        >{this.state.selection 
          ? this.state.selection 
          : this.getAnnotations()
        }
        </ImageOverlay>
      </div>
    </div>
  }
}

// XXX We don't use a component here since this should control two different
// <rect>s that need to appear in different places
class ImageAnnotation {
  constructor({x,y,h,w, location, focused, setFocus, imageHeight, imageWidth}) {
    const rect = location?.getMediaRect()
    this.x = rect?.x || x
    this.y = rect?.y || y
    this.h = rect?.height || h
    this.w = rect?.width || w
    this.location = location
    this.imageHeight = imageHeight
    this.selection = !location
    this.setFocus = setFocus
    this.imageWidth = imageWidth
    this.focused = focused
    this.maskRef = createRef()
    this.rectRef = createRef()
    this.rectResizeHRef = createRef()
    this.rectResizeWRef = createRef()
    this.key = Date.now()
  }

  focusAnnotation = e => {
    e.stopPropagation() //prevent a secondary seek
    this.setFocus(this.location)
  }

  startDrag = e => {
    e.stopPropagation()
    if (this.initialPointer) return
    this.initialX = this.x
    this.initialY = this.y
    this.initialOffsetX = e.offsetX
    this.initialOffsetY = e.offsetY
    this.initialPointer = e.pointerId
    this.rectRef.current.setPointerCapture(e.pointerId)
    this.rectRef.current.addEventListener('pointermove', this.handleDrag)
    this.rectRef.current.addEventListener('pointerup', e => {
      if (e.pointerId !== this.initialPointer) return
      delete this.initialX
      delete this.initialY
      delete this.initialPointer
      delete this.initialOffsetX
      delete this.initialOffsetY
      this.rectRef.current?.releasePointerCapture(e.pointerId)
      this.rectRef.current?.removeEventListener('pointermove', this.handleDrag)
    })
  }

  handleDrag = e => {
    e.preventDefault()
    if (e.pointerId !== this.initialPointer) return
    this.x = Math.round(Math.min(Math.max(0, this.initialX + (e.offsetX- this.initialOffsetX )), this.imageWidth - this.w))
    this.y = Math.round(Math.min(Math.max(0, this.initialY + (e.offsetY  - this.initialOffsetY)), this.imageHeight - this.h))
    requestAnimationFrame(this.updateSizes)
  }

  updateSizes = _ => {
    this.rectRef.current.setAttribute("x", this.x)
    this.rectRef.current.setAttribute("y", this.y)
    this.rectRef.current.setAttribute("width", this.w - 20)
    this.rectRef.current.setAttribute("height", this.h - 20)
    this.maskRef.current.setAttribute("x", this.x)
    this.maskRef.current.setAttribute("y", this.y)
    this.maskRef.current.setAttribute("width", this.w)
    this.maskRef.current.setAttribute("height", this.h)
    this.rectResizeWRef.current.setAttribute("y", this.y)
    this.rectResizeWRef.current.setAttribute("x", this.x + this.w - 20)
    this.rectResizeWRef.current.setAttribute("height", this.h - 20)
    this.rectResizeHRef.current.setAttribute("x", this.x)
    this.rectResizeHRef.current.setAttribute("width", this.w)
    this.rectResizeHRef.current.setAttribute("y", this.y + this.h - 20)
  }

  startResizeW = e => {
    e.stopPropagation()
    if (this.initialPointer) return
    this.rectResizeWRef.current.setPointerCapture(e.pointerId)
    this.initialWidth = this.w
    this.initialOffsetX = e.offsetX
    this.initialPointer = e.pointerId
    this.rectResizeWRef.current.addEventListener('pointermove', this.handleResizeW)
    this.rectResizeWRef.current.addEventListener('pointerup', e => {
      if (e.pointerId !== this.initialPointer) return
      delete this.initialPointer
      delete this.initialWidth
      delete this.initialOffsetX
      this.rectResizeWRef.current?.releasePointerCapture(e.pointerId)
      this.rectResizeWRef.current?.removeEventListener('pointermove', this.handleResizeW)
    })
  }

  startResizeH = e => {
    e.stopPropagation()
    if (this.initialPointer) return
    this.rectResizeHRef.current.setPointerCapture(e.pointerId)
    this.initialHeight = this.h
    this.initialOffsetY = e.offsetY
    this.initialPointer = e.pointerId
    this.rectResizeHRef.current.addEventListener('pointermove', this.handleResizeH)
    this.rectResizeHRef.current.addEventListener('pointerup', _ => {
      if (e.pointerId !== this.initialPointer) return
      delete this.initialHeight
      delete this.initialOffsetY
      delete this.initialPointer
      this.rectResizeHRef.current?.releasePointerCapture(e.pointerId)
      this.rectResizeHRef.current?.removeEventListener('pointermove', this.handleResizeH)
    })
  }

  handleResizeW = e => {
    e.preventDefault()
    if (e.pointerId !== this.initialPointer) return
    //the 40px minimum here accomodates the handles
    this.w = Math.round(Math.min(this.imageWidth - this.x, Math.max(40, this.initialWidth + (e.offsetX - this.initialOffsetX))))
    this.updateSizes()
  }

  handleResizeH = e => {
    e.preventDefault()
    if (e.pointerId !== this.initialPointer) return
    //the 40px minimum here accomodates the handles
    this.h = Math.round(Math.min(this.imageHeight - this.y, Math.max(40, this.initialHeight + (e.offsetY - this.initialOffsetY))))
    this.updateSizes()
  }
}

class ImageOverlay extends Component {

  getMasks = _ => this.props.children?.map(this.toMask)

  componentDidUpdate(prevProps) {
    if (prevProps.focus?.getChild() !== this.props.focus?.getChild()) {
      this.focusedRect?.current?.scrollIntoView({block:"center", inline:"center"})
    }
  }

  toMask = child => <rect 
      key={child.key}
      ref={child.maskRef}
      x={child.x}
      y={child.y}
      width={child.w}
      height={child.h}
    />

  getRects = _ => this.props.children?.map(this.toRect)

  toRect = child => {
    if (child.focused) this.focusedRect = child.rectRef
    return <rect
      key={child.key + 1}
      ref={child.rectRef}
      mask="url(#mask)"
      onpointerdown={child.focusAnnotation}
      class="image-annotation-rect"
      x={child.x} 
      y={child.y} 
      width={child.w}
      height={child.h}
      data-annotation-focused={child.focused}
    />
  }

  toSelection = child => <Fragment>
    <rect
      key={child.key + 2}
      ref={child.rectRef}
      mask="url(#mask)"
      class="image-annotation-rect-drag"
      x={child.x} 
      y={child.y} 
      onpointerdown={child.startDrag}
      width={child.w - 20}
      height={child.h - 20}
    />
    <rect
      key={child.key + 3}
      ref={child.rectResizeWRef}
      mask="url(#mask)"
      class="image-annotation-rect-resize-w"
      x={child.x + child.w - 20} 
      y={child.y}
      onpointerdown={child.startResizeW}
      width={20}
      height={child.h - 20}
    />
    <rect
      key={child.key + 4}
      ref={child.rectResizeHRef}
      mask="url(#mask)"
      class="image-annotation-rect-resize-h"
      x={child.x} 
      y={child.y + child.h - 20}
      onpointerdown={child.startResizeH}
      width={child.w}
      height={20}
    />
  </Fragment>

  render (props, state) {
    const outerPath = `M0 0 h${props.contentWidthPx} v${props.contentHeightPx} h-${props.contentWidthPx}z`
    return <svg 
      onPointerCancel={props.handlePointerCancel}
      onPointerUp={props.handlePointerCancel}
      onPointerDown={props.handlePointerDown} 
      id="image-overlay">
      <defs>
        <mask id="mask">
          <path fill="white" d={outerPath}/>
          { props.children?.selection
            ? this.toMask(props.children)
            : this.getMasks()
          }
        </mask>
      </defs>
      <path mask="url(#mask)" fill="black" d={outerPath}/>
      { props.children?.selection
        ? this.toSelection(props.children)
        : this.getRects()
      }
    </svg>
  }
}
