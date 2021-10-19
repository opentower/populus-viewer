import { h, Fragment, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import * as Replies from './utils/replies.js'
import UserColor from './userColors.js'
import { spaceParent, spaceChild, eventVersion } from "./constants.js"
import './styles/notifications.css'
import Client from './client.js'

export default class NotificationListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      events: [],
      fullyLoaded: false
    }
    this.notificationPromise = this.loadNotificationWindow()
  }

  componentDidMount() {
    Client.client.on("Room.timeline", this.handleTimeline) // this also handles redactions, although they have their own event.
    this.notificationPromise.then(this.updateEvents).then(this.tryBackfill)
  }

  componentWillUnmount() {
    Client.client.off("Room.timeline", this.handleTimeline)
  }

  updateEvents = _ => {
    this.setState({ events: this.notificationWindow.getEvents().reverse() })
  }

  tryBackfill = _ => {
    if (!this.state.fullyScrolled) {
      if (!this.notificationWindow.canPaginate(Matrix.EventTimeline.BACKWARDS)) {
        this.setState({ fullyScrolled: true })
      } else {
        this.notificationWindow.paginate(Matrix.EventTimeline.BACKWARDS, 10)
          .then(_ => setTimeout(_ => {
            this.setState({events: this.notificationWindow.getEvents().reverse()}, this.tryBackfill)
          }, 200))
      }
    }
  }

  handleTimeline = (event, room) => {
    if (!room) {
      this.notificationPromise
        .then(_ => this.notificationWindow.paginate(Matrix.EventTimeline.FORWARDS, 1, false))
        .then(this.updateEvents)
    }
  }

  async loadNotificationWindow () {
    this.notificationWindow = new Matrix.TimelineWindow(Client.client, Client.client.getNotifTimelineSet())
    await this.notificationWindow.load()
  }

  render(props, state) {
    const notifications = state.events.reduce((accumulator, ev) => {
      switch (ev.getContent().msgtype) {
        case "m.text": {
          accumulator.push(<TextNotification pushHistory={props.pushHistory} event={ev} key={ev.getId()} />)
        }
      }
      return accumulator
    }, [])

    return <div>{notifications}</div>
  }
}

class TextNotification extends Component {
  render(props) {
    const content = props.event.getContent()
    const isReply = Replies.isReply(content)
    return <Notification pushHistory={props.pushHistory} event={props.event}>
      <div class="notification-body text-notification">{isReply ? Replies.stripFallbackPlain(content.body) : content.body}</div>
    </Notification>
  }
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

  handleClick = _ => {
    this.props.pushHistory({
      pdfFocused: this.originAlias,
      pageFocused: this.originAnnotation.getContent()[eventVersion].pageNumber
    },
    null,
    {
      initialFocus: this.originAnnotation.getContent()[eventVersion]
    })
  }

  render(props) {
    return <div
      onclick={this.originAlias ? this.handleClick : null }
      class="notification"
      style={this.userColor.styleVariables}>
      <div class="notification-header">
        {this.avatarHttpURI ? <img src={this.avatarHttpURI} /> : null}
        <span>{this.userDisplayName}</span>
      </div>
      {props.children}
    </div>
  }
}
