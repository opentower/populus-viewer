import { h, Fragment, Component } from 'preact'
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

export function toastError (headline) {
  return e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">{headline}</h3>
      <div>Here's the error message:</div>
      <pre>{e.message}</pre>
    </Fragment>)
  }
}
