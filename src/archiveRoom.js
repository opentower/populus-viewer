import { h, Fragment } from 'preact';
import Client from './client.js'
import Modal from './modal.js'

export default function ArchiveRoom(props) {
  return <>
    <p>Ви зараз видалите мед. книжку з вашого списку, але ви все одно
      зможете відновити її за допомогою кнопки "Додати мед. книжку"
    </p>
    <button onClick={() => {
      Client.client.setRoomTag(props.room.roomId, "m.lowpriority", {order: 0.5})
      Modal.hide()
    }} class="styled-button">Перенести  в архів</button>
  </>
}
