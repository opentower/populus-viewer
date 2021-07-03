import { h } from 'preact'
import './styles/toast.css'
import * as Icons from './icons.js'

export default function Toast(props) {
  return props.toastVisible
    ? <div id="toast-popup">
      <div id="toast-content">
        <button id="dismiss-toast" onclick={props.hideToast}>
          {Icons.close}
        </button>
        {props.children}
      </div>
    </div>
    : null
}
