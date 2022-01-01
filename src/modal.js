import { h, Component } from 'preact'
import './styles/modal.css'
import * as Icons from './icons.js'

export default class Modal extends Component {
  constructor(props) {
    super(props)
    Modal.set = this.setContent
    Modal.hide = this.hideModal
  }

  hideModal = _ => this.setState({content: null})

  setContent = content => this.setState({content})

  render(_, state) {
    return state.content
      ? <div id="modalPopup">
        <div id="modalBackground" onclick={this.hideModal} />
        <div id="modalContent">
          <button id="dismissModal" onclick={this.hideModal}>
            {Icons.close}
          </button>
          {state.content}
        </div>
      </div>
      : null
  }
}
