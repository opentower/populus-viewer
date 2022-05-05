import { h, Component } from 'preact'
import './styles/modal.css'
import * as Icons from './icons.js'

export default class Modal extends Component {
  constructor(props) {
    super(props)
    this.state = { content: null }
    Modal.set = this.setContent
    Modal.hide = this.hideModal
    Modal.isVisible = _ => this.state.content !== null
    Modal.getTitle = _ => this.state.title
  }

  hideModal = _ => {
    delete document.body.dataset.modalVisible
    this.setState({content: null, title: null})
  }

  setContent = (content, title, subtitle) => {
    document.body.dataset.modalVisible = true
    this.setState({content, title, subtitle})
  }

  //TODO: implement focus-trap to prevent focus from escaping modal
  render(_, state) {
    return state.content
      ? <div id="modal-popup">
        <div id="modal-background" onclick={this.hideModal} />
        <div role="dialog" aria-modal="true" id="modal-content">
          <div id="modal-header">
            <h3 id="modal-title">
              {state.title}
            </h3>
            <button id="dismiss-modal" onclick={this.hideModal}>
              {Icons.close}
            </button>
            {state.subtitle ? <span id="modal-subtitle">{state.subtitle}</span> : null}
          </div>
          {state.content}
        </div>
      </div>
      : null
  }
}
