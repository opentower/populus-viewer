import { h, Fragment } from 'preact';
import Client from './client.js'
import Modal from './modal.js'

export default function ArchiveRoom(props) {
  return <>
    <p>
      Doing so will remove the collection from your main list, but you'll still
      be able to restore it using the "Add Collection" button.
    </p>
    <button onClick={() => {
      Client.client.setRoomTag(props.room.roomId, "m.lowpriority", {order: 0.5})
      Modal.hide()
    }} class="styled-button">Archive this room</button>
  </>
}
