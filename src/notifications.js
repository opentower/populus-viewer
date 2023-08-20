import { h, Component, createRef } from 'preact';
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import { TextMessage } from './message.js'
import { isUnread } from './utils/unread.js'
import { dateReducer } from './utils/temporal.js'
import Location from './utils/location.js'
import './styles/notifications.css'
import Client from './client.js'
import History from './history.js'
import * as Icons from './icons.js'

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
      <div id="scroll-done">Усі сповіщення завантажені</div>
    </div>
    : <div id="scroll-anchor">завантажуємо...</div>
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

  originResource = this.originRoom
    .getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
    .getStateEvents(Matrix.EventType.SpaceParent)[0]?.getStateKey()

  originAlias = this.originResource
    ? Client.client.getRoom(this.originResource)?.getCanonicalAlias()
    : null

  originAnnotation = this.originResource
    ? Client.client.getRoom(this.originResource)
      ?.getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
      .getStateEvents(Matrix.EventType.SpaceChild, this.originRoom.roomId)
    : null

  originLocation = this.originAnnotation ? new Location(this.originAnnotation) : null

  getTopic = _ => {
    switch (this.originLocation.getType()) {
      case "highlight" : return this.originLocation.getText()
      case "text" : return <span class="non-text-topic">{Icons.pin}<span> a section of page {this.originLocation.getPageIndex()}</span></span>
      case "media-fragment" : return <span class="non-text-topic">{Icons.headphones}<span>an interval from {this.originLocation.getIntervalStart()} to {this.originLocation.getIntervalEnd()}</span></span>
    }
  }

  handleClick = _ => {
    const origin = this.originLocation
    const alias = encodeURIComponent(this.originAlias.slice(1))
    const eventId = this.props.event.getId()
    console.log(origin.event.getId())
    switch (this.originLocation.getType()) {
      case "highlight" : History.push(`/${alias}/${origin.getPageIndex()}/${origin.getChild()}/${eventId}`); break
      case "text" : History.push(`/${alias}/${origin.getPageIndex()}/${origin.getChild()}/${eventId}`); break
      case "media-fragment" : History.push(`/${alias}/${this.originLocation.getIntervalStart()}/${origin.getChild()}/${eventId}`); break
      default : console.log(`unrecognized location type: ${JSON.stringify(this.originLocation)}`)
    }
  }

  render(props, state) {
    // can sometimes take a second for these to sync with newly joined rooms. We don't render in that case
    if (Client.client.getRoom(this.originResource) && this.originLocation) {
      return <div
        onclick={this.originAlias ? this.handleClick : null }
        class={state.unread ? "notification unread-notification" : "notification"}
        style={this.userColor.styleVariables}>
        { Client.client.getRoom(this.originResource)?.name
          ? <div class="discussion-intro">In <b>{Client.client.getRoom(this.originResource).name}</b>, discussing</div>
          : <div class="discussion-intro">Discussing</div>
        }
        <div class="discussion-topic">{this.getTopic()}</div>
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
