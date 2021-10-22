import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import * as CommonMark from 'commonmark'
import { addLatex } from './latex.js'
import katex from 'katex'
import UserColor from './userColors.js'
import { sanitizeHtmlParams } from './constants.js'
import Client from './client.js'
import * as Icons from './icons.js'
import * as Replies from './utils/replies.js'

export class TextMessage extends Component {
  componentDidMount() {
    this.processLatex()
    this.processLinks()
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      this.processLatex()
      this.processLinks()
    }
  }

  messageBody = createRef()

  processLatex() {
    if (this.messageBody.current) {
      const latexArray = Array.from(this.messageBody.current.querySelectorAll("[data-mx-maths]"))
      latexArray.forEach(elt => {
        if (elt.tagName === "DIV") katex.render(elt.dataset.mxMaths, elt, {displayMode: true, throwOnError: false})
        else katex.render(elt.dataset.mxMaths, elt, {throwOnError: false})
      })
    }
  }

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
            this.props.pushHistory({
              pdfFocused: title,
              pageFocused: page
            }, _ => focus ? this.props.setFocus({ roomId: focus }) : null )
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
    const replyPreview = isReply ? <ReplyPreview reactions={props.reactions} event={props.event} /> : null
    const displayBody = <div ref={this.messageBody} class="body">
      {replyPreview}
      <DisplayContent content={content} />
    </div>
    return <Message reactions={props.reactions}
      event={props.event}
      getCurrentEdit={this.getCurrentEdit}>
        {displayBody}
    </Message>
  }
}

export class NoticeMessage extends Component {
  componentDidMount() {
    this.processLatex()
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      this.processLatex()
    }
  }

  messageBody = createRef()

  noticeStyle = {
    "--user_ultralight": "hsl(0,0%, 95%)",
    "--user_light": "hsl(0,0%, 80%)",
    "--user_solid": "hsl(0,0%, 50%)",
    "--user_dark": "hsl(0,0%, 20%)"
  }

  processLatex() {
    if (this.messageBody.current) {
      const latexArray = Array.from(this.messageBody.current.querySelectorAll("[data-mx-maths]"))
      latexArray.forEach(elt => {
        if (elt.tagName === "DIV") katex.render(elt.dataset.mxMaths, elt, {displayMode: true, throwOnError: false})
        else katex.render(elt.dataset.mxMaths, elt, {throwOnError: false})
      })
    }
  }

  render(props) {
    const content = props.event.getContent()
    const isReply = Replies.isReply(content)
    const replyPreview = isReply ? <ReplyPreview reactions={props.reactions} event={props.event} /> : null
    const displayBody = <div ref={this.messageBody} class="body">
      {replyPreview}
      <DisplayContent content={content} />
    </div>
    return <Message
      reactions={props.reactions}
      styleOverride={this.noticeStyle}
      event={props.event}
      getCurrentEdit={this.getCurrentEdit}>
        {displayBody}
    </Message>
  }
}

function DisplayContent(props) {
  const content = props.content
  const isReply = Replies.isReply(content)
  if ((content.format === "org.matrix.custom.html") && content.formatted_body) {
    return <div 
      dangerouslySetInnerHTML={{__html: sanitizeHtml(isReply 
        ? sanitizeHtml(content.formatted_body, Replies.stripReply) 
        : content.formatted_body, sanitizeHtmlParams)
        }} />
  } else {
    return <div>
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
    return <Message reactions={props.reactions}
      event={props.event} >
        <div class="body file-upload">
          file upload:&nbsp;
          <a href={this.url}>{props.event.getContent().filename}</a>
        </div>
    </Message>
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
    return <Message reactions={props.reactions}
      event={props.event}>
        <div class="body image-upload">
          <img class="mediaMessageThumbnail" src={this.url} />
        </div>
    </Message>
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
    return <Message reactions={props.reactions}
      event={props.event}>
        <div class="body image-upload">
          <video class="mediaMessageThumbnail"
            controls
            poster={this.poster}
            preload={this.poster ? "none" : "metadata"}
            src={this.url} />
        </div>
    </Message>
  }
}

export class AudioMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  content = this.props.event.getContent()

  url= Client.client.getHttpUriForMxcFromHS(this.content.url)

  render(props) {
    return <Message reactions={props.reactions}
      event={props.event}>
        <div class="body image-upload">
          <audio controls src={this.url} />
        </div>
    </Message>
  }
}

class Message extends Component {
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

    if (Client.client.getUserId() === event.getSender()) {
      return (
        <Fragment>
          <div data-event-status={event.getAssociatedStatus()}
            id={event.getId()}
            style={props.styleOverride || this.userColor.styleVariables}
            class="message me">
            {props.children}
            <div class="ident">
              {(upvotes > 0) && <span class="upvotes">+{upvotes}</span>}
              <div class="info">
                {!state.responding && canEdit && <button title="edit this message" onclick={this.openEditor}>{Icons.edit}</button>}
                <button title="delete this message" onclick={this.redactMessage} class="redact">{Icons.trash}</button>
              </div>
            </div>
          </div>
          {state.responding && canEdit && <MessageEditor closeEditor={this.closeEditor}
            getCurrentEdit={props.getCurrentEdit}
            event={event}
          />}
        </Fragment>
      )
    }
    return (
      <Fragment>
        <div style={props.styleOverride || this.userColor.styleVariables} id={event.getId()} class="message">
          <div class="ident">
            <div class="info">
              {!state.replying && <button title="reply to this message" onclick={this.openEditor}>{Icons.reply}</button>}
              <button title="upvote this message" class="reaction" onclick={this.upvote}>{Icons.like}</button>
            </div>
            {(upvotes > 0) && <span class="upvotes">+{upvotes}</span>}
          </div>
          {props.children}
        </div>
        {state.responding && <ReplyComposer closeEditor={this.closeEditor}
          getCurrentEdit={this.getCurrentEdit}
          event={event}
        />}
      </Fragment>
    )
  }
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
      // the below uses the event-context route, which isn't implemented yet in Dendrite:
      //
      // https://github.com/matrix-org/dendrite/issues/670
      //
      // Hence, 404s right now.
      //
      // try {
      //   console.log("trying to retrive")
      //   await Client.client.getEventTimeline(theRoom.getUnfilteredTimelineSet(), inReplyToId)
      //   console.log("retrived")
      // } catch (e) {
      //   console.log("couldn't retrieve")
      //   return
      // }
      // this.setState({ liveEvent: theRoom.findEventById(inReplyToId) })
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
      ? <div style={style} class="reply-preview reply-fallback" dangerouslySetInnerHTML={{_html: Replies.getFallbackHtml(content)}} />
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

  handleInput = (event) => this.setState({ value: event.target.value }, this.resize())

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
    this.setState({ value: event.target.value })
    this.input.current.style.height = 'auto';
    this.input.current.style.height = `${this.input.current.scrollHeight}px`;
  }

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
