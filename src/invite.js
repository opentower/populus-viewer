import { h, Fragment, Component } from 'preact';
import UserPill from './userPill.js'
import Client from './client.js'
import Modal from './modal.js'

export default class Invite extends Component {
  constructor(props) {
    super(props)
    this.state = { invited: {} }
  }

  userBox = (user) => {
    return <div style={{ marginTop: "15px" }} onclick={_ => this.toggleInvited(user)} key={user.userId}>
      <input checked={this.state.invited[user.userId]} style={{ marginRight: "15px" }} type="checkbox" />
      <UserPill user={user} />
    </div>
  }

  toggleInvited(user) {
    if (this.state.invited[user.userId]) {
      this.setState(oldstate => {
        const newInvited = {...oldstate.invited}
        newInvited[user.userId] = false
        return { invited: newInvited }
      })
    } else {
      this.setState(oldstate => {
        const newInvited = {...oldstate.invited}
        newInvited[user.userId] = true
        return { invited: newInvited }
      })
    }
  }

  inviteSelected = _ => {
    for (const userId of Object.keys(this.state.invited)) {
      if (this.state.invited[userId]) {
        Client.client.invite(this.props.roomId, userId).catch(alert)
      }
    }
    Modal.hide()
  }

  render() {
    return <Fragment>
      <h3 id="modalHeader">Invite to Join:</h3>
      {Client.client.getUsers()
        .sort((u1, u2) => u1.displayName.toUpperCase() > u2.displayName.toUpperCase() ? 1 : -1)
        .map(this.userBox)
      }
      <div style={{ marginTop: "15px" }}>
        <button onClick={this.inviteSelected} class="styled-button">Invite</button>
      </div>
    </Fragment>
  }
}
