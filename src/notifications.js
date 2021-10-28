import { h, Fragment, Component, createRef } from 'preact';
import * as Matrix from "matrix-js-sdk"
import * as Replies from './utils/replies.js'
import UserColor from './userColors.js'
import { TextMessage } from './message.js'
import { spaceParent, spaceChild, eventVersion } from "./constants.js"
import './styles/notifications.css'
import QueryParameters from './queryParams.js'
import Client from './client.js'

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

  render(props, state) {
    const initialDate = Date.now()
    let currentDate = initialDate
    const notifications = state.events.reduce((accumulator, ev) => {
      const age = initialDate - ev.getTs()
      const dateDelta = currentDate - ev.getTs()
      let message
      if (age < 300000 && dateDelta > 60000) {
        currentDate = ev.getTs()
        const minutes = Math.floor(age / 60000)
        const plural = minutes === 1 ? "" : "s"
        message = `${minutes} minute${plural} ago`
      } else if (age < 3600000 && dateDelta > 600000) {
        currentDate = ev.getTs()
        const minutes = Math.floor(age / 60000)
        const plural = minutes === 1 ? "" : "s"
        message = `${minutes} minute${plural} ago`
      } else if (age < 86400000 && dateDelta > 3600000) {
        currentDate = ev.getTs()
        const hours = Math.floor(age / 3600000)
        const plural = hours === 1 ? "" : "s"
        message = `${hours} hour${plural} ago`
      } else if (dateDelta > 86400000) {
        currentDate = ev.getTs()
        const dateObject = new Date(currentDate)
        message = `on ${dateObject.toLocaleDateString('en-US', {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        })}`
      }
      if (message) accumulator.push(<div class="notification-date-indicator">{message}</div>)
      switch (ev.getContent().msgtype) {
        case "m.text": {
          accumulator.push(<TextNotification pushHistory={props.pushHistory} event={ev} key={ev.getId()} />)
        }
      }
      return accumulator
    }, [])

    return <div class="notifications-wrapper">
      {notifications}
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
  return <Notification pushHistory={props.pushHistory} event={props.event}>
    <TextMessage
      reactions={{}}
      displayOnly={true}
      pushHistory={props.pushHistory}
      event={props.event} />
  </Notification>
}

class Notification extends Component {
  userColor = new UserColor(this.props.event.getSender())

  userDisplayName = Client.client.getUser(this.props.event.getSender()).displayName

  avatarUrl = Client.client.getUser(this.props.event.getSender()).avatarUrl

  avatarHttpURI = Client.client.getHttpUriForMxcFromHS(this.avatarUrl, 20, 20, "crop")

  originRoom = Client.client.getRoom(this.props.event.getRoomId())

  originPDF = this.originRoom
    .getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
    .getStateEvents(spaceParent)?.[0].getStateKey()

  originAlias = this.originPDF
    ? Client.client.getRoom(this.originPDF).getCanonicalAlias()
    : null

  originAnnotation = this.originPDF
    ? Client.client.getRoom(this.originPDF)
      .getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
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
    QueryParameters.set("focus", this.originAnnotation.getContent()[eventVersion].roomId)
    this.props.pushHistory({
      pdfFocused: this.originAlias,
      pageFocused: this.originAnnotation.getContent()[eventVersion].pageNumber
    })
  }

  render(props) {
    return <div
      onclick={this.originAlias ? this.handleClick : null }
      class="notification"
      style={this.userColor.styleVariables}>
      { Client.client.getRoom(this.originPDF).name
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
}
