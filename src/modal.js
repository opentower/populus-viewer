import { h } from 'preact'
import './styles/modal.css'
import * as Icons from './icons.js'

export default function Modal(props) {
  return props.modalVisible
    ? <div id="modalPopup">
      <div id="modalBackground" onclick={props.hideModal} />
      <div id="modalContent">
        <button id="dismissModal" onclick={props.hideModal}>
          {Icons.close}
        </button>
        {props.children}
      </div>
    </div>
    : null
}
