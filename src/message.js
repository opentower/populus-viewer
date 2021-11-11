import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { addLatex, renderLatexInElement } from './latex.js'
import UserColor from './userColors.js'
import { sanitizeHtmlParams } from './constants.js'
import Client from './client.js'
import * as Icons from './icons.js'
import * as Replies from './utils/replies.js'
import PopUpMenu from './popUpMenu.js'
import './styles/message.css'

export class TextMessage extends Component {
  componentDidMount() {
    renderLatexInElement(this.messageBody.current)
    this.processLinks()
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      renderLatexInElement(this.messageBody.current)
      this.processLinks()
    }
  }

  messageBody = createRef()

  processLinks() {
    if (this.messageBody.current) {
      const linkArray = Array.from(this.messageBody.current.querySelectorAll("a[href]"))
      linkArray
        .filter(link => new URL(link.getAttribute("href")).pathname === window.location.pathname)
        .forEach(link => {
          const params = new URL(link.getAttribute("href")).searchParams
          link.addEventListener("click", e => {
            e.preventDefault()
            const title = params.get("title") || null
            const focus = params.get("focus") || null
            const page = parseInt(params.get("page"), 10) || null
            this.props.pushHistory(
              { pdfFocused: title, pageFocused: page }
              , this.props.setfocus && focus ? _ => this.props.setfocus({ roomId: focus }) : null
              // callback. Should maybe add a QueryParam.set(focus) to perhaps handle the case where the link isn't in the PdfView
            )
          })
        })
    }
  }

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

function DisplayContent(props) {
  const content = props.content
  const isReply = Replies.isReply(content)
  const isEmoji = /^\s*\p{Emoji}{1,3}\s*$/u.test(content.body)
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
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event} >
        <div class="message-body file-upload">
          file upload:&nbsp;
          <a href={this.url}>{props.event.getContent().filename}</a>
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

  upvote = () => {
    const reactions = this.props.reactions[this.props.event.getId()] || []
    if (reactions.some(react => react.getSender() === Client.client.getUserId() )) return
    // we bail out if there's already a plus one from me.
    Client.client.sendEvent(this.props.event.getRoomId(), "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: this.props.event.getId(),
        key: "👍"
      }
    })
  }

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
    const canEdit = !!props.getCurrentEdit
    const upvotes = props.reactions[event.getId()]
      ? props.reactions[event.getId()].filter(
        event => event.getContent()["m.relates_to"].rel_type === "m.annotation"
      ).length
      : 0
    const isUser = Client.client.getUserId() === event.getSender()
    return <Fragment>
      <div data-event-status={isUser ? event.getAssociatedStatus() : null}
        id={event.getId()}
        style={props.styleOverride || this.userColor.styleVariables}
        class={isUser ? "message-frame message-from-user" : "message-frame"}>
        {props.children}
        <MessageDecoration upvotes={upvotes}>
          { props.displayOnly
            ? null
            : isUser
              ? <Fragment>
                {!state.responding && canEdit && <button title="edit this message" onclick={this.openEditor}>{Icons.edit}</button>}
                <button title="delete this message" onclick={this.redactMessage} class="redact">{Icons.trash}</button>
              </Fragment>
              : <Fragment>
                {!state.replying && <button title="reply to this message" onclick={this.openEditor}>{Icons.reply}</button>}
                <button title="upvote this message" class="reaction" onclick={this.upvote}>{Icons.like}</button>
              </Fragment>
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

function MessageDecoration(props) {
  return <div class="message-decoration">
    {props.upvotes > 0 
      ? <div class="message-upvotes">
        <div><span>{props.upvotes}</span><span>👍️</span></div>
        </div>
      : null
    }
    <div class="message-actions">
      {props.children}
    </div>
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
    const senderId = this.state.liveEvent.getSender()
    const sender = Client.client.getUser(senderId)
    const senderColors = new UserColor(this.state.liveEvent.getSender())
    const avatarHttpURI = Client.client.getHttpUriForMxcFromHS(sender.avatarUrl, 20, 20, "crop")
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
    return <div style={senderColors.styleVariables} class="reply-preview">
      <div class="reply-preface">In reply to:</div>
      <div class="reply-sender-info">
        {avatarHttpURI ? <img src={avatarHttpURI} /> : null}
        <span>{sender.displayName}</span>
      </div>
      {displayBody}
    </div>
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
    const parsed = reader.parse(addLatex(this.state.value))
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

  render(_props, state) {
    return <div class="replyComposer">
      <PopUpMenu
        roomId={this.props.event.getRoomId()}
        textValue={state.value}
        textarea={this.input}
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
    const parsed = reader.parse(addLatex(this.state.value))
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

  render(_props, state) {
    return <div class="replyComposer">
      <PopUpMenu 
        roomId={this.props.event.getRoomId()}
        textValue={state.value}
        textarea={this.input}
        setTextValue={this.setValue}
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
