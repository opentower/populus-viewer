import { h, createRef, Fragment, Component } from 'preact';
import './styles/chat.css'
import * as Matrix from "matrix-js-sdk"
import * as CommonMark from 'commonmark'
import * as Icons from "./icons.js"
import { addLatex } from './latex.js'
import { TextMessage, FileMessage, ImageMessage, VideoMessage } from './message.js'
import UserColor from './userColors.js'
import { serverRoot } from "./constants.js"
import { loadImageElement, loadVideoElement, createThumbnail } from "./utils/media.js"

export default class Chat extends Component {
  constructor (props) {
    super(props)
    this.state = {
      typing: [],
      events: [],
      fullyScrolled: false
    }
    this.scrolledIdents = new Set()
    this.handleTimeline = this.handleTimeline.bind(this)
    this.handleTypingNotifications = this.handleTypingNotification.bind(this)
  }

  componentDidMount() {
    this.props.client.on("Room.timeline", this.handleTimeline)
    this.props.client.on("Room.redaction", this.handleTimeline)
    this.props.client.on("Room.localEchoUpdated", this.handleTimeline)
    this.props.client.on("RoomMember.typing", this.handleTypingNotification)
    this.props.client.joinRoom(this.props.focus.roomId).then(room =>
      this.setState({
        fullyScrolled: this.scrolledIdents.has(this.props.focus.roomId),
        events: room.getLiveTimeline().getEvents()
      }, _ => this.tryLoad(room))
    )
  }

  componentWillUnmount() {
    this.props.client.off("Room.timeline", this.handleTimeline)
    this.props.client.off("Room.redaction", this.handleTimeline)
    this.props.client.off("Room.localEchoUpdated", this.handleTimeline)
    this.props.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  // Room.timeline passes in more params
  handleTimeline = (event, room) => {
    if (this.props.focus && this.props.focus.roomId === event.getRoomId()) {
      this.setState({
        events: room.getLiveTimeline().getEvents()
      })
    }
  }

  handleTypingNotification = (event, member) => {
    if (member.roomId === this.props.focus.roomId) {
      // ^^^ we have to check the originating room in an odd way because
      // the roomId for the typing events isn't set for some reason,
      // maybe a bug in dendrite
      const myId = this.props.client.getUserId()
      const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
      this.setState({ typing: typingOtherThanMe })
    }
  }

  handleScroll = e => {
    this.tryLoadRoom()
    if (this.props.handleWidgetScroll) this.props.handleWidgetScroll(e)
  }

  tryLoad = (room) => {
    const anchor = document.getElementById("scroll-anchor")
    const chatPanel = document.getElementById("chat-panel")
    const newroom = this.props.client.getRoom(room.roomId) // we refresh the room to ensure that some state is loaded
    if (!newroom) setTimeout(_ => this.tryLoad(room), 100) // if not, we try again momentarily
    else if (anchor && chatPanel.getBoundingClientRect().top - 5 < anchor.getBoundingClientRect().top) {
      room = newroom // the initial empty room needs to be replaced by the room that has some loaded state
      this.props.client.scrollback(room)
      const prevState = room.getLiveTimeline().getState(Matrix.EventTimeline.BACKWARDS)
      if (!prevState.paginationToken && this.props.client.getRoom(room.roomId)) {
        this.scrolledIdents.add(room.roomId)
        this.setState({ fullyScrolled: true })
      }
      this.props.client.joinRoom(room.roomId).then(
        newroom => setTimeout(_ => this.tryLoad(newroom), 100)
      )
    }
  }

  tryLoadRoom = async () => {
    const room = await this.props.client.joinRoom(this.props.focus.roomId)
    this.tryLoad(room)
  }

  async resetFocus () {
    const room = await this.props.client.joinRoom(this.props.focus.roomId)
    this.setState({
      fullyScrolled: this.scrolledIdents.has(this.props.focus.roomId),
      events: room.getLiveTimeline().getEvents()
    }, _ => this.tryLoad(room))
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.focus !== this.props.focus) this.resetFocus()
  }

  render(props, state) {
    const reactions = {}
    // XXX need to be able to handle other message types
    const messages = state.events.filter(
      e => e.getType() === "m.room.message" &&
        (e.getContent().msgtype === "m.text" ||
        e.getContent().msgtype === "m.file" ||
        e.getContent().msgtype === "m.image" ||
        e.getContent().msgtype === "m.video" ||
        Object.keys(e.getContent()).length === 0
        )
    )
    let prev = null
    const messagedivs = messages.reduce((accumulator, event) => {
      if (!prev || prev.getSender() !== event.getSender()) {
        accumulator.push(
          <UserInfoMessage key={`${event.getId()}-userinfo`}
            username={event.getSender()}
            client={props.client}
            isMe={event.getSender() === props.client.getUserId()} />
        )
        prev = event
      }
      switch (event.getContent().msgtype) {
        case "m.text": {
          accumulator.push(
            <TextMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case "m.file": {
          accumulator.push(
            <FileMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case "m.image": {
          accumulator.push(
            <ImageMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
              event={event} />
          )
          break;
        }
        case "m.video": {
          accumulator.push(
            <VideoMessage reactions={reactions}
              client={this.props.client}
              key={event.getId()}
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
              isMe={event.getSender() === props.client.getUserId()} />
            )
          }
          break;
        }
      }

      return accumulator
    }, [])
    // sort reactions by event reacted-to
    state.events.forEach(e => {
      if (e.getType() === "m.reaction") {
        if (reactions[e.getContent()["m.relates_to"].event_id]) reactions[e.getContent()["m.relates_to"].event_id].push(e)
        else reactions[e.getContent()["m.relates_to"].event_id] = [e]
      }
    })
    // the chat wrapper works around a nasty positioning bug in chrome - it
    // has height set, so that we don't need to set height on the flexbox element
    return (
      <div class={props.class} onscroll={this.handleScroll} id="chat-wrapper">
        <div id="chat-panel">
          <MessagePanel textarea={this.messageTextarea} client={props.client} focus={props.focus} />
          <div id="messages">
            {messagedivs}
            <TypingIndicator client={this.props.client} typing={this.state.typing} />
          </div>
          <Anchor focus={props.focus} fullyScrolled={state.fullyScrolled} />
        </div>
      </div>
    )
  }
}

class UserInfoMessage extends Component {
    displayName = this.props.client.getUser(this.props.username).displayName

    avatarUrl = this.props.client.getUser(this.props.username).avatarUrl

    avatarHttpURI = Matrix.getHttpUriForMxc(serverRoot, this.avatarUrl, 20, 20, "crop")

    userColor = new UserColor(this.props.username)

    render(props) {
      const theClass = props.isMe ? "user-info-message me" : "user-info-message"
      return <div class={theClass} style={this.userColor.styleVariables}>
        {this.avatarHttpURI ? <img src={this.avatarHttpURI} /> : null}
        <span>{this.displayName}</span>
      </div>
    }
}

class RedactedMessage extends Component {
  userColor = new UserColor(this.props.username)

  render(props) {
    return props.isMe
      ? <div class="redacted message me" style={this.userColor.styleVariables}>
        <div class="ident" />
        <div class="body">{props.count > 1 ? `${props.count} messages deleted` : "message deleted"}</div>
      </div>
      : <div class="redacted message" style={this.userColor.styleVariables}>
        <div class="ident" />
        <div class="body">{props.count > 1 ? `${props.count} messages deleted` : "message deleted"}</div>
      </div>
  }
}

function Anchor(props) {
  if (props.fullyScrolled) return <div id="scroll-done">All events loaded</div>
  return <div id="scroll-anchor">loading...</div>
}

function TypingIndicator(props) {
  const displayNames = props.typing.map(typer => props.client.getUser(typer).displayName)
  const howMany = displayNames.length
  if (howMany === 0) return <div class="typingIndicator">&nbsp;</div>
  else if (howMany === 1) return <div class="typingIndicator">{displayNames[0]} is typing</div>
  else if (howMany === 2) return <div class="typingIndicator">{displayNames[0]} and {displayNames[1]} are typing</div>
  return <div class="typingIndicator">several people are typing</div>
}

class MessagePanel extends Component {
  constructor (props) {
    super(props)
    this.state = {
      mode: "Default",
      buttons: 1
    }
  }

  userColor = new UserColor(this.props.client.getUserId())

  theInput = createRef()

  getInput () {
    switch (this.state.mode) {
      case 'Default': return <TextMessageInput ref={this.theInput} focus={this.props.focus} client={this.props.client} />
      case 'SendFile': return <FileUploadInput ref={this.theInput} done={this.setModeDefault} focus={this.props.focus} client={this.props.client} />
      case 'SendMedia': return <MediaUploadInput ref={this.theInput} done={this.setModeDefault} focus={this.props.focus} client={this.props.client} />
      case 'RecordVideo': return <RecordVideoInput ref={this.theInput} done={this.setModeDefault} focus={this.props.focus} client={this.props.client} />
    }
  }

  setModeDefault = _ => this.setState({ mode: "Default" })

  setModeSendFile = _ => this.setState({ mode: "SendFile" })

  setModeSendImage = _ => this.setState({ mode: "SendMedia" })

  setModeRecordVideo = _ => this.setState({ mode: "RecordVideo" })

  showMore = _ => this.setState({ buttons: this.state.buttons + 1 })

  showLess = _ => this.setState({ buttons: this.state.buttons - 1 })

  submitCurrentInput = _ => {
    if (this.theInput.current) this.theInput.current.submitInput()
    else console.log("no available input")
  }

  render(props, state) {
    return (<div style={this.userColor.styleVariables} id="messageComposer">
      {this.getInput()}
      <div id="submit-button-wrapper">
        { state.mode === "Default"
          ? <Fragment>
            { state.buttons === 1
              ? <Fragment>
                  <button id="submitButton" onclick={this.submitCurrentInput}>Submit</button>
                  <button onclick={this.setModeSendFile}>{Icons.upload}</button>
                  <button onclick={this.setModeSendImage}>{Icons.image}</button>
                  <button onclick={this.showMore}>{Icons.moreHorizontal}</button>
              </Fragment>
              : <Fragment>
                  <button onclick={this.showLess}>{Icons.moreHorizontal}</button>
                  <button onclick={this.setModeRecordVideo}>{Icons.video}</button>
              </Fragment>
            }
          </Fragment>
          : <Fragment>
              <button id="submitButton" onclick={this.submitCurrentInput}>Submit</button>
              <button id="cancelButton" onclick={this.setModeDefault}>Cancel</button>
          </Fragment>
        }
      </div>
    </div>)
  }
}

class FileUploadInput extends Component {
  fileLoader = createRef()

  theForm = createRef()

  submitInput = async _ => {
    const theFile = this.fileLoader.current.files[0]
    const mxc = await this.props.client.uploadContent(theFile, { progressHandler: this.progressHandler }).catch(e => console.log(e))
    const theContent = {
      body: theFile.name,
      filename: theFile.name,
      info: {
        mimetype: theFile.type ? theFile.type : "application/octet-stream",
        size: theFile.size
      },
      msgtype: "m.file",
      url: mxc
    }
    await this.props.client.sendMessage(this.props.focus.roomId, theContent)
    this.props.done()
  }

  progressHandler = (progress) => this.setState({progress})

  render() {
    return <form ref={this.theForm}>
      <input ref={this.fileLoader} type="file" />
      {this.state.progress
        ? <div id="pdfUploadFormProgress">
          <span>{this.state.progress.loaded}</span>
          <span>/</span>
          <span>{this.state.progress.total} bytes</span>
        </div>
        : null
      }
    </form>
  }
}

class RecordVideoInput extends Component {
  componentDidMount () {
    this.initVideoStream()
  }

  mediaPreview = createRef()

  async initVideoStream () {
    const constraints = {
      audio: true,
      video: { facingMode: "user" }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.mediaPreview.current.srcObject = stream
    } catch (err) {
      alert(err)
    }
  }

  async submitVideo () {
    const theVideo = this.mediaLoader.current.files[0]
    // TODO: reject non-media mimetypes
    const videoElt = await loadVideoElement(theVideo)
    const thumbInfo = await createThumbnail(videoElt, videoElt.videoWidth, videoElt.videoHeight, "image/jpeg")
    const thumbMxc = await this.props.client.uploadContent(thumbInfo.thumbnail, {
      name: `${theVideo.name}_800x600`,
      type: "image/jpeg",
      progressHandler: this.progressHandler
    })
    const videoMxc = await this.props.client.uploadContent(theVideo, { progressHandler: this.progressHandler })
    const duration = Math.round(videoElt.duration * 1000)
    const theContent = {
      body: theVideo.name,
      info: {
        h: thumbInfo.h,
        w: thumbInfo.w,
        mimetype: theVideo.type,
        size: theVideo.size,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbInfo.thumbnail_info
      },
      msgtype: "m.video",
      url: videoMxc
    }
    if (duration < Infinity) theContent.duration = duration
    await this.props.client.sendMessage(this.props.focus.roomId, theContent)
  }

  progressHandler = (progress) => this.setState({progress})

  render() {
    return <video autoplay ref={this.mediaPreview} class="mediaMessageThumbnail" />
  }
}

class MediaUploadInput extends Component {
  theForm = createRef()

  mediaLoader = createRef()

  mediaPreview = createRef()

  uploadImage = _ => this.mediaLoader.current.click()

  updatePreview = _ => {
    const theImage = this.mediaLoader.current.files[0]
    if (theImage && (/^video/.test(theImage.type) || /^image/.test(theImage.type))) {
      this.setState({previewUrl: URL.createObjectURL(this.mediaLoader.current.files[0]) })
      if (/^video/.test(theImage.type)) this.setState({mediaType: "video" })
      if (/^image/.test(theImage.type)) this.setState({mediaType: "image" })
    }
  }

  getPreview = _ => {
    switch (this.state.mediaType) {
      case "image": return <img ref={this.mediaPreview} class="mediaMessageThumbnail" src={this.state.previewUrl} />
      case "video": return <video ref={this.mediaPreview} class="mediaMessageThumbnail" controls src={this.state.previewUrl} />
    }
  }

  submitInput = async _ => {
    if (this.mediaPreview.current) {
      switch (this.state.mediaType) {
        case "image": await this.submitImage(); break
        case "video": await this.submitVideo(); break
      }
    }
    this.props.done()
  }

  async submitVideo () {
    const theVideo = this.mediaLoader.current.files[0]
    // TODO: reject non-media mimetypes
    const videoElt = await loadVideoElement(theVideo)
    const thumbInfo = await createThumbnail(videoElt, videoElt.videoWidth, videoElt.videoHeight, "image/jpeg")
    const thumbMxc = await this.props.client.uploadContent(thumbInfo.thumbnail, {
      name: `${theVideo.name}_800x600`,
      type: "image/jpeg",
      progressHandler: this.progressHandler
    })
    const videoMxc = await this.props.client.uploadContent(theVideo, { progressHandler: this.progressHandler })
    const duration = Math.round(videoElt.duration * 1000)
    const theContent = {
      body: theVideo.name,
      info: {
        h: thumbInfo.h,
        w: thumbInfo.w,
        mimetype: theVideo.type,
        size: theVideo.size,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbInfo.thumbnail_info
      },
      msgtype: "m.video",
      url: videoMxc
    }
    if (duration < Infinity) theContent.duration = duration
    await this.props.client.sendMessage(this.props.focus.roomId, theContent)
  }

  async submitImage () {
    const theImage = this.mediaLoader.current.files[0]
    // TODO: reject non-media mimetypes
    const {width, height, img} = await loadImageElement(theImage)
    const thumbType = theImage.type === "image/jpeg" ? "image/jpeg" : "image/png"
    const thumbInfo = await createThumbnail(img, width, height, thumbType)
    const thumbMxc = await this.props.client.uploadContent(thumbInfo.thumbnail, {
      name: `${theImage.name}_800x600`,
      type: thumbType,
      progressHandler: this.progressHandler
    })
    const imageMxc = await this.props.client.uploadContent(theImage, { progressHandler: this.progressHandler })
    const theContent = {
      body: theImage.name,
      info: {
        h: height,
        w: width,
        mimetype: theImage.type,
        size: theImage.size,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbInfo.thumbnail_info
      },
      msgtype: "m.image",
      url: imageMxc
    }
    await this.props.client.sendMessage(this.props.focus.roomId, theContent)
  }

  progressHandler = (progress) => this.setState({progress})

  render(props, state) {
    return <form ref={this.theForm}>
      <input id="mediaUploaderHidden" onchange={this.updatePreview} accept="image/*,video/*" ref={this.mediaLoader} type="file" />
      {state.previewUrl
        ? this.getPreview()
        : <div onclick={this.uploadImage} class="mediaMessageThumbnail awaiting" />}
      {this.state.progress
        ? <div id="pdfUploadFormProgress">
          <span>{this.state.progress.loaded}</span>
          <span>/</span>
          <span>{this.state.progress.total} bytes</span>
        </div>
        : null
      }
    </form>
  }
}

class TextMessageInput extends Component {
  constructor (props) {
    super(props)
    this.state = { value: "" }
    this.reader = new CommonMark.Parser()
    this.writer = new CommonMark.HtmlRenderer()
  }

  currentInput = createRef()

  startTyping = _ => {
    // send a "typing" notification with a 30 second timeout
    this.props.client.sendTyping(this.props.focus.roomId, true, 30000)
    // lock sending further typing notifications
    this.typingLock = true
    // Release lock (to allow sending another typing notification) after 10 seconds
    this.resetLockTimeout = setTimeout(_ => { this.typingLock = false }, 10000)
  }

  stopTyping = _ => {
    // return to "waiting for typing" state
    this.typingLock = false;
    clearTimeout(this.resetLockTimeout)
    clearTimeout(this.typingTimeout)
    // send a "not typing" notification
    this.props.client.sendTyping(this.props.focus.roomId, false)
  }

  handleInput = (event) => {
    if (event.target.value === "") this.stopTyping()
    this.setState({ value: event.target.value })
    this.currentInput.current.style.height = 'auto';
    this.currentInput.current.style.height = `${this.currentInput.current.scrollHeight}px`;
  }

  handleKeypress = (event) => {
    event.stopPropagation() // don't propagate to global keypress handlers
    clearTimeout(this.typingTimeout)
    this.typingTimeout = setTimeout(_ => this.stopTyping(), 5000)
    // send "stopped typing" after 5 seconds of inactivity
    if (event.code === "Enter" && event.ctrlKey) {
      event.preventDefault()
      this.submitInput()
    } else if (!this.typingLock) this.startTyping()
  }

  submitInput = _ => {
    if (this.props.focus.roomId) {
      this.stopTyping()
      const parsed = this.reader.parse(addLatex(this.state.value))
      const rendered = this.writer.render(parsed)
      this.props.client.sendMessage(this.props.focus.roomId, {
        body: this.state.value,
        msgtype: "m.text",
        format: "org.matrix.custom.html",
        formatted_body: rendered
      })
      this.setState({ value: "" })
    }
  }

  render (props, state) {
    return <textarea ref={this.currentInput}
      value={state.value}
      onkeypress={this.handleKeypress}
      oninput={this.handleInput} />
  }
}
