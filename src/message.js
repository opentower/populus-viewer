import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { renderLatexInElement } from './latex.js'
import { processRegex } from './processRegex.js'
import UserColor from './userColors.js'
import UserInfoHeader from './userInfoHeader.js'
import { sanitizeHtmlParams } from './constants.js'
import { processLinks } from './links.js'
import 'emoji-picker-element'
import Client from './client.js'
import * as Icons from './icons.js'
import * as Replies from './utils/replies.js'
import * as PopupMenu from './popUpMenu.js'
import './styles/message.css'

export class TextMessage extends Component {
  componentDidMount() {
    renderLatexInElement(this.messageBody.current)
    processLinks(this.messageBody.current)
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      renderLatexInElement(this.messageBody.current)
      processLinks(this.messageBody.current)
    }
  }

  messageBody = createRef()

  getEdits = () => {
    return this.props.reactions[this.props.event.getId()]
      ? this.props.reactions[this.props.event.getId()]
        .filter(event => event.getContent()["m.relates_to"].rel_type === "m.replace")
      : []
  }

  getCurrentEdit = () => {
    const edits = this.getEdits()
    // need to be smarter about ordering
    if (edits.length > 0) { return edits[edits.length - 1].getContent()["m.new_content"] }
    return this.props.event.getContent()
  }

  render(props) {
    const content = this.getCurrentEdit()
    const isReply = Replies.isReply(content)
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event}
      getCurrentEdit={this.getCurrentEdit}>
      <div ref={this.messageBody} class="message-body">
        {isReply ? <ReplyPreview reactions={props.reactions} event={props.event} /> : null}
        <DisplayContent content={content} />
      </div>
    </MessageFrame>
  }
}

export class NoticeMessage extends Component {
  componentDidMount() {
    renderLatexInElement(this.messageBody.current)
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      renderLatexInElement(this.messageBody.current)
    }
  }

  messageBody = createRef()

  noticeStyle = {
    "--user_ultralight": "hsl(0,0%, 95%)",
    "--user_light": "hsl(0,0%, 80%)",
    "--user_solid": "hsl(0,0%, 50%)",
    "--user_dark": "hsl(0,0%, 20%)"
  }

  render(props) {
    const content = props.event.getContent()
    const isReply = Replies.isReply(content)
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      styleOverride={this.noticeStyle}
      event={props.event}
      getCurrentEdit={this.getCurrentEdit}>
      <div ref={this.messageBody} class="message-body">
        {isReply ? <ReplyPreview reactions={props.reactions} event={props.event} /> : null}
        <DisplayContent content={content} />
      </div>
    </MessageFrame>
  }
}

export function DisplayContent(props) {
  const content = props.content
  const isReply = Replies.isReply(content)
  const isEmoji = /^\s*(\p{Extended_Pictographic}\p{Emoji_Component}*){1,3}\s*$/u.test(content.body)
  if ((!isEmoji && content.format === "org.matrix.custom.html") && content.formatted_body) {
    return <div
      dangerouslySetInnerHTML={{__html: sanitizeHtml(isReply
        ? sanitizeHtml(content.formatted_body, Replies.stripReply)
        : content.formatted_body, sanitizeHtmlParams)
      }} />
  } else {
    return <div class={isEmoji ? "large-emoji-display" : null}>
      {isReply
        ? Replies.stripFallbackPlain(content.body)
        : content.body}
    </div>
  }
}

export class FileMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  url = Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().url)

  render(props) {
    const filename = props.event.getContent().filename
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event} >
        <div class="message-body file-upload">
          file upload:&nbsp;
          <a href={this.url} download={filename}>{filename}</a>
        </div>
    </MessageFrame>
  }
}

export class ImageMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  url = this.props.event.getContent().info.thumbnail_url
    ? Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().info.thumbnail_url)
    : Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().url)

  // TODO need some sort of modal popup providing a preview of the full video
  render(props) {
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event}>
        <div class="message-body image-upload">
          <img class="mediaMessageThumbnail" src={this.url} />
        </div>
    </MessageFrame>
  }
}

export class VideoMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  content = this.props.event.getContent()

  poster = this.content.info.thumbnail_url
    ? Client.client.getHttpUriForMxcFromHS(this.content.info.thumbnail_url)
    : null

  url = Client.client.getHttpUriForMxcFromHS(this.content.url)

  render(props) {
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event}>
        <div class="message-body image-upload">
          <video class="mediaMessageThumbnail"
            controls
            poster={this.poster}
            preload={this.poster ? "none" : "metadata"}
            src={this.url} />
        </div>
    </MessageFrame>
  }
}

export class AudioMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  content = this.props.event.getContent()

  url= Client.client.getHttpUriForMxcFromHS(this.content.url)

  render(props) {
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event}>
        <div class="message-body image-upload">
          <audio controls src={this.url} />
        </div>
    </MessageFrame>
  }
}

class MessageFrame extends Component {
  constructor(props) {
    super(props)
    this.state = ({ responding: false })
  }

  userColor = new UserColor(this.props.event.getSender())

  openEditor = () => this.setState({ responding: true })

  closeEditor = () => this.setState({ responding: false })

  redactMessage = () => {
    // XXX also need to redact all subsequent edits that replace the original
    Client.client.redactEvent(this.props.event.getRoomId(), this.props.event.getId())
  }

  render(props, state) {
    // there's some cleverness involving involving the unstable clientside
    // relation aggregation mechanism that we're not taking advantage of
    // here. Element doesn't seem to use this for replacements yet either.
    const event = props.event
    const reactions = props.reactions[event.getId()]
      ? props.reactions[event.getId()]
        .filter(event => event.getContent()["m.relates_to"].rel_type === "m.annotation")
      : []
    const isUser = Client.client.getUserId() === event.getSender()
    return <Fragment>
      <div data-event-status={isUser ? event.getAssociatedStatus() : null}
        id={event.getId()}
        style={props.styleOverride || this.userColor.styleVariables}
        class={isUser ? "message-frame message-from-user" : "message-frame"}>
        {props.children}
            <MessageDecoration reactions={reactions}>
            {/* XXX Should probably handle action menu visibility in state rather than CSS */}
            { props.displayOnly
              ? null
              : isUser
                ? <ActionsOnOwnMessages canEdit={!!props.getCurrentEdit} responding={state.responding} openEditor={this.openEditor} redactMessage={this.redactMessage} />
                : <ActionsOnOthersMessages responding={state.responding} openEditor={this.openEditor} event={props.event} reactions={reactions} />
            }
          </MessageDecoration>
      </div>
      {state.responding
        ? isUser
          ? <MessageEditor closeEditor={this.closeEditor} getCurrentEdit={props.getCurrentEdit} event={event} />
          : <ReplyComposer closeEditor={this.closeEditor} getCurrentEdit={this.getCurrentEdit} event={event} />
        : null
      }
    </Fragment>
  }
}

class MessageDecoration extends Component {
  shouldComponentUpdate(nextProps) {
    return (this.props.reactions.length !== nextProps.reactions.length)
  }

  render(props) {
    const rtable = {}
    for (const reaction of props.reactions) {
      const emoji = reaction.getContent()?.["m.relates_to"]?.key
      if (!emoji) continue
      rtable[emoji]
        ? rtable[emoji] = rtable[emoji] + 1
        : rtable[emoji] = 1
    }
    const badges = []
    for (const key in rtable) {
      badges.push(<div class="message-reaction-type"><span>{rtable[key]}</span><span>{key}</span></div>)
    }
    return <div class="message-decoration">
      {badges.length < 1
        ? null
        : <div class="message-reactions">
          <div>
            {badges}
          </div>
        </div>
      }
      {props.children}
    </div>
  }
}

class ActionsOnOthersMessages extends Component {
  constructor(props) {
    super(props)
    this.state = { selecting: null }
  }

  checkEmoji = emoji => this.props.reactions.some(react => {
    return react.getSender() === Client.client.getUserId() &&
      react.getContent()?.["m.relates_to"]?.key === emoji
  })

  componentDidUpdate(_, prevState) {
    if (!prevState.selecting && this.state.selecting) {
      window.addEventListener('click', this.clearCarefully)
    }
    if (!prevState.selecting && !this.state.selecting) {
      window.removeEventListener('click', this.clearCarefully)
    }
  }

  actions = createRef()

  // necessary to clear component on mobile
  clearCarefully = e => {
    if (e.target === this.actions.current) return
    if (this.actions.current.contains(e.target)) return
    if (!document.body.contains(e.target)) return
    this.clearSelecting()
  }

  react = emoji => _ => {
    this.clearSelecting()
    if (this.checkEmoji(emoji)) return
    // we bail out if there's already a reaction from me.
    Client.client.sendEvent(this.props.event.getRoomId(), "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: this.props.event.getId(),
        key: emoji
      }
    })
  }

  handleEmojiClick = click => this.react(click.detail.unicode)()

  selectEmoji = _ => this.setState({ selecting: "emoji" })

  pickEmoji = _ => this.setState({ selecting: "emoji-picker" })

  clearSelecting = _ => this.setState({ selecting: null })

  render(props, state) {
    switch (state.selecting) {
      case "emoji-picker" : return <div ref={this.actions} data-active class="message-actions">
          <emoji-picker onemoji-click={this.handleEmojiClick} />
          <button key="a" style={{position: "relative", left: "250px"}} onclick={this.clearSelecting}>{Icons.close}</button>
        </div>
      case "emoji" : return <div ref={this.actions} data-active class="message-actions">
          <button key="b" onclick={this.react("👍")}>👍</button>
          <button key="c" onclick={this.react("❤")}>❤</button>
          <button key="d" onclick={this.react("🤣")}>🤣</button>
          <button key="e" onclick={this.react("🤔")}>🤔</button>
          <button key="f" onclick={this.pickEmoji}>{Icons.moreHorizontal}</button>
          <button key="g" onclick={this.clearSelecting}>{Icons.close}</button>
        </div>
      default : return <div ref={this.actions} class="message-actions">
          {!props.responding && <button key="h" title="reply to this message" onclick={props.openEditor}>
            {Icons.reply}
          </button>}
          <button key="i" title="react to this message" class="reaction" onclick={this.selectEmoji}>
            {Icons.like}
          </button>
        </div>
    }
  }
}

function ActionsOnOwnMessages(props) {
  return <div class="message-actions">
    {!props.responding && props.canEdit && <button title="edit this message" onclick={props.openEditor}>
      {Icons.edit}
    </button>}
    <button title="delete this message" onclick={props.redactMessage} class="redact">
      {Icons.trash}
    </button>
  </div>
}

class ReplyPreview extends Component {
  // eventually will want a mechanism for refreshing on receipt of edits
  componentDidMount() {
    this.getLiveEvent()
  }

  componentDidUpdate() {
    this.getLiveEvent()
  }

  async getLiveEvent() {
    if (!this.state.liveEvent) {
      const inReplyToId = this.props.event.getContent()["m.relates_to"]["m.in_reply_to"].event_id
      const roomId = this.props.event.getRoomId()
      const theRoom = Client.client.getRoom(roomId)
      if (!theRoom) return // room state not ready
      const inReplyTo = theRoom.findEventById(inReplyToId)
      if (inReplyTo) this.setState({ liveEvent: inReplyTo })
      try {
        console.log("trying to retrive live event")
        await Client.client.getEventTimeline(theRoom.getUnfilteredTimelineSet(), inReplyToId)
        console.log("retrived")
        this.setState({ liveEvent: theRoom.findEventById(inReplyToId) })
      } catch (e) {
        // the above uses the event-context route, which isn't implemented yet in Dendrite:
        //
        // https://github.com/matrix-org/dendrite/issues/670
        //
        // Hence, 404s right now.
        console.log("couldn't retrieve - is this a dendrite server? see https://github.com/matrix-org/dendrite/issues/670")
        console.log(e)
      }
    }
  }

  getCurrentEdit = () => {
    const edits = this.getEdits()
    // need to be smarter about ordering
    if (edits.length > 0) { return edits[edits.length - 1].getContent()["m.new_content"] }
    return this.state.liveEvent.getContent()
  }

  getEdits = () => {
    return this.props.reactions[this.state.liveEvent.getId()]
      ? this.props.reactions[this.state.liveEvent.getId()]
        .filter(event => event.getContent()["m.relates_to"].rel_type === "m.replace")
      : []
  }

  fromLiveEvent = _ => {
    const content = this.getCurrentEdit()
    const hasHtml = (content.format === "org.matrix.custom.html") && content.formatted_body
    const isReply = Replies.isReply(content)
    const senderColors = new UserColor(this.state.liveEvent.getSender())
    let displayBody
    if (!this.state.liveEvent.getContent().msgtype) {
      displayBody = <div class="redacted-preview">Original Message Deleted</div>
    } else {
      switch (this.state.liveEvent.getContent().msgtype) {
        case "m.video": {
          const thumbUrl = this.state.liveEvent.getContent().info.thumbnail_url
          const poster = thumbUrl ? Client.client.getHttpUriForMxcFromHS(thumbUrl) : null
          displayBody = <video class="mediaMessageThumbnail"
            controls
            poster={poster}
            preload={poster ? "none" : "metadata"}
            src={Client.client.getHttpUriForMxcFromHS(this.state.liveEvent.getContent().url)} />
          break;
        }
        case "m.image": {
          const thumbUrl = this.state.liveEvent.getContent().info.thumbnail_url
          const url = thumbUrl ? Client.client.getHttpUriForMxcFromHS(thumbUrl) : null
          displayBody = <img class="mediaMessageThumbnail" src={url} />
          break;
        }
        case "m.audio": {
          displayBody = <audio
            controls
            src={Client.client.getHttpUriForMxcFromHS(this.state.liveEvent.getContent().url)} />
          break;
        }
        case "m.file": {
          displayBody = <div class="file-upload">
            file upload:&nbsp;
            <a href={Client.client.getHttpUriForMxcFromHS(this.state.liveEvent.getContent().url)}>
              {this.state.liveEvent.getContent().filename}
            </a>
          </div>
          break;
        }
        case "m.text": {
          if (isReply && hasHtml) {
            const displayText = sanitizeHtml(content.formatted_body, Replies.stripReply)
            displayBody = <div dangerouslySetInnerHTML={{__html: displayText}} />
          } else if (hasHtml) {
            displayBody = <div dangerouslySetInnerHTML={{__html: content.formatted_body}} />
          } else if (isReply) {
            displayBody = <div>Replies.stripFallbackPlainString(content.body)</div>
          } else {
            displayBody = <div>content.body</div>
          }
          break;
        }
        case "m.notice": {
          if (isReply && hasHtml) {
            const displayText = sanitizeHtml(content.formatted_body, Replies.stripReply)
            displayBody = <div dangerouslySetInnerHTML={{__html: displayText}} />
          } else if (hasHtml) {
            displayBody = <div dangerouslySetInnerHTML={{__html: content.formatted_body}} />
          } else if (isReply) {
            displayBody = <div>Replies.stripFallbackPlainString(content.body)</div>
          } else {
            displayBody = <div>content.body</div>
          }
        }
      }
    }
    return <Fragment>
      <div class="reply-preface">In reply to:</div>
      <UserInfoHeader isReply userId={this.state.liveEvent.getSender()} />
      <div style={senderColors.styleVariables} class="reply-preview">
        {displayBody}
      </div>
    </Fragment>
  }

  fallbackPreview = _ => {
    const content = this.props.event.getContent()
    const hasHtml = (content.format === "org.matrix.custom.html") && content.formatted_body
    const style = {'--user_light': 'lightgray'}
    return hasHtml
      ? <div style={style} class="reply-preview reply-fallback" dangerouslySetInnerHTML={{__html: Replies.getFallbackHtml(content)}} />
      : <div style={style} class="reply-preview reply-fallback">{Replies.getFallbackPlain(content)}</div>
  }

  render(_props, state) {
    if (state.liveEvent) return this.fromLiveEvent()
    return this.fallbackPreview()
  }
}

class MessageEditor extends Component {
  constructor(props) {
    super(props)
    this.currentContent = props.getCurrentEdit()
    if (Replies.isReply(this.currentContent)) {
      this.setState({ value: Replies.stripFallbackPlainString(this.currentContent.body) })
    } else this.setState({ value: this.currentContent.body })
  }

  componentDidMount() {
    this.resize()
  }

  input = createRef()

  handleKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      this.sendResponse()
    }
  }

  handleInput = (event) => this.setValue(event.target.value, this.resize())

  setValue = (value, cb) => this.setState({ value }, cb)

  resize = () => {
    this.input.current.style.height = 'auto';
    this.input.current.style.height = `${this.input.current.scrollHeight}px`;
  }

  sendResponse = () => {
    const reader = new CommonMark.Parser()
    const writer = new CommonMark.HtmlRenderer()
    const parsed = reader.parse(processRegex(this.state.value))
    const rendered = writer.render(parsed)
    const theReplacementContent = {
      body: this.state.value,
      msgtype: "m.text",
      format: "org.matrix.custom.html",
      // TODO sanitize formattedBody before use
      formatted_body: rendered
    }
    if (Replies.isReply(this.currentContent)) {
      theReplacementContent["m.relates_to"] = this.currentContent["m.relates_to"]
      theReplacementContent.body = Replies.getFallbackPlain(this.currentContent) + theReplacementContent.body
      theReplacementContent.formatted_body = Replies.getFallbackHtml(this.currentContent) + theReplacementContent.formatted_body
    }
    const theReactionContent = {
      body: "an edit occurred", // fallback for clients that don't handle edits. we can do something more descriptive
      msgtype: "m.text",
      "m.new_content": theReplacementContent,
      "m.relates_to": {
        rel_type: "m.replace",
        event_id: this.props.event.getId()
      }
    }
    Client.client.sendEvent(this.props.event.getRoomId(), "m.reaction", theReactionContent).then(_ => this.props.closeEditor())
  }

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.event.getRoomId()} {...props} />,
    ":": props => <PopupMenu.Emojis {...props} />
  }

  render(_props, state) {
    return <div class="replyComposer">
      <PopupMenu.Menu
        textValue={state.value}
        textarea={this.input}
        actions={this.popupActions}
        setTextValue={this.setValue}
      />
      <textarea ref={this.input}
        value={state.value}
        onkeydown={this.handleKeydown}
        oninput={this.handleInput}
        data-gramm="false" // disable grammarly
      />
      <button onclick={this.sendResponse}>Submit Changes</button>
      <button onclick={this.props.closeEditor}>Cancel</button>
    </div>
  }
}

class ReplyComposer extends Component {
  input = createRef()

  handleKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      this.sendResponse()
    }
  }

  handleInput = (event) => {
    this.setValue(event.target.value)
    this.input.current.style.height = 'auto';
    this.input.current.style.height = `${this.input.current.scrollHeight}px`;
  }

  setValue = (value, cb) => this.setState({ value }, cb)

  sendResponse = () => {
    const reader = new CommonMark.Parser()
    const writer = new CommonMark.HtmlRenderer()
    const parsed = reader.parse(processRegex(this.state.value))
    const rendered = writer.render(parsed)
    Client.client.sendMessage(this.props.event.getRoomId(), {
      body: Replies.generateFallbackPlain(this.props.event) + this.state.value,
      formatted_body: Replies.generateFallbackHtml(this.props.event) + rendered,
      format: "org.matrix.custom.html",
      msgtype: "m.text",
      "m.relates_to": {
        "m.in_reply_to": {
          event_id: this.props.event.getId()
        }
      }
    }).then(_ => this.props.closeEditor())
  }

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.event.getRoomId()} {...props} />,
    ":": props => <PopupMenu.Emojis {...props} />
  }

  render(_props, state) {
    return <div class="replyComposer">
      <PopupMenu.Menu
        textValue={state.value}
        textarea={this.input}
        setTextValue={this.setValue}
        actions={this.popupActions}
      />
      <textarea ref={this.input}
        value={state.value}
        onkeydown={this.handleKeydown}
        oninput={this.handleInput}
        data-gramm="false" // disable grammarly
      />
      <button onclick={this.sendResponse}>Send Reply</button>
      <button onclick={this.props.closeEditor}>Cancel</button>
    </div>
  }
}
