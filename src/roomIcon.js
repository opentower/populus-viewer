import Client from './client.js'
import { h, Component } from 'preact';
import { RoomColor } from './utils/colors.js'
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

  joinRoom = _ => Client.client.joinRoom(this.props.roomId,
    { viaServers: this.props.via }
  )

  roomColor = new RoomColor(this.props.name)

  render(props, state) {
    return <div onclick={this.joinRoom}
      data-joined={state.joined}
      data-has-avatar={!!state.avatarUrl}
      class="room-icon"
      style={{
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
  }
}
