import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import { renderLatexInElement } from './latex.js'
import { UserColor } from './utils/colors.js'
import { sanitizeHtmlParams, mscMarkupMsgKey, mscLocation } from './constants.js'
import { processLinks } from './links.js'
import UserInfoHeader from './userInfoHeader.js'
import MessageFrame from './messageFrame.js'
import 'emoji-picker-element'
import Location from './utils/location.js'
import Client from './client.js'
import * as Replies from './utils/replies.js'
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

export class EmoteMessage extends Component {
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

  sender = Client.client.getUser(this.props.event.getSender())

  userColor = new UserColor(this.props.event.getSender())

  render(props) {
    const content = props.event.getContent()
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event}>
      <div ref={this.messageBody} class="message-body">
        <div class="emote-banner" style={this.userColor.styleVariables}>
          {this.sender.displayName}:
        </div>
        <DisplayContent content={content} />
      </div>
    </MessageFrame>
  }
}

export class AnnotationMessage extends Component {
  handleClick = _ => {
    if (this.hasFocus()) this.props.setSecondaryFocus(null)
  }

  handleLinkClick = e => {
    e.stopPropagation()
    if (!this.hasFocus()) this.props.setSecondaryFocus(this.location)
  }

  sender = Client.client.getUser(this.props.event.getSender())

  userColor = new UserColor(this.props.event.getSender())

  location = new Location(this.props.event)

  text = this.location.getText()

  pageNumber = this.location.getPageIndex()

  hasFocus = _ => this.location === this.props.secondaryFocus

  render(props) {
    if (!this.text) return
    return <MessageFrame
      styleOverride={this.hasFocus() ? {background: this.userColor.ultralight, ... this.userColor.styleVariables} : null }
      reactions={props.reactions}
      event={props.event}
      getCurrentEdit={this.getCurrentEdit}>
      <div onClick={this.handleClick} class="message-body">
        <span class="annotation-banner">
          On&nbsp;
          <a onClick={this.handleLinkClick}
            href={`${window.location.origin}${window.location.pathname}#/${encodeURIComponent(props.pdfFocused)}/${this.pageNumber}/`} >
            page {this.pageNumber}
          </a>:
        </span>
        <blockquote>
          {this.text}
        </blockquote>
      </div>
    </MessageFrame>
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
