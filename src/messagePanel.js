import * as Icons from "./icons.js"
import { h, createRef, Fragment, Component } from 'preact';
import * as CommonMark from 'commonmark'
import { loadImageElement, loadVideoElement, createThumbnail } from "./utils/media.js"
import { addLatex } from './latex.js'
import UserColor from './userColors.js'

export default class MessagePanel extends Component {
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

  setModeRecordVideo = _ => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser looks like it doesn't support accessing the webcam...")
    } else this.setState({ mode: "RecordVideo" })
  }

  showMore = _ => this.setState({ buttons: this.state.buttons + 1 })

  showLess = _ => this.setState({ buttons: this.state.buttons - 1 })

  submitCurrentInput = _ => {
    if (this.theInput.current) this.theInput.current.submitInput()
    else console.log("no available input")
  }

  render(props, state) {
    return <div style={this.userColor.styleVariables} id="messageComposer">
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
    </div>
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
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.mediaPreview.current.srcObject = this.stream
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: "video/webm",
        videoBitsPerSecond: 1000000 // 1 mbps
      })
      this.mediaRecorder.ondataavailable = ev => {
        this.recordingBlob = ev.data
        this.mediaPreview.current.srcObject = null
        this.mediaPreview.current.setAttribute("controls", "")
        this.mediaPreview.current.src = URL.createObjectURL(ev.data)
      }
    } catch (err) {
      alert(err)
    }
  }

  countdownToRecord = _ => {
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
    this.setState({recording: "done"})
  }

  async submitInput () {
    const videoElt = this.mediaPreview.current
    const thumbInfo = await createThumbnail(videoElt, videoElt.videoWidth, videoElt.videoHeight, "image/jpeg")
    const thumbMxc = await this.props.client.uploadContent(thumbInfo.thumbnail, {
      name: `${this.props.client.getUserId()}_${Date.now()}_thumbnail`,
      type: "image/jpeg",
      progressHandler: this.progressHandler
    })
    const videoMxc = await this.props.client.uploadContent(this.recordingBlob, { progressHandler: this.progressHandler })
    const duration = Math.round(videoElt.duration * 1000)
    const theContent = {
      body: `${this.props.client.getUserId()}_${Date.now()}`,
      info: {
        h: thumbInfo.h,
        w: thumbInfo.w,
        mimetype: "video/webm",
        size: this.recordingBlob.size,
        thumbnail_url: thumbMxc,
        thumbnail_info: thumbInfo.thumbnail_info
      },
      msgtype: "m.video",
      url: videoMxc
    }
    if (duration < Infinity) theContent.duration = duration
    await this.props.client.sendMessage(this.props.focus.roomId, theContent)
    this.props.done()
  }

  progressHandler = (progress) => this.setState({progress})

  clickHandler = () => {
    switch (this.state.recording) {
      case "started" : return this.finishRecord()
      case "countdown" : return null
      case "done" : return null
      case undefined : return this.countdownToRecord()
    }
  }

  recordingIcon = _ => {
    switch (this.state.recording) {
      case "started" : return <div data-recording-state={this.state.recording} id="videoCaption">{Icons.pause}</div>
      case "countdown" : return <div data-recording-state={this.state.recording} id="videoCaption">{this.state.countdown}</div>
      case "done" : return null
      case undefined : return <div data-recording-state={this.state.recording} id="videoCaption">{Icons.video}</div>
    }
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
          <span>{this.state.progress.loaded}</span>
          <span>/</span>
          <span>{this.state.progress.total} bytes</span>
        </div>
        : null
      }
    </div>
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
