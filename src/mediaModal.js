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
    this.setState({content: null})
  }

  setContent = content => {
    document.body.dataset.modalVisible = true
    this.setState({content})
  }

  catchClick = e => e.stopPropagation()

  render(_, state) {
    return state.content
      ? <div id="media-modal">
          <div id="media-modal-background" onclick={this.hideMediaModal} />
          <button id="media-modal-close" onclick={this.hideMediaModal}>
            {Icons.close}
          </button>
          <div id="media-modal-content" onclick={this.hideMediaModal}>
            <div id="media-modal-content-tight-wrapper" onclick={this.catchClick}>
              {state.content}
            </div>
          </div>
        </div>
      : null
  }
}
