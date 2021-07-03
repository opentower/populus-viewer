import { h, Component, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { joinRule } from './constants.js';
import "./styles/roomSettings.css"

export default class RoomSettings extends Component {
  constructor(props) {
    super(props)
    const roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const currentJoinRule = roomState.getJoinRule()
    this.state = {
      joinRule: currentJoinRule
    }
  }

  handleJoinRuleChange = e => {
    this.setState({ joinRule: e.target.value })
  }

  handleSubmit = e => {
    e.preventDefault()
    const theContent = { join_rule: this.state.joinRule }
    Client.client.sendStateEvent(this.props.room.roomId, joinRule, theContent, "")
      .then(_ => this.props.populateModal(null))
      .catch(_ => alert("Something went wrong. You may not have permission to adjust some of these settings."))
  }

  render(props, state) {
    return <Fragment>
      <h3 id="modalHeader">Room Settings</h3>
      <form id="room-settings-form">
        <label htmlFor="joinRule">Join Rule:</label>
        <select value={state.joinRule} name="joinRule" onchange={this.handleJoinRuleChange}>
          <option value="private">Private</option>
          <option value="public">Public</option>
          <option value="invite">Invite-Only</option>
        </select>
        <div id="room-settings-join-info">
          {state.joinRule === "public"
            ? "anyone who can find the room may join"
            : state.joinRule === "invite"
              ? "an explicit invitation is required before joiing"
              : "no new members may join the room"
          }
        </div>
        <div id="room-settings-submit-wrapper">
          <button className="styled-button" onClick={this.handleSubmit} >Save Changes</button>
        </div>
      </form>
    </Fragment>
  }
}
