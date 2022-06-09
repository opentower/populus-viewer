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
import Toast from "./toast.js"
import History from "./history.js"
import * as Icons from './icons.js'

export default class Chat extends Component {
  constructor (props) {
    super(props)
    this.state = {
      events: [],
      topic: "",
      fullyScrolledUp: false,
      fullyScrolledDown: !props.eventFocused
    }
    this.handleTimeline = this.handleTimeline.bind(this)
  }

  componentDidMount() {
    Client.client.on("Room.timeline", this.handleTimeline) // this also handles redactions, although they have their own event.
    Client.client.on("Room.localEchoUpdated", this.updateEvents)
    this.prevScrollHeight = this.chatWrapper.current.scrollHeight
    this.resizeObserver.observe(this.chatPanel.current)
    this.resetFocus()
  }

  componentWillUnmount() {
    Client.client.off("Room.timeline", this.handleTimeline)
    Client.client.off("Room.localEchoUpdated", this.updateEvents)
    this.resizeObserver.disconnect()
  }

  async componentDidUpdate(prevProps) {
    if (
      prevProps.focus.getChild() !== this.props.focus.getChild() || 
      prevProps.eventFocused !== this.props.eventFocused) {
        this.resetFocus()
        //TODO: just scroll to event when focus doesn't change
    }
  }

  chatWrapper = createRef()

  chatPanel = createRef()

  scrollAnchorTop = createRef()

  scrollAnchorBottom = createRef()

  resizeObserver = new ResizeObserver(_ => {
    const chatWrapper = this.chatWrapper.current
    const heightDiff = chatWrapper.scrollHeight - this.prevScrollHeight
    if (this.elementFixed) this.elementFixed.scrollIntoView({block:"center"})
    else if (this.bottomFilling) chatWrapper.scrollTop = chatWrapper.scrollTop - heightDiff
    this.prevScrollHeight = chatWrapper.scrollHeight
  })

  // Room.timeline passes in more params
  handleTimeline = (event) => {
    if (this.props.focus?.getChild() === event.getRoomId() && this.state.fullyScrolledDown) {
      this.timelinePromise
        .then(_ => this.timelineWindow.paginate(Matrix.EventTimeline.FORWARDS, 1, false))
        .then(this.updateEvents)
    }
  }

  tryTopfill = _ => {
    this.topFilling = true
    if (!this.state.fullyScrolledUp && this.scrollAnchorTop.current.isVisible) {
      if (!this.timelineWindow.canPaginate(Matrix.EventTimeline.BACKWARDS)) {
        const indexExists = this.timelineWindow.getTimelineIndex(Matrix.EventTimeline.BACKWARDS)
        //if we can't paginate, we make sure that the timelineindex
        //has actually loaded, and if so we say we're done scrolling
        if (indexExists) this.setState({ fullyScrolledUp: true }, this.finishTopFill())
        else setTimeout(this.tryTopfill, 100)
      } else {
        this.timelineWindow.paginate(Matrix.EventTimeline.BACKWARDS, 10)
          .then(_ => setTimeout(_ => {
            this.setState({events: this.timelineWindow.getEvents()}, this.tryTopfill)
          }, 100))
      }
    } else this.finishTopFill()
  }

  finishTopFill = _ => {
    this.topFilling = false
    if (!this.bottomFilling) setTimeout(_ => delete this.elementFixed,250)
  }

  tryBottomfill = _ => {
    this.bottomFilling = true
    if (!this.state.fullyScrolledDown && this.scrollAnchorBottom.current.isVisible) {
      if (!this.timelineWindow.canPaginate(Matrix.EventTimeline.FORWARDS)) {
        //if we can't paginate, we make sure that the timelineindex
        //has actually loaded, and if so we say we're done scrolling
        const indexExists = this.timelineWindow.getTimelineIndex(Matrix.EventTimeline.FORWARDS)
        if (indexExists) this.setState({ fullyScrolledDown: true }, this.finishBottomFill)
        else setTimeout(this.tryBottomfill, 100)
      } else {
        this.timelineWindow.paginate(Matrix.EventTimeline.FORWARDS, 10)
          .then(_ => setTimeout(_ => {
            this.setState({events: this.timelineWindow.getEvents()}, this.tryBottomfill)
          }, 100))
      }
    } else this.finishBottomFill()
  }

  finishBottomFill = _ => {
    this.bottomFilling = false
    if (!this.topFilling) setTimeout(_ => delete this.elementFixed,250)
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
    return this.timelineWindow.load(this.props.eventFocused)
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
      if (!lastEvent) return // we bail out if the events haven't loaded
      if (lastEvent.getAssociatedStatus()) return // or if the event hasn't been echoed yet
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
          this.room.setUnreadNotificationCount('highlight', 0);
          this.lastReceiptSentId = lastEventId
        }).catch(console.log)
      }
    }, 200)
  }

  async resetFocus () {
    this.chatWrapper.current.scrollTop = 0
    this.timelinePromise = this.loadTimelineWindow(this.props.focus.getChild())
    try {
      await this.timelinePromise
      this.setState({
        fullyScrolledUp: false,
        fullyScrolledDown: false,
        topic: this.getTopic(),
        events: this.timelineWindow.getEvents()
      }, _ => {
        this.updateReadReceipt()
        this.prevScrollHeight = this.chatWrapper.current.scrollHeight
        this.elementFixed = document.getElementById(this.props.eventFocused)
        this.tryTopfill()
        this.tryBottomfill()
      })
    } catch (e) {
      switch(e.name) {
        case "M_NOT_FOUND" : return this.handleFocusNotFound(e)
        default : console.log(e)
      }
    }
  }

  handleFocusNotFound = e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">Something wasn't available</h3>
      <div>Here's the error message:</div>
      <pre>{e.message}</pre>
    </Fragment>)
    History.replace(`/${this.props.resourceAlias}/`)
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
              key={event.getId()}
              resourceAlias={props.resourceAlias}
              canRedact={canRedact}
              event={event} />
          )
          break;
        }
        case "m.notice": {
          accumulator.push(
            <NoticeMessage reactions={reactions}
              key={event.getId()}
              resourceAlias={props.resourceAlias}
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
    return <div ref={this.chatWrapper} class={props.class} id="chat-wrapper">
      <div ref={this.chatPanel} id="chat-panel">
        <Anchor ref={this.scrollAnchorBottom} 
          chatWrapper={this.chatWrapper}
          tryFill={this.tryBottomfill}
          fullyScrolled={state.fullyScrolledDown} >
            <MessagePanel
              hasSelection={props.hasSelection}
              generateLocation={props.generateLocation}
              resource={props.resource}
              focus={props.focus}
            />
        </Anchor>
        <div id="messages">
          {messagedivs}
          <TypingIndicator key={props.focus.getChild()} roomId={props.focus.getChild()} />
          {/* The key prop here ensures that typing state is reset when the room changes */}
        </div>
        <Anchor ref={this.scrollAnchorTop} 
          chatWrapper={this.chatWrapper}
          tryFill={this.tryTopfill}
          fullyScrolled={state.fullyScrolledUp} >
            <TopAnchor focus={props.focus} topic={state.topic}/>
        </Anchor>
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

class Anchor extends Component {

  componentDidMount() { 
    this.isVisible = true
    this.intersectionObserver.observe(this.scrollAnchorDiv.current) 
  }

  componentWillUnmount() { this.intersectionObserver.disconnect() }

  scrollAnchorDiv = createRef()

  intersectionObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { this.isVisible = true }
    else { this.isVisible = false }
    this.props.tryFill()
  }, { 
    root: this.props.chatWrapper.current,
  })

  render(props) {
    return <div ref={this.scrollAnchorDiv} id={props.fullyScrolled ? null : "scroll-anchor"}>
      {props.fullyScrolled
        ? props.children
        : "loading..."
      } 
    </div>
  }
}

function TopAnchor(props) {
  return <Fragment>
    { props.focus.getType() === "highlight" && props.topic 
      ? <div id="anchor-quote">
        <span>{Icons.quote}</span>
        {props.topic}
      </div>
      : props.focus.getType() === "text"
      ? <div id="anchor-pin">
          {Icons.pin} <span>on page {props.focus.getPageIndex()}</span>
        </div>
      : props.focus.getType() === "media-fragment"
      ? <div id="anchor-media">
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
  </Fragment>
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
