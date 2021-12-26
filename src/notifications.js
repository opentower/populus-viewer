import { h, Component, createRef } from 'preact';
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import { TextMessage } from './message.js'
import { spaceParent, spaceChild } from "./constants.js"
import { isUnread } from './utils/unread.js'
import { dateReducer } from './utils/dates.js'
import './styles/notifications.css'
import Client from './client.js'
import History from './history.js'

export default class NotificationListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      events: [],
      fullyLoaded: false
    }
    this.notificationPromise = this.loadNotificationWindow()
    this.handleScroll = this.handleScroll.bind(this)
  }

  scrollAnchor = createRef()

  componentDidMount() {
    document.addEventListener("scroll", this.handleScroll)
    Client.client.on("Room.timeline", this.handleTimeline) // this also handles redactions, although they have their own event.
    this.notificationPromise.then(this.updateEvents).then(this.tryBackfill)
  }

  componentWillUnmount() {
    document.removeEventListener("scroll", this.handleScroll)
    Client.client.off("Room.timeline", this.handleTimeline)
  }

  updateEvents = _ => {
    this.setState({ events: this.notificationWindow.getEvents().reverse() })
  }

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

  handleScroll = e => {
    clearTimeout(this.debounceTimeout)
    this.debounceTimeout = setTimeout(_ => {
      this.tryBackfill()
      if (this.props.handleWidgetScroll) this.props.handleWidgetScroll(e)
    }, 200)
  }

  async loadNotificationWindow () {
    this.notificationWindow = new Matrix.TimelineWindow(Client.client, Client.client.getNotifTimelineSet())
    await this.notificationWindow.load()
  }

  toMilestone = msg => <div class="notification-date-indicator">{msg}</div>

  toNotification = ev => {
    switch (ev.getContent().msgtype) {
      case "m.text" : return <TextNotification event={ev} key={ev.getId()} />
      default : null 
    }
  }

  render(props, state) {
    return <div class="notifications-wrapper">
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
    History.push(`/${encodeURIComponent(this.originAlias.slice(1))}/${origin.location.pageNumber}/${origin.event.getStateKey()}`)
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
