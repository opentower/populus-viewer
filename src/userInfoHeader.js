import { h, Component } from 'preact';
import Client from './client.js'
import { UserColor } from './utils/colors.js'

export default class UserInfoHeader extends Component {
    displayName = Client.client.getUser(this.props.userId).displayName

    avatarUrl = Client.client.getUser(this.props.userId).avatarUrl

    avatarHttpURI = Client.client.getHttpUriForMxcFromHS(this.avatarUrl, 20, 20, "crop")

    userColor = new UserColor(this.props.userId)

    theClass = this.props.isMe
      ? "user-info-message message-from-user"
      : this.props.isReply
        ? "reply-sender-info"
        : "user-info-message"

    render() {
      return <div class={this.theClass} style={this.userColor.styleVariables}>
        {this.avatarHttpURI ? <img src={this.avatarHttpURI} /> : null}
        <span>{this.displayName}</span>
      </div>
    }
}
