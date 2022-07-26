import { h, Component } from 'preact';
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

  render(props, state) {
    const annotations = [{x:50,y:50,width:100,height:100}]
    return <div id="image-view">
      <img src={state.imageUrl} />
      <ImageOverlay 
        contentWidthPx={props.contentWidthPx}
        contentHeightPx={props.contentHeightPx}
      >
        {annotations}
      </ImageOverlay>
    </div>
  }
}

class ImageOverlay extends Component {
  render (props, state) {
    const outerPath = `M0 0 h${props.contentWidthPx} v${props.contentHeightPx} h-${props.contentWidthPx}z`
    const masks = props.children?.map(child => 
      <rect 
        x={child.x}
        y={child.y}
        width={child.width}
        height={child.height}/>
    )
    const rects = props.children?.map(child => 
      <rect
        ref={child.rectRef}
        mask="url(#mask)"
        class="image-annotation-rect"
        x={child.x} 
        y={child.y} 
        width={child.width}
        height={child.height}/>
    )
    return <svg id="image-overlay">
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
