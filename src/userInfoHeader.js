import { h, Component } from 'preact';
import Client from './client.js'
import UserColor from './userColors.js'

export default class UserInfoHeader extends Component {
    displayName = Client.client.getUser(this.props.username).displayName

    avatarUrl = Client.client.getUser(this.props.username).avatarUrl

    avatarHttpURI = Client.client.getHttpUriForMxcFromHS(this.avatarUrl, 20, 20, "crop")

    userColor = new UserColor(this.props.username)

    render(props) {
      const theClass = props.isMe ? "user-info-message message-from-user" : "user-info-message"
      return <div class={theClass} style={this.userColor.styleVariables}>
        {this.avatarHttpURI ? <img src={this.avatarHttpURI} /> : null}
        <span>{this.displayName}</span>
      </div>
    }
}
