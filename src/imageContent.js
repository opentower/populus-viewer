import { h, createRef, Fragment, Component } from 'preact';
import Resource from './utils/resource.js'
import './styles/imageContent.css'

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
      this.setState({imageUrl})
    }
  }

  createSelection = e => {
    this.setState({
      selectionRect: new ImageAnnotation({
        x: e.offsetX, 
        y: e.offsetY, 
        h:100, 
        w:100,
        imageWidth: this.props.contentWidthPx,
        imageHeight: this.props.contentHeightPx,
        selection: true,
      })
    })
  }

  render(props, state) {
    return <div id="image-view">
      <img src={state.imageUrl} />
      <ImageOverlay 
        createSelection={this.createSelection}
        contentWidthPx={props.contentWidthPx}
        contentHeightPx={props.contentHeightPx}
      >{this.state.selectionRect ? this.state.selectionRect : null}
      </ImageOverlay>
    </div>
  }
}

class ImageAnnotation {
  constructor({x,y,h,w, imageHeight, imageWidth, selection}) {
    this.x = x 
    this.y = y
    this.h = h
    this.w = w
    this.imageHeight = imageHeight
    this.selection = selection
    this.imageWidth = imageWidth
    this.maskRef = createRef()
    this.rectRef = createRef()
    this.rectResizeHRef = createRef()
    this.rectResizeWRef = createRef()
    this.key = Date.now()
  }

  startDrag = e => {
    e.stopPropagation()
    this.initialX = this.x
    this.initialY = this.y
    this.initialOffsetX = e.offsetX
    this.initialOffsetY = e.offsetY
    this.rectRef.current.setPointerCapture(e.pointerId)
    this.rectRef.current.addEventListener('pointermove', this.handleDrag)
    this.rectRef.current.addEventListener('pointerup', _ => {
      delete this.initialX
      delete this.initialY
      delete this.initialOffsetX
      delete this.initialOffsetY
      this.rectRef.current?.releasePointerCapture(e.pointerId)
      this.rectRef.current?.removeEventListener('pointermove', this.handleDrag)
    })
  }

  handleDrag = e => {
    e.preventDefault()
    this.x = Math.round(Math.min(Math.max(0, this.initialX + (e.offsetX- this.initialOffsetX )), this.imageWidth - this.w))
    this.y = Math.round(Math.min(Math.max(0, this.initialY + (e.offsetY  - this.initialOffsetY)), this.imageHeight - this.h))
    this.updateSizes()
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
    this.rectResizeWRef.current.setPointerCapture(e.pointerId)
    this.initialWidth = this.w
    this.initialOffsetX = e.offsetX
    this.rectResizeWRef.current.addEventListener('pointermove', this.handleResizeW)
    this.rectResizeWRef.current.addEventListener('pointerup', _ => {
      delete this.initialWidth
      delete this.initialOffsetX
      this.rectResizeWRef.current?.releasePointerCapture(e.pointerId)
      this.rectResizeWRef.current?.removeEventListener('pointermove', this.handleResizeW)
    })
  }

  startResizeH = e => {
    e.stopPropagation()
    this.rectResizeHRef.current.setPointerCapture(e.pointerId)
    this.initialHeight = this.h
    this.initialOffsetY = e.offsetY
    this.rectResizeHRef.current.addEventListener('pointermove', this.handleResizeH)
    this.rectResizeHRef.current.addEventListener('pointerup', _ => {
      delete this.initialHeight
      delete this.initialOffsetY
      this.rectResizeHRef.current?.releasePointerCapture(e.pointerId)
      this.rectResizeHRef.current?.removeEventListener('pointermove', this.handleResizeH)
    })
  }

  handleResizeW = e => {
    e.preventDefault()
    //the 40px minimum here accomodates the handles
    this.w = Math.round(Math.min(this.imageWidth - this.x, Math.max(40, this.initialWidth + (e.offsetX - this.initialOffsetX))))
    this.updateSizes()
  }

  handleResizeH = e => {
    e.preventDefault()
    //the 40px minimum here accomodates the handles
    this.h = Math.round(Math.min(this.imageHeight - this.y, Math.max(40, this.initialHeight + (e.offsetY - this.initialOffsetY))))
    this.updateSizes()
  }
}

class ImageOverlay extends Component {
  getMasks = _ => this.props.children?.map(this.toMask)

  toMask = child => <rect 
      key={child.key}
      ref={child.maskRef}
      x={child.x}
      y={child.y}
      width={child.w}
      height={child.h}
    />

  getRects = _ => this.props.children?.map(this.toRect)

  toRect = child => <rect
      key={child.key + 1}
      ref={child.rectRef}
      mask="url(#mask)"
      class="image-annotation-rect"
      x={child.x} 
      y={child.y} 
      width={child.w}
      height={child.h}
    />

  toSelection = child => <Fragment>
    <rect
      key={child.key + 2}
      ref={child.rectRef}
      mask="url(#mask)"
      class="image-annotation-rect"
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
    return <svg onpointerdown={props.createSelection} id="image-overlay">
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
