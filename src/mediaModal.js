import { h, Component } from 'preact'
import './styles/mediaModal.css'
import * as Icons from './icons.js'

export default class MediaModal extends Component {
  constructor(props) {
    super(props)
    this.state = { content: null }
    MediaModal.set = this.setContent
    MediaModal.hide = this.hideMediaModal
    MediaModal.isVisible = _ => this.state.content !== null
  }

  hideMediaModal = _ => {
    delete document.body.dataset.modalVisible // prevents scrolling
    this.setState({content: null, url: null})
  }

  setContent = (content, url) => {
    document.body.dataset.modalVisible = true
    this.setState({content, url})
  }

  catchClick = e => e.stopPropagation()

  render(_, state) {
    return state.content
      ? <div id="media-modal">
          <div id="media-modal-background" onclick={this.hideMediaModal} />
          <button id="media-modal-close" onclick={this.hideMediaModal}>
            {Icons.close}
          </button>
          {state.url?
            <a id="media-modal-download" download target="_blank" href={state.url}>
              {Icons.download}
            </a>
            : null
          }
          <div id="media-modal-content">
            {state.content}
          </div>
        </div>
      : null
  }
}
