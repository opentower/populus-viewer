import * as Icons from "./icons.js"
import { h, createRef, Fragment, Component } from 'preact';
import * as CommonMark from 'commonmark'
import { loadImageElement, loadVideoElement, createThumbnail } from "./utils/media.js"
import { spaceChild, eventVersion } from "./constants.js"
import { addLatex } from './latex.js'
import UserColor from './userColors.js'
import Client from './client.js'
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
      focus: this.props.focus,
      handlePending: this.openPendingAnnotation,
      done: this.setModeDefault
    }
    switch (this.state.mode) {
      case 'Default': return <TextMessageInput {...theProps} />
      case 'SendFile': return <FileUploadInput {...theProps} />
      case 'SendMedia': return <MediaUploadInput {...theProps} />
      case 'RecordVideo': return <RecordVideoInput {...theProps} />
      case 'RecordAudio': return <RecordAudioInput {...theProps} />
    }
  }

  setModeDefault = _ => this.setState({ mode: "Default" })

  setModeSendFile = _ => this.setState({ mode: "SendFile" })

  setModeSendImage = _ => this.setState({ mode: "SendMedia" })

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
  }

  openPendingAnnotation = (theContent, eventInterface) => {
    const theDomain = Client.client.getDomain()
    if (this.props.focus.activityStatus === "pending") {
      const diff = {
        activityStatus: "open",
        rootEventId: eventInterface.event_id,
        rootContent: theContent
      }
      const childContent = {
        via: [theDomain],
        [eventVersion]: Object.assign(this.props.focus, diff)
      }
      console.log(childContent)
      Client.client
        .sendStateEvent(this.props.pdfId, spaceChild, childContent, this.props.focus.roomId)
        .catch(e => alert(e))
    }
  }

  openSettings = _ => {
    const theRoom = Client.client.getRoom(this.props.focus.roomId)
    this.props.populateModal(
      <RoomSettings
        populateModal={this.props.populateModal}
        room={theRoom}
      />)
  }

  render(props, state) {
    const theRoom = Client.client.getRoom(props.focus.roomId)
    const userMember = theRoom?.getMember(Client.client.getUserId())
    const isAdmin = userMember ? userMember.powerLevel >= 100 : false
    return <div style={this.userColor.styleVariables} id="messageComposer">
      {this.getInput()}
      <div id="submit-button-wrapper">
        { state.mode === "Default"
          ? <Fragment>
            { state.buttons === 1
              ? <Fragment>
                  <button id="submitButton" onclick={this.submitCurrentInput}>Submit</button>
                  <button title="upload file" onclick={this.setModeSendFile}>{Icons.upload}</button>
                  <button title="upload image" onclick={this.setModeSendImage}>{Icons.image}</button>
                  <button title="more options" onclick={this.showMore}>{Icons.moreHorizontal}</button>
              </Fragment>
              : <Fragment>
                  <button title="more options" onclick={this.showLess}>{Icons.moreHorizontal}</button>
                  <button title="record video message" onclick={this.setModeRecordVideo}>{Icons.video}</button>
                  <button title="record audio message" onclick={this.setModeRecordAudio}>{Icons.mic}</button>
                  {isAdmin ? <button title="configure room settings" onclick={this.openSettings}>{Icons.settings}</button> : null}
              </Fragment>
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
  fileLoader = createRef()

  theForm = createRef()

  submitInput = async _ => {
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
    const eventI = await Client.client.sendMessage(this.props.focus.roomId, theContent)
    this.props.handlePending(theContent, eventI)
    this.props.done()
  }

  progressHandler = (progress) => this.setState({progress})

  render() {
    return <form ref={this.theForm}>
      <input ref={this.fileLoader} type="file" />
      {this.state.progress
        ? <div id="pdfUploadFormProgress">
            <progress max={this.state.progress.total} value={this.state.progress.loaded} />
        </div>
        : null
      }
    </form>
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
    let theContent
    if (this.mediaPreview.current) {
      switch (this.state.mediaType) {
        case "image": theContent = await this.submitImage(); break
        case "video": theContent = await this.submitVideo(); break
      }
    }
    this.props.done()
  }

  async submitVideo () {
    const theVideo = this.mediaLoader.current.files[0]
    // TODO: reject non-media mimetypes
    const videoElt = await loadVideoElement(theVideo)
    const thumbContent = await createThumbnail(videoElt, videoElt.videoWidth, videoElt.videoHeight, "image/jpeg")
    const thumbMxc = await Client.client.uploadContent(thumbContent.thumbnail, {
      name: `${theVideo.name}_800x600`,
      type: "image/jpeg",
      progressHandler: this.progressHandler
    })
    const videoMxc = await Client.client.uploadContent(theVideo, { progressHandler: this.progressHandler })
    const duration = Math.round(videoElt.duration * 1000)
    const theContent = {
      body: theVideo.name,
      info: {
        h: thumbContent.info.h,
        w: thumbContent.info.w,
        mimetype: theVideo.type,
        size: theVideo.size,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbContent.info.thumbnail_info
      },
      msgtype: "m.video",
      url: videoMxc
    }
    if (duration < Infinity) theContent.duration = duration
    const eventI = await Client.client.sendMessage(this.props.focus.roomId, theContent)
    this.props.handlePending(theContent, eventI)
  }

  async submitImage () {
    const theImage = this.mediaLoader.current.files[0]
    // TODO: reject non-media mimetypes
    const {width, height, img} = await loadImageElement(theImage)
    const thumbType = theImage.type === "image/jpeg" ? "image/jpeg" : "image/png"
    const thumbInfo = await createThumbnail(img, width, height, thumbType)
    const thumbMxc = await Client.client.uploadContent(thumbInfo.thumbnail, {
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
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbInfo.thumbnail_info
      },
      msgtype: "m.image",
      url: imageMxc
    }
    const eventI = await Client.client.sendMessage(this.props.focus.roomId, theContent)
    this.props.handlePending(theContent, eventI)
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
    Client.client.sendTyping(this.props.focus.roomId, true, 30000)
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
    Client.client.sendTyping(this.props.focus.roomId, false)
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
    if (this.props.focus.roomId) {
      this.stopTyping()
      // don't send empty messages
      if (!this.state.value.replace(/\s/g, '').length) return
      // bail out of message is only whitespace
      const parsed = this.reader.parse(addLatex(this.state.value))
      const rendered = this.writer.render(parsed)
      const theContent = {
        body: this.state.value,
        msgtype: "m.text",
        format: "org.matrix.custom.html",
        formatted_body: rendered
      }
      Client.client.sendMessage(this.props.focus.roomId, theContent).then(eventI => {
        this.props.handlePending(theContent, eventI)
      })
      this.currentInput.current.style.height = null
      this.setValue("")
    }
  }

  popupActions = {
    "@": props => <PopupMenu.Members roomId={this.props.focus.roomId} {...props} />,
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
        this.setState({ audioAvailable: true })
        this.recordingBlob = ev.data
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
      case "started" : return <div title="stop recording" data-recording-state={this.state.recording} id={this.captionId}>{Icons.pause}</div>
      case "countdown" : return <div data-recording-state={this.state.recording} id={this.captionId}>{this.state.countdown}</div>
      case "done" : return null
      case undefined : return <div title="start recording" data-recording-state={this.state.recording} id={this.captionId}>{this.icon}</div>
    }
  }

  clickHandler = () => {
    switch (this.state.recording) {
      case "started" : return this.finishRecord()
      case "countdown" : return null
      case "done" : return null
      case undefined : return this.countdownToRecord()
    }
  }
}

class RecordVideoInput extends RecordMediaInput {
  constraints = {
    audio: true,
    video: { facingMode: "user" }
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
      const thumbMxc = await Client.client.uploadContent(thumbContent.thumbnail, {
        name: `${Client.client.getUserId()}_${Date.now()}_thumbnail`,
        type: "image/jpeg",
        progressHandler: this.progressHandler
      })
      const videoMxc = await Client.client.uploadContent(this.recordingBlob, { progressHandler: this.progressHandler })
      const duration = Math.round(videoElt.duration * 1000)
      const theContent = {
        body: `${Client.client.getUserId()}_${Date.now()}`,
        info: {
          h: thumbContent.info.h,
          w: thumbContent.info.w,
          mimetype: "video/webm",
          size: this.recordingBlob.size,
          thumbnail_url: thumbMxc,
          thumbnail_info: thumbContent.info.thumbnail_info
        },
        msgtype: "m.video",
        url: videoMxc
      }
      if (duration < Infinity) theContent.info.duration = duration
      const eventI = await Client.client.sendMessage(this.props.focus.roomId, theContent)
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
        class="mediaMessageThumbnail" />
      {this.recordingIcon()}
      {state.progress
        ? <div id="pdfUploadFormProgress">
          <span>{state.progress.loaded}</span>
          <span>/</span>
          <span>{state.progress.total} bytes</span>
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
      const eventI = await Client.client.sendMessage(this.props.focus.roomId, theContent)
      this.props.handlePending(theContent, eventI)
      this.props.done()
    } else alert("Before submitting, you need to record something")
  }

  render(props, state) {
    return <Fragment>
      <div onclick={this.clickHandler} id="audioRecordingWrapper">
        <audio style={{display: state.audioAvailable ? "block" : "none"}} ref={this.mediaPreview} />
        {state.recording === "started" ? <AudioVisualizer stream={this.stream} /> : null}
        {this.recordingIcon()}
      </div>
      {state.progress
        ? <div id="pdfUploadFormProgress">
          <span>{state.progress.loaded}</span>
          <span>/</span>
          <span>{state.progress.total} bytes</span>
        </div>
        : null
      }
    </Fragment>
  }
}
