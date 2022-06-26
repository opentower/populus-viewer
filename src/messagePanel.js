import * as Icons from "./icons.js"
import { h, createRef, Fragment, Component } from 'preact';
import * as CommonMark from 'commonmark'
import { loadImageElement, loadVideoElement, createThumbnail, blurhashFromFile } from "./utils/media.js"
import { spaceChild, spaceParent, mscLocation, mscParent, mscMarkupMsgKey, mscPdfText, mscMediaFragment, mscPdfHighlight, populusHighlight } from "./constants.js"
import { processRegex } from './processRegex.js'
import { UserColor } from './utils/colors.js'
import { formatBytes } from './utils/math.js'
import { downloadBlob } from './utils/download.js'
import Client from './client.js'
import Modal from './modal.js'
import ToolTip from './utils/tooltip.js'
import AudioVisualizer from './audioVisualizer.js'
import * as PopupMenu from './popUpMenu.js'
import RoomSettings from './roomSettings.js'

export default class MessagePanel extends Component {
  constructor (props) {
    super(props)
    this.state = {
      mode: "Default",
      buttons: 1
    }
  }

  userColor = new UserColor(Client.client.getUserId())

  theInput = createRef()

  getInput () {
    const theProps = {
      ref: this.theInput,
      submit: this.submitCurrentInput,
      roomId: this.props.focus.getChild(),
      handlePending: this.openPendingAnnotation,
      done: this.setModeDefault
    }
    switch (this.state.mode) {
      case 'Default': return <TextMessageInput {...theProps} />
      case 'SendFile': return <FileUploadInput {...theProps} />
      case 'RecordVideo': return <RecordVideoInput {...theProps} />
      case 'RecordAudio': return <RecordAudioInput {...theProps} />
    }
  }

  setModeDefault = _ => this.setState({ mode: "Default" })

  setModeSendFile = _ => this.setState({ mode: "SendFile" })

  setModeRecordVideo = _ => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser looks like it doesn't support accessing the webcam...")
    } else this.setState({ mode: "RecordVideo" })
  }

  setModeRecordAudio = _ => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser looks like it doesn't support accessing the webcam...")
    } else this.setState({ mode: "RecordAudio" })
  }

  showMore = _ => this.setState({ buttons: this.state.buttons + 1 })

  showLess = _ => this.setState({ buttons: this.state.buttons - 1 })

  submitCurrentInput = _ => {
    if (this.theInput.current) this.theInput.current.submitInput()
    // need the conditional here because of occasional apparent timing issues with the callback
  }

  openPendingAnnotation = (theContent, eventInterface) => {
    const theDomain = Client.client.getDomain()
    if (this.props.focus.getStatus() === "pending") {
      const diff = {
        activityStatus: "open",
        rootEventId: eventInterface.event_id,
        rootContent: theContent
      }
      const highlightData = this.props.focus.location[mscPdfHighlight]
      const textData = this.props.focus.location[mscPdfText]
      const mediaFragmentData = this.props.focus.location[mscMediaFragment]
      const locationData = {
        // TODO should also set the content property of the msc highlight with fallback text
        [populusHighlight]: Object.assign(this.props.focus.location[populusHighlight], diff),
        ...(highlightData && {[mscPdfHighlight]: highlightData}),
        ...(textData && {[mscPdfText]: textData}),
        ...(mediaFragmentData && {[mscMediaFragment]: mediaFragmentData})
      }
      const newContent = { via: [theDomain], [mscLocation]: locationData }
      Client.client
        .sendStateEvent(this.props.resourceId, spaceChild, newContent, this.props.focus.getChild())
        .catch(e => alert(e))
      Client.client
        .sendStateEvent(this.props.focus.getChild(), spaceParent, newContent, this.props.resourceId)
        .catch(e => alert(e))
    }
  }

  sendSelection = async _ => {
    const locationData = this.props.generateLocation()
    const theContent = {
      body: "created an annotation",
      msgtype: "m.emote",
      [mscMarkupMsgKey]: { [mscParent]: this.props.resourceId, [mscLocation]: locationData }
    }
    const eventI = await Client.client.sendMessage(this.props.focus.getChild(), theContent)
    this.openPendingAnnotation(theContent, eventI)
  }

  openSettings = _ => {
    const theRoom = Client.client.getRoom(this.props.focus.getChild())
    Modal.set(<RoomSettings joinLink resource={this.props.resource} room={theRoom} />, "Room Settings", `for ${theRoom.name}`)
  }

  render(props, state) {
    const theRoom = Client.client.getRoom(props.focus.getChild())
    const userMember = theRoom?.getMember(Client.client.getUserId())
    const isAdmin = userMember ? userMember.powerLevel >= 100 : false
    if (theRoom && !theRoom.maySendMessage()) return <div id="message-panel-disabled">Read-only Discussion</div>
    return <div style={this.userColor.styleVariables} id="messageComposer">
      {this.getInput()}
      <div id="submit-button-wrapper">
        { state.mode === "Default"
          ? state.buttons === 1
            ? <Fragment>
                <button id="submitButton" onclick={this.submitCurrentInput}>Submit</button>
                <ToolTip key="record-audio" content="Record audio message">
                  <button onclick={this.setModeRecordAudio}>{Icons.mic}</button>
                </ToolTip>
                <ToolTip key="record-video" content="Record video message">
                  <button onclick={this.setModeRecordVideo}>{Icons.video}</button>
                </ToolTip>
                <ToolTip key="more-options" content="More options">
                  <button ref={this.showMoreButton} onclick={this.showMore}>{Icons.moreHorizontal}</button>
                </ToolTip>
            </Fragment>
            : <Fragment>
                <ToolTip key="more-options-2" content="More options">
                  <button ref={this.showLessButton} onclick={this.showLess}>{Icons.moreHorizontal}</button>
                </ToolTip>
                <ToolTip key="quote-highlighted" content="Quote highlighted">
                  <button id="quote-button" disabled={!props.hasSelection} onclick={this.sendSelection}>{Icons.quote}</button>
                </ToolTip>
                <ToolTip key="Upload-file" content="Upload file">
                  <button onclick={this.setModeSendFile}>{Icons.upload}</button>
                </ToolTip>
                {isAdmin
                  ? <ToolTip key="configure-room" content="Configure room settings">
                    <button onclick={this.openSettings}>{Icons.settings}</button>
                  </ToolTip>
                  : null
                }
            </Fragment>
          : <Fragment>
              <button id="submitButton" onclick={this.submitCurrentInput}>Submit</button>
              <button id="cancelButton" onclick={this.setModeDefault}>Cancel</button>
          </Fragment>
        }
      </div>
    </div>
  }
}

class FileUploadInput extends Component {

  componentDidMount() { this.fileLoader.current.click() }

  fileLoader = createRef()

  theForm = createRef()

  validateFile = _ => {
    const theFile = this.fileLoader.current.files[0]
    const limit = Client.mediaConfig["m.upload.size"]
    if (theFile.size >= limit) {
      alert(`Sorry, this file is too large to be uploaded. Your current server limits uploads to ${formatBytes(limit)}.`)
      this.props.done()
    } else if (/^video/.test(theFile.type)) {
      this.setState({
        previewUrl: URL.createObjectURL(this.fileLoader.current.files[0]),
        mediaType: "video",
      })
    } else if (/^image/.test(theFile.type)) {
      this.setState({
        previewUrl: URL.createObjectURL(this.fileLoader.current.files[0]),
        mediaType: "image",
      })
    } else {
      this.setState({ mediaType: "default" })
    }
  }

  submitInput = async _ => {
    if (this.state.mediaType) {
      switch (this.state.mediaType) {
        case "image": await this.submitImage(); break
        case "video": await this.submitVideo(); break
        case "default": await this.submitDefault(); break
      }
    }
    this.props.done()
  }

  submitDefault = async _ => {
    const theFile = this.fileLoader.current.files[0]
    const mxc = await Client.client.uploadContent(theFile, { progressHandler: this.progressHandler }).catch(e => console.log(e))
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
    const eventI = await Client.client.sendMessage(this.props.roomId, theContent)
    this.props.handlePending(theContent, eventI)
  }

  submitVideo = async _ => {
    const theVideo = this.fileLoader.current.files[0]
    window.theVideo = theVideo
    const videoElt = await loadVideoElement(theVideo)
    const thumbContent = await createThumbnail(videoElt, videoElt.videoWidth, videoElt.videoHeight, "image/jpeg")
    const thumbMxc = await Client.client.uploadContent(thumbContent.thumbnail, {
      name: `${theVideo.name}_800x600`,
      type: "image/jpeg",
      progressHandler: this.progressHandler
    })
    const blurhash = await blurhashFromFile(thumbContent.thumbnail)
    console.log("upload video")
    const videoMxc = await Client.client.uploadContent(theVideo, { progressHandler: this.progressHandler })
    const duration = Math.round(videoElt.duration * 1000)
    const theContent = {
      body: theVideo.name,
      info: {
        h: thumbContent.info.h,
        w: thumbContent.info.w,
        mimetype: theVideo.type,
        size: theVideo.size,
        blurhash,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbContent.info.thumbnail_info
      },
      msgtype: "m.video",
      url: videoMxc
    }
    if (duration < Infinity) theContent.duration = duration
    const eventI = await Client.client.sendMessage(this.props.roomId, theContent)
    this.props.handlePending(theContent, eventI)
  }

  submitImage = async _ => {
    const theImage = this.fileLoader.current.files[0]
    const {width, height, img} = await loadImageElement(theImage)
    const blurhash = await blurhashFromFile(theImage)
    const thumbType = theImage.type === "image/jpeg" ? "image/jpeg" : "image/png"
    const thumbContent = await createThumbnail(img, width, height, thumbType)
    const thumbMxc = await Client.client.uploadContent(thumbContent.thumbnail, {
      name: `${theImage.name}_800x600`,
      type: thumbType,
      progressHandler: this.progressHandler
    })
    const imageMxc = await Client.client.uploadContent(theImage, { progressHandler: this.progressHandler })
    const theContent = {
      body: theImage.name,
      info: {
        h: height,
        w: width,
        mimetype: theImage.type,
        size: theImage.size,
        blurhash,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbContent.info.thumbnail_info
      },
      msgtype: "m.image",
      url: imageMxc
    }
    const eventI = await Client.client.sendMessage(this.props.roomId, theContent)
    this.props.handlePending(theContent, eventI)
  }

  progressHandler = (progress) => this.setState({progress})

  render(props, state) {
    return <form ref={this.theForm}>
      <input id="file-uploader-input" ref={this.fileLoader} oninput={this.validateFile} type="file" />
      { state.mediaType === "video" 
        ? <video ref={this.mediaPreview} class="video-message-preview media-message-thumbnail" controls src={state.previewUrl} />
        : state.mediaType === "image"
        ? <img ref={this.mediaPreview} class="image-message-preview media-message-thumbnail" src={this.state.previewUrl} />
        : state.mediaType === "default"
        ? <div id="file-uploader-preview">
          <span>{Icons.file}</span>
          <span>{this.fileLoader.current.files[0].name}</span>
          <span>{formatBytes(this.fileLoader.current.files[0].size)} </span>
        </div>
        : null
      }
      {this.state.progress
        ? <div id="file-uploader-progress">
          <span>Uploading file</span>
          <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
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
    Client.client.sendTyping(this.props.roomId, true, 30000)
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
    Client.client.sendTyping(this.props.roomId, false)
  }

  handleInput = (event) => {
    if (event.target.value === "") this.stopTyping()
    this.setValue(event.target.value)
    this.currentInput.current.style.height = 'auto';
    this.currentInput.current.style.height = `${this.currentInput.current.scrollHeight}px`;
  }

  setValue = (value, cb) => this.setState({ value }, cb)

  handleKeydown = e => {
    e.stopPropagation() // don't propagate to global keypress handlers
    clearTimeout(this.typingTimeout)
    this.typingTimeout = setTimeout(_ => this.stopTyping(), 5000)
    // send "stopped typing" after 5 seconds of inactivity
    if (e.code === "Enter" && e.ctrlKey) {
      e.preventDefault()
      // the below is a bit indirect, but it lets us use a single method to
      // capture all the side-effects of sending the message
      this.props.submit()
    } else if (!this.typingLock) this.startTyping()
  }

  submitInput = _ => {
    if (this.props.roomId) {
      this.stopTyping()
      // don't send empty messages
      if (!this.state.value.replace(/\s/g, '').length) return
      // bail out of message is only whitespace
      const parsed = this.reader.parse(processRegex(this.state.value))
      const rendered = this.writer.render(parsed)
      const theContent = {
        body: this.state.value,
        msgtype: "m.text",
        format: "org.matrix.custom.html",
        formatted_body: rendered
      }
      Client.client.sendMessage(this.props.roomId, theContent).then(eventI => {
        this.props.handlePending(theContent, eventI)
      })
      this.currentInput.current.style.height = null
      this.setValue("")
    }
  }

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.roomId} {...props} />,
    ":": props => <PopupMenu.Emojis {...props} />
  }

  render (props, state) {
    return <Fragment>
      <PopupMenu.Menu
        textValue={state.value}
        textarea={this.currentInput}
        setTextValue={this.setValue}
        actions={this.popupActions}
      />
      <textarea ref={this.currentInput}
        value={state.value}
        onkeydown={this.handleKeydown}
        oninput={this.handleInput}
        onblur={this.stopTyping}
        data-gramm="false" // disable grammarly
      />
    </Fragment>
  }
}

class RecordMediaInput extends Component {
  componentDidMount () {
    this.initStream()
  }

  componentWillUnmount () {
    this.teardownStream()
  }

  mediaPreview = createRef()

  async initStream () {
    try {
      let initialized
      this.initialization = new Promise(resolve => { initialized = resolve })
      this.stream = await navigator.mediaDevices.getUserMedia(this.constraints)
      this.mediaPreview.current.srcObject = this.stream
      this.mediaRecorder = new MediaRecorder(this.stream, this.recorderOptions )
      this.mediaRecorder.ondataavailable = ev => {
        this.recordingBlob = ev.data
        const limit = Client.mediaConfig["m.upload.size"]
        if (this.recordingBlob.size > limit) {
          if(confirm(`Sorry, this recording is too large to be uploaded. Your current server limits uploads to ${formatBytes(limit)}. Would you like to save the recording locally?`)) {
            downloadBlob(this.recordingBlob, "populus-recording-toobig.webm", this.recorderOptions.mimetype)
          }
          this.setState({recording: null})
          this.initStream()
          return
        }
        this.setState({ recordingAvailable: true })
        this.mediaPreview.current.srcObject = null
        this.mediaPreview.current.setAttribute("controls", "")
        this.mediaPreview.current.src = URL.createObjectURL(ev.data)
      }
      initialized()
    } catch (err) {
      alert(err)
    }
  }

  async teardownStream () {
    await this.initialization
    this.stream.getTracks().forEach(track => track.stop())
  }

  countdownToRecord = async _ => {
    await this.initialization
    if (!this.state.countdown) this.setState({countdown: 3, recording: "countdown"})
    setTimeout(_ => {
      const newCount = this.state.countdown - 1
      this.setState({countdown: newCount})
      if (newCount === 0) return this.startRecord()
      this.countdownToRecord()
    }, 1500)
  }

  startRecord = _ => {
    this.mediaRecorder.start()
    this.setState({recording: "started"})
  }

  finishRecord = _ => {
    this.mediaRecorder.stop()
    this.teardownStream()
    this.setState({recording: "done"})
  }

  progressHandler = (progress) => this.setState({progress})

  recordingIcon = _ => {
    switch (this.state.recording) {
      case "started" : return <div aria-label="Stop recording" data-recording-state={this.state.recording} id={this.captionId}>{Icons.pause}</div>
      case "countdown" : return <div data-recording-state={this.state.recording} id={this.captionId}>{this.state.countdown}</div>
      case "done" : return null
      default : return <div aria-label="Start recording" data-recording-state={this.state.recording} id={this.captionId}>{this.icon}</div>
    }
  }

  clickHandler = () => {
    switch (this.state.recording) {
      case "started" : return this.finishRecord()
      case "countdown" : return null
      case "done" : return null
      default : return this.countdownToRecord()
    }
  }
}

class RecordVideoInput extends RecordMediaInput {
  constraints = {
    audio: true,
    video: { facingMode: "user" },
    uploading: ""
  }

  recorderOptions = {
    mimeType: "video/webm",
    videoBitsPerSecond: 1000000 // 1 mbps
  }

  icon = Icons.video

  captionId = "videoCaption"

  async submitInput () {
    if (this.state.recording === "done") {
      const videoElt = this.mediaPreview.current
      const thumbContent = await createThumbnail(videoElt, videoElt.videoWidth, videoElt.videoHeight, "image/jpeg")
      this.setState({uploading: "thumbnail"})
      const thumbMxc = await Client.client.uploadContent(thumbContent.thumbnail, {
        name: `${Client.client.getUserId()}_${Date.now()}_thumbnail`,
        type: "image/jpeg",
        progressHandler: this.progressHandler
      })
      const blurhash = await blurhashFromFile(thumbContent.thumbnail)
      this.setState({uploading: "video"})
      const videoMxc = await Client.client.uploadContent(this.recordingBlob, { progressHandler: this.progressHandler })
      this.setState({uploading: ""})
      const duration = Math.round(videoElt.duration * 1000)
      const theContent = {
        body: `${Client.client.getUserId()}_${Date.now()}`,
        info: {
          h: thumbContent.info.h,
          w: thumbContent.info.w,
          mimetype: "video/webm",
          size: this.recordingBlob.size,
          blurhash,
          thumbnail_url: thumbMxc,
          thumbnail_info: thumbContent.info.thumbnail_info
        },
        msgtype: "m.video",
        url: videoMxc
      }
      if (duration < Infinity) theContent.info.duration = duration
      const eventI = await Client.client.sendMessage(this.props.roomId, theContent)
      this.props.handlePending(theContent, eventI)
      this.props.done()
    } else alert("Before submitting, you need to record something.")
  }

  render(props, state) {
    return <div id="videoRecordingWrapper">
      <video autoplay
        onclick={this.clickHandler}
        muted={!(state.recording === "done")}
        ref={this.mediaPreview}
        class="video-message-preview media-message-thumbnail" />
      {this.recordingIcon()}
      {this.state.progress
        ? <div id="media-uploader-progress">
          <span>Uploading recording</span>
          <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
        </div>
        : null
      }
    </div>
  }
}

class RecordAudioInput extends RecordMediaInput {
  constraints = {
    audio: true,
    video: false
  }

  recorderOptions = { mimeType: "audio/webm" }

  icon = Icons.mic

  captionId = "audioCaption"

  async submitInput () {
    if (this.state.recording === "done") {
      const audioElt = this.mediaPreview.current
      const duration = Math.round(audioElt.duration * 1000)
      const audioMxc = await Client.client.uploadContent(this.recordingBlob, { progressHandler: this.progressHandler })
      const theContent = {
        body: `${Client.client.getUserId()}_${Date.now()}`,
        info: {
          mimetype: "audio/webm",
          size: this.recordingBlob.size
        },
        msgtype: "m.audio",
        url: audioMxc
      }
      if (duration < Infinity) theContent.info.duration = duration
      const eventI = await Client.client.sendMessage(this.props.roomId, theContent)
      this.props.handlePending(theContent, eventI)
      this.props.done()
    } else alert("Before submitting, you need to record something")
  }

  render(props, state) {
    return <Fragment>
      <div onclick={this.clickHandler} id="audioRecordingWrapper">
        <audio style={{display: state.recordingAvailable ? "block" : "none"}} ref={this.mediaPreview} />
        {state.recording === "started" ? <AudioVisualizer stream={this.stream} /> : null}
        {this.recordingIcon()}
      </div>
      {this.state.progress
        ? <div id="media-uploader-progress">
          <span>Uploading recording</span>
          <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
        </div>
        : null
      }
    </Fragment>
  }
}
