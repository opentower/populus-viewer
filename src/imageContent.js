import { h, Component } from 'preact';
import Resource from './utils/resource.js'

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
    return <div id="image-view">
      <img src={state.imageUrl} />
    </div>
  }
}
