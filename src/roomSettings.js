import { h, Component, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { joinRule } from './constants.js';
import "./styles/roomSettings.css"

export default class RoomSettings extends Component {
  constructor(props) {
    super(props)
    const roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.initialJoinRule = roomState.getJoinRule()
    this.initialName = props.room.name
    this.initialVisibility = null
    this.state = {
      joinRule: this.initialJoinRule,
      roomName: this.initialName,
      visibility: null
    }
  }

  componentDidMount () {
    this.checkVisibility()
  }

  async checkVisibility () {
    const visibility = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialVisibility = visibility
    this.setState({visibility: visibility.visibility})
  }

  handleJoinRuleChange = e => {
    this.setState({ joinRule: e.target.value })
  }

  handleNameInput = e => {
    this.setState({ roomName: e.target.value })
  }

  handleKeydown = e => {
    e.stopPropagation() // don't go to global keypress handler
  }

  handleVisibilityChange = e => {
    this.setState({ visibility: e.target.value })
  }

  handleSubmit = async e => {
    e.preventDefault()
    const theContent = { join_rule: this.state.joinRule }
    const raiseErr = _ => alert("Something went wrong. You may not have permission to adjust some of these settings.")
    if (this.state.visibility !== this.initialVisibility) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.visibility).catch(raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) await Client.client.sendStateEvent(this.props.room.roomId, joinRule, theContent, "").catch(raiseErr)
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(raiseErr)
    this.props.populateModal(null)
  }

  cancel = e => {
    e.preventDefault()
    this.props.populateModal(null)
  }

  render(_, state) {
    if (state.visibility) {
      return <Fragment>
        <h3 id="modalHeader">Room Settings</h3>
        <form id="room-settings-form">
          <label htmlFor="visibilty">Visibility:</label>
          <select class="styled-input" value={state.visibility} name="joinRule" onchange={this.handleVisibilityChange}>
            <option value="private">Private</option>
            <option value="public">Publically Listed</option>
          </select>
          <div id="room-settings-visibility-info">
            {state.visibility === "public"
              ? "the room will appear in public listings"
              : "the room will be hidden from other users"
            }
          </div>
          <label htmlFor="joinRule">Join Rule:</label>
          <select class="styled-input" value={state.joinRule} name="joinRule" onchange={this.handleJoinRuleChange}>
            <option value="private">Private</option>
            <option value="public">Public</option>
            <option value="invite">Invite-Only</option>
          </select>
          <div id="room-settings-join-info">
            {state.joinRule === "public"
              ? "anyone who can find the room may join"
              : state.joinRule === "invite"
                ? "an explicit invitation is required before joining"
                : "no new members may join the room"
            }
          </div>
          <label htmlFor="room-name">Room Name</label>
          <input name="room-name"
            type="text"
            class="styled-input"
            value={state.roomName}
            onkeydown={this.handleKeydown}
            onInput={this.handleNameInput} />
          <div id="room-settings-submit-wrapper">
            <button className="styled-button" onClick={this.handleSubmit} >Save Changes</button>
            <button className="styled-button" onClick={this.cancel} >Cancel</button>
          </div>
        </form>
      </Fragment>
    }
    return <span id="settings-loading">loading...</span>
  }
}
