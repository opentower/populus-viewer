import { h, createRef, Component } from 'preact';
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
      >{this.state.selectionRect ? [this.state.selectionRect] : null}
      </ImageOverlay>
    </div>
  }
}

class ImageAnnotation {
  constructor({x,y,h,w, imageHeight, imageWidth}) {
    this.x = x 
    this.y = y
    this.h = h
    this.w = w
    this.imageHeight = imageHeight
    this.imageWidth = imageWidth
    this.maskRef = createRef()
    this.rectRef = createRef()
  }

  onpointerdown = e => {
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
    this.rectRef.current.setAttribute("x", this.x)
    this.rectRef.current.setAttribute("y", this.y)
    this.maskRef.current.setAttribute("x", this.x)
    this.maskRef.current.setAttribute("y", this.y)
  }
}

class ImageOverlay extends Component {
  render (props, state) {
    const outerPath = `M0 0 h${props.contentWidthPx} v${props.contentHeightPx} h-${props.contentWidthPx}z`
    const masks = props.children?.map(child => 
      <rect 
        ref={child.maskRef}
        x={child.x}
        y={child.y}
        width={child.w}
        height={child.h}/>
    )
    const rects = props.children?.map(child => 
      <rect
        ref={child.rectRef}
        mask="url(#mask)"
        class="image-annotation-rect"
        x={child.x} 
        y={child.y} 
        onpointerdown={child.onpointerdown}
        width={child.w}
        height={child.h}/>
    )
    return <svg onpointerdown={props.createSelection} id="image-overlay">
      <defs>
        <mask id="mask">
          <path fill="white" d={outerPath}/>
          {masks}
        </mask>
      </defs>
      <path mask="url(#mask)" fill="black" d={outerPath}/>
      {rects}
    </svg>
  }
}
