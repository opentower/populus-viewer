import { h, Component, createRef } from 'preact';
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import { TextMessage } from './message.js'
import { spaceParent, spaceChild, mscResourceData } from "./constants.js"
import { isUnread } from './utils/unread.js'
import { dateReducer } from './utils/dates.js'
import Location from './utils/location.js'
import './styles/notifications.css'
import Client from './client.js'
import History from './history.js'

export default class NotificationListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      events: [],
      invites: this.getInvites(),
      fullyLoaded: false
    }
    this.notificationPromise = this.loadNotificationWindow()
    this.handleScroll = this.handleScroll.bind(this)
  }

  scrollAnchor = createRef()

  componentDidMount() {
    document.addEventListener("scroll", this.handleScroll)
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom) // needed to update when creation event arrives
    Client.client.on("Room.timeline", this.handleTimeline) // this also handles redactions, although they have their own event.
    this.notificationPromise.then(this.updateEvents).then(this.tryBackfill)
  }

  componentWillUnmount() {
    document.removeEventListener("scroll", this.handleScroll)
    Client.client.off("Room", this.handleRoom)
    Client.client.off("RoomState.events", this.handleRoom)
    Client.client.off("Room.timeline", this.handleTimeline)
  }

  updateEvents = _ => this.setState({ events: this.notificationWindow.getEvents().reverse() })

  tryBackfill = _ => {
    const anchor = this.scrollAnchor.current.base
    if (!this.state.fullyLoaded && (window.innerHeight - anchor.getBoundingClientRect().top) > 0) {
      if (!this.notificationWindow.canPaginate(Matrix.EventTimeline.BACKWARDS)) {
        this.setState({ fullyLoaded: true })
      } else {
        this.notificationWindow.paginate(Matrix.EventTimeline.BACKWARDS, 10)
          .then(_ => setTimeout(_ => {
            this.setState({events: this.notificationWindow.getEvents().reverse()}, this.tryBackfill)
          }, 200))
      }
    }
  }

  handleTimeline = (_, room) => {
    if (!room) {
      this.notificationPromise
        .then(_ => this.notificationWindow.paginate(Matrix.EventTimeline.FORWARDS, 1, false))
        .then(this.updateEvents)
    }
  }

  handleRoom = _ => {
    clearTimeout(this.inviteDebounceTimeout)
    this.inviteDebounceTimeout = setTimeout(_ => {
      this.setState({ invites: this.getInvites() })
    }, 500)
  }

  handleScroll = _ => {
    clearTimeout(this.scrollDebounceTimeout)
    this.scrollDebounceTimeout = setTimeout(_ => { this.tryBackfill() }, 200)
  }

  async loadNotificationWindow () {
    this.notificationWindow = new Matrix.TimelineWindow(Client.client, Client.client.getNotifTimelineSet())
    await this.notificationWindow.load()
  }

  toMilestone = msg => <div class="notification-date-indicator">{msg}</div>

  toNotification = ev => {
    switch (ev.getContent().msgtype) {
      case "m.text" : return <TextNotification event={ev} key={ev.getId()} />
      default : return null
    }
  }

  getInvites() {
    const invites = Client.client.getVisibleRooms().filter(room => room.getMyMembership() === "invite")
    return invites
      .filter(room => room
        .getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS)
        .getStateEvents("m.room.create", "")
        ?.getContent()?.type === "m.space")
      .map(room => <InviteEntry handleRoom={this.handleRoom} key={room.roomId} room={room} />)
  }

  render(_props, state) {
    return <div id="notifications-listing">
      {state.invites}
      {dateReducer(state.events, this.toMilestone, this.toNotification)}
      <Anchor ref={this.scrollAnchor} fullyLoaded={state.fullyLoaded} />
    </div>
  }
}

function Anchor(props) {
  return props.fullyLoaded
    ? <div>
      <div id="scroll-done">All notifications loaded</div>
    </div>
    : <div id="scroll-anchor">loading...</div>
}

function TextNotification(props) {
  return <Notification event={props.event}>
    <TextMessage
      reactions={{}}
      displayOnly={true}
      event={props.event} />
  </Notification>
}

class Notification extends Component {
  constructor(props) {
    super(props)
    this.state = {
      unread: isUnread(props.event)
    }
    this.checkUnread = this.checkUnread.bind(this)
  }

  componentDidMount () {
    Client.client.on("Room.accountData", this.checkUnread)
    // State events might cause excessive rerendering, but we can optimize for that later
  }

  componentWillUnmount () {
    Client.client.off("Room.accountData", this.checkUnread)
  }

  checkUnread (_event, room) {
    if (room?.roomId === this.props.event.getRoomId()) {
      this.setState({unread: isUnread(this.props.event)})
    }
  }

  userColor = new UserColor(this.props.event.getSender())

  userDisplayName = Client.client.getUser(this.props.event.getSender()).displayName

  avatarUrl = Client.client.getUser(this.props.event.getSender()).avatarUrl

  avatarHttpURI = Client.client.getHttpUriForMxcFromHS(this.avatarUrl, 20, 20, "crop")

  originRoom = Client.client.getRoom(this.props.event.getRoomId())

  originPDF = this.originRoom
    .getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
    .getStateEvents(spaceParent)?.[0].getStateKey()

  originAlias = this.originPDF
    ? Client.client.getRoom(this.originPDF)?.getCanonicalAlias()
    : null

  originAnnotation = this.originPDF
    ? Client.client.getRoom(this.originPDF)
      ?.getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
      .getStateEvents(spaceChild, this.originRoom.roomId)
    : null

  originAnnotationRoom = this.originAnnotation
    ? Client.client.getRoom(this.originAnnotation.getStateKey())
    : null

  topic = this.originAnnotationRoom
    ? this.originAnnotationRoom.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents("m.room.topic", "")?.getContent().topic || ""
    : ""

  handleClick = _ => {
    const origin = new Location(this.originAnnotation)
    History.push(`/${encodeURIComponent(this.originAlias.slice(1))}/${origin.location.pageNumber}/${origin.getChild()}`)
  }

  render(props, state) {
    if (Client.client.getRoom(this.originPDF)) {
      return <div
        onclick={this.originAlias ? this.handleClick : null }
        class={state.unread ? "notification unread-notification" : "notification"}
        style={this.userColor.styleVariables}>
        { Client.client.getRoom(this.originPDF)?.name
          ? <div class="discussion-intro">In <b>{Client.client.getRoom(this.originPDF).name}</b>, discussing</div>
          : <div class="discussion-intro">Discussing</div>
        }
        <div class="discussion-topic">{this.topic}</div>
        <div class="notification-header">
          {this.avatarHttpURI ? <img src={this.avatarHttpURI} /> : null}
          <span class="sender">{this.userDisplayName}</span>
          &nbsp;said:
        </div>
        <div class="notification-contents">
          {props.children}
        </div>
      </div>
    }
    return <div
        class={state.unread ? "notification unread-notification" : "notification"}
        style={this.userColor.styleVariables}>
        <div class="notification-header">
          Notification from departed room
        </div>
      </div>
  }
}

class InviteEntry extends Component {
  accept = _ => {
    Client.client.joinRoom(this.props.room.roomId)
    setTimeout(this.props.handleRoom, 1000)
    // XXX the updates get grouped in such a way that the redraw misses the state
    // update that comes with the join. So we need to do a second update to the
    // room listing, here.
  }

  decline = _ => {
    Client.client.leave(this.props.room.roomId)
    setTimeout(this.props.handleRoom, 1000)
  }

  render(props) {
    // TODO We can also get the room avatar, we should use that.
    return <div class="invite-entry">
      <div class="invite-heading">
        You are invited to join the discussion {props.room.name}.
      </div>
      <div class="invite-buttons">
        <button class="styled-button" onclick={this.accept}>Accept</button>
        <button class="styled-button" onclick={this.decline}>Decline</button>
      </div>
    </div>
  }
}
