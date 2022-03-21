import { h, Component, Fragment } from 'preact';
import Client from './client.js'
import Modal from './modal.js'

export default class LeaveRoom extends Component {
  leaveRoom = async _ => {
    await Client.client.leave(this.props.room.roomId)
    Modal.hide()
  }

  forgetRoom = async _ => {
    await Client.client.leave(this.props.room.roomId)
    await Client.client.forget(this.props.room.roomId)
    Modal.hide()
  }

  render(props) {
    return <Fragment>
      <h3 id="modalHeader">Leave {props.room.name}?</h3>
      <p>
        To stop receiving updates about this room, and remove it from your room listing:</p>
      <button onClick={this.leaveRoom} class="styled-button">Leave This Room</button>
      <p>
        To also removed all stored room history, and no longer see the room as
        an option to join or add to collections:
      </p>
      <button onClick={this.forgetRoom} class="styled-button">Forget This Room</button>
    </Fragment>
  }
}
