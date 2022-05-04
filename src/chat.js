import { h, createRef, Fragment, Component } from 'preact';
import './styles/chat.css'
import * as Matrix from "matrix-js-sdk"
import { TextMessage, AnnotationMessage, EmoteMessage, NoticeMessage, FileMessage, ImageMessage, VideoMessage, AudioMessage } from './message.js'
import MessagePanel from './messagePanel.js'
import { UserColor } from './utils/colors.js'
import { toClockTime } from './utils/temporal.js'
import { mscMarkupMsgKey } from './constants.js'
import UserInfoHeader from './userInfoHeader.js'
import Client from './client.js'
import * as Icons from './icons.js'

export default class Chat extends Component {
  constructor (props) {
    super(props)
    this.state = {
      events: [],
      topic: "",
      fullyScrolled: false
    }
    this.scrolledIdents = new Set()
    this.handleTimeline = this.handleTimeline.bind(this)
    this.timelinePromise = this.loadTimelineWindow(props.focus.getChild())
  }

  componentDidMount() {
    Client.client.on("Room.timeline", this.handleTimeline) // this also handles redactions, although they have their own event.
    Client.client.on("Room.localEchoUpdated", this.updateEvents)
    this.timelinePromise.then(this.updateEvents).then(this.tryBackfill)
  }

  componentWillUnmount() {
    Client.client.off("Room.timeline", this.handleTimeline)
    Client.client.off("Room.localEchoUpdated", this.updateEvents)
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.focus.getChild() !== this.props.focus.getChild()) this.resetFocus()
  }

  chatWrapper = createRef()

  scrollAnchor = createRef()

  // Room.timeline passes in more params
  handleTimeline = (event) => {
    if (this.props.focus?.getChild() === event.getRoomId()) {
      this.timelinePromise
        .then(_ => this.timelineWindow.paginate(Matrix.EventTimeline.FORWARDS, 1, false))
        .then(this.updateEvents)
    }
  }

  handleScroll = _ => {
    clearTimeout(this.debounceTimeout)
    this.debounceTimeout = setTimeout(this.tryBackfill, 200)
  }

  tryBackfill = _ => {
    const anchor = this.scrollAnchor.current.base
    if (!this.state.fullyScrolled && this.chatWrapper.current.getBoundingClientRect().top - 5 < anchor.getBoundingClientRect().top) {
      if (!this.timelineWindow.canPaginate(Matrix.EventTimeline.BACKWARDS)) {
        this.scrolledIdents.add(this.room.roomId)
        this.setState({ fullyScrolled: true })
      } else {
        this.timelineWindow.paginate(Matrix.EventTimeline.BACKWARDS, 10)
          .then(_ => setTimeout(_ => {
            this.setState({events: this.timelineWindow.getEvents()}, this.tryBackfill)
          }, 200))
      }
    }
  }

  async loadTimelineWindow (roomId) {
    try {
      await Client.client.joinRoom(
        this.props.focus.getChild(),
        { viaServers: this.props.focus.getVia() }
      )
    } catch (err) {
      alert(err)
      this.props.unsetFocus()
      return
    }
    this.room = await Client.client.getRoomWithState(roomId)
    this.timelineWindow = new Matrix.TimelineWindow(Client.client, this.room.getUnfilteredTimelineSet())
    this.timelineWindow.load()
    return true
  }

  getTopic = _ => this.room.getLiveTimeline()
    .getState(Matrix.EventTimeline.FORWARDS)
    .getStateEvents("m.room.topic", "")
    ?.getContent().topic || ""

  updateEvents = _ => {
    this.setState({
      topic: this.getTopic(),
      events: this.timelineWindow.getEvents()
    }, this.updateReadReceipt)
  }

  async updateReadReceipt() {
    clearTimeout(this.updateReadReceiptDebounce)
    this.updateReadReceiptDebounce = setTimeout(_ => {
      const lastEvent = this.state.events[this.state.events.length - 1]
      if (lastEvent.getAssociatedStatus()) return // we bail out if the event hasn't been echoed yet.
      const lastEventId = lastEvent.getId()
      const currentReceiptId = this.room.getEventReadUpTo(Client.client.getUserId(), true)
      // fire if last read event is different from last event
      const differsFromLast = currentReceiptId !== lastEventId
      // and last event hasn't already had a receipt sent for it.
      const isUnsent = lastEventId !== this.lastReceiptSentId
      if (differsFromLast && isUnsent) {
        console.log("sending receipt")
        Client.client.setRoomReadMarkers(this.room.roomId, lastEventId, lastEvent, {}).catch(console.log)
        Client.client.sendReadReceipt(lastEvent, {}).then(_ => {
          // faster to zero these manually than waiting for the server
          this.room.setUnreadNotificationCount('total', 0);
          this.room.setUnreadNotificationCount('hightlight', 0);
          this.lastReceiptSentId = lastEventId
        }).catch(console.log)
      }
    }, 200)
  }

  async resetFocus () {
    this.timelinePromise = this.loadTimelineWindow(this.props.focus.getChild())
    await this.timelinePromise
    this.setState({
      topic: this.getTopic(),
      fullyScrolled: this.scrolledIdents.has(this.props.focus.getChild()),
      events: this.timelineWindow.getEvents()
    }, _ => {
      this.updateReadReceipt()
      this.tryBackfill()
    })
  }

  render(props, state) {
    const userMember = props.resource?.getMember(Client.client.getUserId())
    const canRedact = !!props.resource?.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
          .hasSufficientPowerLevelFor("redact", userMember.powerLevel)
    const reactions = {}
    // XXX need to be able to handle other message types
    const messages = state.events.filter(
      e => e.getType() === "m.room.message" &&
        (e.getContent().msgtype === "m.text" ||
        e.getContent().msgtype === "m.emote" ||
        e.getContent().msgtype === "m.notice" ||
        e.getContent().msgtype === "m.file" ||
        e.getContent().msgtype === "m.image" ||
        e.getContent().msgtype === "m.video" ||
        e.getContent().msgtype === "m.audio" ||
        Object.keys(e.getContent()).length === 0
        )
    )
    let prev = null
    const messagedivs = messages.reduce((accumulator, event) => {
      if (!prev || prev.getSender() !== event.getSender()) {
        accumulator.push(
          <UserInfoHeader key={`${event.getId()}-userinfo`}
            userId={event.getSender()}
            isMe={event.getSender() === Client.client.getUserId()} />
        )
        prev = event
      }
      switch (event.getContent().msgtype) {
        case "m.text": {
          accumulator.push(
            <TextMessage reactions={reactions}
              setFocus={props.setFocus}
              key={event.getId()}
              canRedact={canRedact}
              event={event} />
          )
          break;
        }
        case "m.notice": {
          accumulator.push(
            <NoticeMessage reactions={reactions}
              key={event.getId()}
              canRedact={canRedact}
              event={event} />
          )
          break;
        }
        case "m.file": {
          accumulator.push(
            <FileMessage reactions={reactions}
              key={event.getId()}
              canRedact={canRedact}
              event={event} />
          )
          break;
        }
        case "m.emote": {
          if (event.getContent()[mscMarkupMsgKey]) {
            accumulator.push(
              <AnnotationMessage reactions={reactions}
                resourceAlias={props.resourceAlias}
                secondaryFocus={props.secondaryFocus}
                setSecondaryFocus={props.setSecondaryFocus}
                key={event.getId()}
                canRedact={canRedact}
                event={event} />
            )
          } else {
            accumulator.push(
              <EmoteMessage reactions={reactions}
                key={event.getId()}
                canRedact={canRedact}
                event={event} />
            )
          }
          break;
        }
        case "m.image": {
          accumulator.push(
            <ImageMessage reactions={reactions}
              key={event.getId()}
              canRedact={canRedact}
              event={event} />
          )
          break;
        }
        case "m.video": {
          accumulator.push(
            <VideoMessage reactions={reactions}
              key={event.getId()}
              canRedact={canRedact}
              event={event} />
          )
          break;
        }
        case "m.audio": {
          accumulator.push(
            <AudioMessage reactions={reactions}
              key={event.getId()}
              canRedact={canRedact}
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
              isMe={event.getSender() === Client.client.getUserId()} />
            )
          }
          break;
        }
      }

      return accumulator
    }, [])
    // sort reactions by event reacted-to
    state.events.forEach(e => {
      if (e.getType() === "m.reaction" && e.getContent()?.["m.relates_to"]?.event_id) { // content might be redacted
        if (reactions[e.getContent()["m.relates_to"].event_id]) reactions[e.getContent()["m.relates_to"].event_id].push(e)
        else reactions[e.getContent()["m.relates_to"].event_id] = [e]
      }
    })

    // has height set, so that we don't need to set height on the flexbox element
    return <div ref={this.chatWrapper} class={props.class} onscroll={this.handleScroll} id="chat-wrapper">
      <div id="chat-panel">
        <MessagePanel
          hasSelection={props.hasSelection}
          generateLocation={props.generateLocation}
          resource={props.resource}
          focus={props.focus}
        />
        <div id="messages">
          {messagedivs}
          <TypingIndicator key={props.focus.getChild()} roomId={props.focus.getChild()} />
          {/* The key prop here ensures that typing state is reset when the room changes */}
        </div>
        <Anchor ref={this.scrollAnchor} focus={props.focus} topic={state.topic} fullyScrolled={state.fullyScrolled} />
      </div>
    </div>
  }
}

class RedactedMessage extends Component {
  userColor = new UserColor(this.props.username)

  render(props) {
    return props.isMe
      ? <div class="redacted message-frame message-from-user" style={this.userColor.styleVariables}>
        <div class="message-decoration" />
        <div class="message-body">{props.count > 1 ? `${props.count} messages deleted` : "message deleted"}</div>
      </div>
      : <div class="redacted message-frame" style={this.userColor.styleVariables}>
        <div class="message-decoration" />
        <div class="message-body">{props.count > 1 ? `${props.count} messages deleted` : "message deleted"}</div>
      </div>
  }
}

function Anchor(props) {
  return props.fullyScrolled
    ? <div>
      { props.focus.getType() === "highlight" && props.topic 
        ? <div id="anchor-quote">
          <span>{Icons.quote}</span>
          {props.topic}
        </div>
        : props.focus.getType() === "text"
        ? <div id="anchor-pin">
            {Icons.pin} <span>on page {props.focus.getPageIndex()}</span>
          </div>
        : props.focus.getType() === "audio-interval"
        ? <div id="anchor-audio">
            {Icons.headphones} <span>From {toClockTime(props.focus.getIntervalStart() / 1000)} to {toClockTime(props.focus.getIntervalEnd() / 1000)}</span>
          </div>
        : null
      }
      <div id="scroll-done">
        { props.focus.getStatus() === "pending"
          ? "Awaiting your comment..."
          : "All messages loaded"
        }
      </div>
    </div>
    : <div id="scroll-anchor">loading...</div>
}

class TypingIndicator extends Component {
  constructor(props) {
    super(props)
    this.handleTypingNotifications = this.handleTypingNotification.bind(this)
    this.state = { typing: [] }
  }

  componentDidMount() {
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentWillUnmount() {
    Client.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  handleTypingNotification = (event, member) => {
    if (member.roomId === this.props.roomId) {
      // ^^^ we have to check the originating room in an odd way because
      // the roomId for the typing events isn't set for some reason.
      const myId = Client.client.getUserId()
      const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
      this.setState({ typing: typingOtherThanMe })
    }
  }

  render(props, state) {
    const displayNames = state.typing.map(typer => Client.client.getUser(typer).displayName)
    const howMany = displayNames.length
    if (howMany === 0) return <div class="typing-indicator">&nbsp;</div>
    else if (howMany === 1) return <div class="typing-indicator">{displayNames[0]} is typing</div>
    else if (howMany === 2) return <div class="typing-indicator">{displayNames[0]} and {displayNames[1]} are typing</div>
    return <div class="typing-indicator">several people are typing</div>
  }
}
