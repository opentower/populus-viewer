import Client from './client.js'
import { h, Component } from 'preact';
import { RoomColor } from './utils/colors.js'
import ToolTip from './utils/tooltip.js'
import * as Icons from './icons.js' 
import './styles/roomIcon.css'

export default class RoomIcon extends Component {
  constructor(props) {
    super(props)
    this.state = {
      joined: this.amJoined(),
      loaded: false,
      avatarUrl: props.avatarUrl
        ? Client.client.mxcUrlToHttp(props.avatarUrl, 35, 35, "crop")
        : null
    }
  }

  amJoined = _ => !!(Client.client.getRoom(this.props.roomId)?.getMyMembership() === "join")

  componentDidMount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom)
  }

  componentDidUnmount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom)
  }

  handleRoom = (e, r) => {
    if (e.roomId === this.props.roomId || r?.roomId === this.props.roomId) {
      if (e.getType() === "m.room.avatar") {
        this.setState({
          joined: this.amJoined(),
          avatarUrl: e.getContent().url
            ? Client.client.mxcUrlToHttp(e.getContent().url, 35, 35, "crop")
            : null
        })
      } else {
        clearTimeout(this.roomDebounceTimeout)
        this.roomDebounceTimeout = setTimeout(_ => {
          this.setState({ joined: this.amJoined() })
        })
      }
    }
  }

  handleClick = _ => this.state.joined
    ? (this.props.activeClick && this.props.activeClick(this.props.roomId, this.props.name))
    : (this.props.inactiveClick && this.props.inactiveClick(this.props.roomId, this.props.name))

  roomColor = new RoomColor(this.props.name)

  toolTipContent = `<h3>${this.props.name}</h3>${
    this.props.topic ? `<p>${this.props.topic}</p>` : ""}${
      this.props.numJoinedMembers ? `<span><svg
      xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24
      24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" class="feather
      feather-users"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
        /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87"
        /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>:
      ${this.props.numJoinedMembers}` : ""
    }`

  render(props, state) {
    return <ToolTip content={this.toolTipContent} placement="bottom-start" allowHTML={true} theme="info">
        <div onclick={this.handleClick}
        data-joined={state.joined}
        data-has-avatar={!!state.avatarUrl}
        class="room-icon"
        style={{
          cursor: state.joined
            ? (props.activeClick && "pointer")
            : (props.inactiveClick && "pointer"),
          width: props.size,
          height: props.size,
          lineHeight: `${props.size}px`,
          ...this.roomColor.styleVariables
        }}>
          { state.avatarUrl
            ? <img src={state.avatarUrl}
                style={{
                  width: props.size,
                  height: props.size
                }} />
            : props.name.slice(0, 1)
          }
        </div>
      </ToolTip>
  }
}

export function RoomIconPlaceholder(props) {
  return <div class="room-icon"
      data-joined
      data-placeholder
      style={{
        width: props.size,
        height: props.size,
        lineHeight: `${props.size}px`,
        "--room_light" : "var(--low-contrast-background)"
      }} />
}
