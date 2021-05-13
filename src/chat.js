import { h, Component } from 'preact';
import './styles/chat.css'
import * as Matrix from "matrix-js-sdk"
import { TextMessage, FileMessage, ImageMessage, VideoMessage } from './message.js'
import MessagePanel from './messagePanel.js'
import UserColor from './userColors.js'
import { serverRoot } from "./constants.js"

export default class Chat extends Component {
  constructor (props) {
    super(props)
    this.state = {
      typing: [],
      events: [],
      fullyScrolled: false
    }
    this.scrolledIdents = new Set()
    this.handleTimeline = this.handleTimeline.bind(this)
    this.handleTypingNotifications = this.handleTypingNotification.bind(this)
  }

  componentDidMount() {
    this.props.client.on("Room.timeline", this.handleTimeline)
    this.props.client.on("Room.redaction", this.handleTimeline)
    this.props.client.on("Room.localEchoUpdated", this.handleTimeline)
    this.props.client.on("RoomMember.typing", this.handleTypingNotification)
    this.props.client.joinRoom(this.props.focus.roomId).then(room =>
      this.setState({
        fullyScrolled: this.scrolledIdents.has(this.props.focus.roomId),
        events: room.getLiveTimeline().getEvents()
      }, _ => this.tryLoad(room))
    )
  }

  componentWillUnmount() {
    this.props.client.off("Room.timeline", this.handleTimeline)
    this.props.client.off("Room.redaction", this.handleTimeline)
    this.props.client.off("Room.localEchoUpdated", this.handleTimeline)
    this.props.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  // Room.timeline passes in more params
  handleTimeline = (event, room) => {
    if (this.props.focus && this.props.focus.roomId === event.getRoomId()) {
      this.setState({
        events: room.getLiveTimeline().getEvents()
      })
    }
  }

  handleTypingNotification = (event, member) => {
    if (member.roomId === this.props.focus.roomId) {
      // ^^^ we have to check the originating room in an odd way because
      // the roomId for the typing events isn't set for some reason,
      // maybe a bug in dendrite
      const myId = this.props.client.getUserId()
      const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
      this.setState({ typing: typingOtherThanMe })
    }
  }

  handleScroll = e => {
    this.tryLoadRoom()
    if (this.props.handleWidgetScroll) this.props.handleWidgetScroll(e)
  }

  tryLoad = (room) => {
    const anchor = document.getElementById("scroll-anchor")
    const chatPanel = document.getElementById("chat-panel")
    const newroom = this.props.client.getRoom(room.roomId) // we refresh the room to ensure that some state is loaded
    if (!newroom) setTimeout(_ => this.tryLoad(room), 100) // if not, we try again momentarily
    else if (anchor && chatPanel.getBoundingClientRect().top - 5 < anchor.getBoundingClientRect().top) {
      room = newroom // the initial empty room needs to be replaced by the room that has some loaded state
      this.props.client.scrollback(room)
      const prevState = room.getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
      if (!prevState.paginationToken && this.props.client.getRoom(room.roomId)) {
        this.scrolledIdents.add(room.roomId)
        this.setState({ fullyScrolled: true })
      }
      this.props.client.joinRoom(room.roomId).then(
        newroom => setTimeout(_ => this.tryLoad(newroom), 100)
      )
    }
  }

  tryLoadRoom = async () => {
    const room = await this.props.client.joinRoom(this.props.focus.roomId)
    this.tryLoad(room)
  }

  async resetFocus () {
    const room = await this.props.client.joinRoom(this.props.focus.roomId)
    this.setState({
      fullyScrolled: this.scrolledIdents.has(this.props.focus.roomId),
      events: room.getLiveTimeline().getEvents()
    }, _ => this.tryLoad(room))
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.focus !== this.props.focus) this.resetFocus()
  }

  render(props, state) {
    const reactions = {}
    // XXX need to be able to handle other message types
    const messages = state.events.filter(
      e => e.getType() === "m.room.message" &&
        (e.getContent().msgtype === "m.text" ||
        e.getContent().msgtype === "m.file" ||
        e.getContent().msgtype === "m.image" ||
        e.getContent().msgtype === "m.video" ||
        Object.keys(e.getContent()).length === 0
        )
    )
    let prev = null
    const messagedivs = messages.reduce((accumulator, event) => {
      if (!prev || prev.getSender() !== event.getSender()) {
        accumulator.push(
          <UserInfoMessage key={`${event.getId()}-userinfo`}
            username={event.getSender()}
            client={props.client}
            isMe={event.getSender() === props.client.getUserId()} />
        )
        prev = event
      }
      switch (event.getContent().msgtype) {
        case "m.text": {
          accumulator.push(
            <TextMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case "m.file": {
          accumulator.push(
            <FileMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case "m.image": {
          accumulator.push(
            <ImageMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case "m.video": {
          accumulator.push(
            <VideoMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case undefined: {
          if (prev.getSender() === event.getSender() &&
                      accumulator.length > 1 &&
                      accumulator[accumulator.length - 1].type === RedactedMessage) {
            accumulator[accumulator.length - 1].props.count = accumulator[accumulator.length - 1].props.count + 1
          } else {
            accumulator.push(<RedactedMessage count={1}
              key={event.getId()}
              username={event.getSender()}
              isMe={event.getSender() === props.client.getUserId()} />
            )
          }
          break;
        }
      }

      return accumulator
    }, [])
    // sort reactions by event reacted-to
    state.events.forEach(e => {
      if (e.getType() === "m.reaction") {
        if (reactions[e.getContent()["m.relates_to"].event_id]) reactions[e.getContent()["m.relates_to"].event_id].push(e)
        else reactions[e.getContent()["m.relates_to"].event_id] = [e]
      }
    })
    // the chat wrapper works around a nasty positioning bug in chrome - it
    // has height set, so that we don't need to set height on the flexbox element
    return (
      <div class={props.class} onscroll={this.handleScroll} id="chat-wrapper">
        <div id="chat-panel">
          <MessagePanel textarea={this.messageTextarea} client={props.client} focus={props.focus} />
          <div id="messages">
            {messagedivs}
            <TypingIndicator client={this.props.client} typing={this.state.typing} />
          </div>
          <Anchor focus={props.focus} fullyScrolled={state.fullyScrolled} />
        </div>
      </div>
    )
  }
}

class UserInfoMessage extends Component {
    displayName = this.props.client.getUser(this.props.username).displayName

    avatarUrl = this.props.client.getUser(this.props.username).avatarUrl

    avatarHttpURI = Matrix.getHttpUriForMxc(serverRoot, this.avatarUrl, 20, 20, "crop")

    userColor = new UserColor(this.props.username)

    render(props) {
      const theClass = props.isMe ? "user-info-message me" : "user-info-message"
      return <div class={theClass} style={this.userColor.styleVariables}>
        {this.avatarHttpURI ? <img src={this.avatarHttpURI} /> : null}
        <span>{this.displayName}</span>
      </div>
    }
}

class RedactedMessage extends Component {
  userColor = new UserColor(this.props.username)

  render(props) {
    return props.isMe
      ? <div class="redacted message me" style={this.userColor.styleVariables}>
        <div class="ident" />
        <div class="body">{props.count > 1 ? `${props.count} messages deleted` : "message deleted"}</div>
      </div>
      : <div class="redacted message" style={this.userColor.styleVariables}>
        <div class="ident" />
        <div class="body">{props.count > 1 ? `${props.count} messages deleted` : "message deleted"}</div>
      </div>
  }
}

function Anchor(props) {
  if (props.fullyScrolled) return <div id="scroll-done">All events loaded</div>
  return <div id="scroll-anchor">loading...</div>
}

function TypingIndicator(props) {
  const displayNames = props.typing.map(typer => props.client.getUser(typer).displayName)
  const howMany = displayNames.length
  if (howMany === 0) return <div class="typingIndicator">&nbsp;</div>
  else if (howMany === 1) return <div class="typingIndicator">{displayNames[0]} is typing</div>
  else if (howMany === 2) return <div class="typingIndicator">{displayNames[0]} and {displayNames[1]} are typing</div>
  return <div class="typingIndicator">several people are typing</div>
}
