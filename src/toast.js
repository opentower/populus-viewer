import { h, Component } from 'preact'
import './styles/toast.css'
import * as Icons from './icons.js'

export default class Toast extends Component {
  constructor(props) {
    super(props)
    Toast.hide = this.hideToast
    Toast.set = this.setContent
  }

  hideToast = _ => this.setState({content: null})

  setContent = content => this.setState({content})

  render (_, state) {
    return state.content
      ? <div id="toast-popup">
        <div id="toast-content">
          <button id="dismiss-toast" onclick={this.hideToast}>
            {Icons.close}
          </button>
          {state.content}
        </div>
      </div>
      : null
  }
}
