import { h, createRef, Component, Fragment } from 'preact';
import './styles/fileUpload.css'
import { mscResourceData, spaceChild, populusWaveformPCM } from "./constants.js"
import { onlineOrAlert } from "./utils/alerts.js"
import PdfCanvas from "./pdfCanvas.js"
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import WaveSurfer from 'wavesurfer.js'
import ToolTip from "./utils/tooltip.js"
import AvatarSelector from "./avatarSelector.js"
import { UserColor } from "./utils/colors.js"
import { formatBytes , mulberry32, hashString } from './utils/math.js'
import * as Icons from './icons.js'
import Client from './client.js'

export default class FileUpload extends Component {
  constructor(props) {
    super(props)
    this.state = {
      querying: false,
      aliasAvailable: false,
      fileValid: false,
      name: "",
      alias: "",
      details: false
    }
  }

  namingTimeout = null

  mainForm = createRef()

  fileLoader = createRef()

  roomNameInput = createRef()

  roomAliasInput = createRef()

  roomTopicInput = createRef()

  avatarSelector = createRef()

  submitButton = createRef()

  uploadPreview = createRef()

  progressHandler = (progress) => this.setState({progress})

  keydownHandler = e => e.stopPropagation()

  chooseFile = _ => this.fileLoader.current.click()

  clearFile = _ => this.setState({fileValid:false}, this.fileLoader.current.reset)

  nameInputHandler = e => {
    e.stopPropagation()
    this.setState({name: e.target.value}, this.validateAlias)
  }

  topicInputHandler = e => {
    e.stopPropagation()
    this.roomTopicInput.current.style.height = "auto"
    this.roomTopicInput.current.style.height = `${this.roomTopicInput.current.scrollHeight}px`;
  }

  handleToggle = _ => this.setState(oldState => { return { details: !oldState.details } })

  aliasInputHandler = e => {
    e.stopPropagation()
    this.setState({alias: this.toAlias(e.target.value)}, this.validateAlias)
  }

  validateAlias = _ => {
    clearTimeout(this.namingTimeout)
    this.setState({querying: true})
    const alias = this.state.alias.length > 0 ? this.state.alias : this.toAlias(this.state.name)
    this.namingTimeout = setTimeout(_ => {
      Client.client.getRoomIdForAlias(`#${alias}:${Client.client.getDomain()}`)
        .then(_ => this.setState({querying: false, aliasAvailable: false}))
        .catch(err => {
          if (alias === "") this.setState({querying: false, aliasAvailable: false})
          else if (err.errcode === "M_NOT_FOUND") this.setState({querying: false, aliasAvailable: true})
          else alert(err)
        })
    }, 1000)
  }

  validateFile = _ => {
    const theFile = this.fileLoader.current.files[0]
    const limit = Client.mediaConfig["m.upload.size"]
    let fileValid = false
    switch (theFile.type) {
      case "application/pdf" : fileValid = true
      case "audio/wav"    : fileValid = true
      case "audio/mpeg"   : fileValid = true
      case "audio/mp4"    : fileValid = true
      case "audio/x-m4a"  : fileValid = true
      case "audio/aac"    : fileValid = true
      case "audio/aacp"   : fileValid = true
      case "audio/flac"   : fileValid = true
      case "video/mp4"    : fileValid = true
      case "video/mpeg"   : fileValid = true
      case "video/webm"   : fileValid = true
    }
    if (theFile.type?.match(/^image/)) fileValid = true
    if (theFile.size >= limit ) fileValid = false
    this.setState({fileValid})
    if (!fileValid) {
      if (theFile.size >= limit) alert(`Sorry, this file is too large to be uploaded. Your current server limits uploads to ${formatBytes(limit)}.`)
      else alert("Please make sure that the file you're uploading is of a supported filetype and has the right extension at the end of its name. Supported filetypes are: pdf, wav, mp3, mp4, m4a, aac, mpeg, webm, and flac.")
      this.mainForm.current.reset()
    }
  }

  toAlias(s) {
    // replace forbidden characters
    return s.replace(/[\s:]/g, '_')
  }

  uploadFile = async e => {
    e.preventDefault()
    if (!onlineOrAlert()) return
    const theFile = this.fileLoader.current.files[0]
    const theName = this.state.name
    const theAlias = this.state.alias.length > 0 ? this.state.alias : this.toAlias(this.state.name)
    const theTopic = this.roomTopicInput.current.value
    let waveformMxc
    if (this.uploadPreview?.current?.pcm) {
      waveformMxc = await Client.client.uploadContent(JSON.stringify(this.uploadPreview?.current?.pcm), { progressHandler: this.progressHandler })
        .catch(alert)
    }
    const mxc = await Client.client.uploadContent(theFile, { progressHandler: this.progressHandler })
      .catch(alert)
    this.submitButton.current.setAttribute("disabled", true)
    const { room_id } = await Client.client.createRoom({
      room_alias_name: theAlias,
      visibility: "private",
      name: theName,
      topic: theTopic,
      // We declare the room a space
      creation_content: {
        type: "m.space",
        [mscResourceData]: {
          "m.file": {
            url: mxc,
            name: theFile.name,
            mimetype: theFile.type,
            size: theFile.size
          }
        }
      },
      initial_state: [
        // we allow anyone to join, by default, for now
        {
          type: Matrix.EventType.RoomJoinRules,
          state_key: "",
          content: {join_rule: "public"}
        },
        ...(waveformMxc 
          ? [{
            type: populusWaveformPCM,
            state_key: "",
            content: {mxc: waveformMxc},
          }] 
          : []
        )
      ],
      power_level_content_override: {
        events: {
          // we allow anyone to annotate, by default, for now
          [spaceChild]: 0
        }
      }
    }).catch(alert)
    // make sure we've got the room before returning to the main view
    const theRoom = await Client.client.getRoomWithState(room_id)
    await this.avatarSelector.current.uploadAvatar(theRoom)
    this.mainForm.current.reset()
    this.props.showMainView()
  }

  render (_, state) {
    return <div id="file-upload">
      <h2> Upload a new file</h2>
      <hr class="styled-rule" />
      { state.fileValid 
        ? <Fragment>
          <FileUploadPreview uploadPreview={this.uploadPreview} file={this.fileLoader.current.files[0]} /> 
          <hr class="styled-rule" />
        </Fragment>
        : null
      }
      <form id="file-upload-form" ref={this.mainForm} onsubmit={this.uploadFile}>
        <label for="file"> File to Discuss</label>
        <div id="file-upload-chooser"> {state.fileValid 
            ? <Fragment>
              <span>{this.fileLoader.current.files[0].name}</span>
              <button type="button" onclick={this.clearFile} class="small-icon">{Icons.close}</button>
            </Fragment>
            : <button type="button" class="styled-button" onclick={this.chooseFile}>Click to Choose a File</button>
          }
          <input name="file"
            oninput={this.validateFile}
            ref={this.fileLoader}
            accept="application/pdf, audio/wav, audio/mpeg, audio/x-m4a, audio/mp4, audio/aac, audio/aacp, audio/flac, video/mp4, video/mpeg, video/webm, image/*"
            type="file"
          />
        </div>
        <div class="file-upload-form-detail">
          { state.fileValid
            ? formatBytes(this.fileLoader.current.files[0].size)
            : <span>&nbsp;</span>
          }
        </div>
        <label for="discussion" >Name for Discussion</label>
        <input class="styled-input" 
          name="discussion" 
          value={state.name} 
          onkeydown={this.keydownHandler} 
          oninput={this.nameInputHandler} 
          ref={this.roomNameInput} type="text" 
        />
        {state.details
          ? null
          : <div class="file-upload-form-detail">{
            state.querying
              ? "querying..."
              : state.aliasAvailable
                ? "name available"
                : "name unavailable"
            }
          </div>
        }
        <label class="top-aligned-label" for="topic">Room Avatar</label>
        <AvatarSelector 
          ref={this.avatarSelector} 
          progressHandler={this.progressHandler}
        />
        <div class="file-upload-form-detail">Add an image to display with this discussion</div>
        <label class="top-aligned-label" for="topic">Topic of Discussion</label>
        <textarea
          class="styled-input"
          name="topic"
          onkeydown={this.keydownHandler}
          oninput={this.topicInputHandler} 
          ref={this.roomTopicInput}
          type="text"
          data-gramm="false" // disable grammarly
        />
        <details open={state.details} ontoggle={this.handleToggle}>
          <summary>Advanced Settings</summary>
          <div class="file-upload-details-wrapper">
            <label for="discussion" >Canonical Alias</label>
            <input name="discussion" value={state.alias} placeholder={this.toAlias(state.name)} oninput={this.aliasInputHandler} ref={this.roomAliasInput} type="text" />
            {!state.details
              ? null
              : <div class="file-upload-form-detail">{
                state.querying
                  ? "querying..."
                  : state.aliasAvailable
                    ? "alias available"
                    : "alias unavailable"
                }
              </div>
            }
          </div>
        </details>
        <div id="file-upload-form-submit">
          <button disabled={state.progress || state.querying || !state.aliasAvailable || !state.fileValid} class="styled-button" ref={this.submitButton} type="submit">
            { state.progress ? "Uploading..." : "Create Discussion" }
          </button>
        </div>
        {state.progress
          ? <div id="file-upload-form-progress">
            <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
          </div>
          : null
        }
      </form>
    </div>
  }
}

class FileUploadPreview extends Component {
  render(props) {
    if (props.file.type === "application/pdf") return <PdfUploadPreview ref={props.uploadPreview} key={props.file.name} file={props.file} />
    if (props.file.type.match(/^image/)) return <ImageUploadPreview ref={props.uploadPreview} key={props.file.name} file={props.file} />
    if (props.file.type.match(/^audio|^video/)) return <MediaUploadPreview ref={props.uploadPreview} key={props.file.name} file={props.file} />
    return <GenericUploadPreview ref={props.uploadPreview} file={props.file}/>
  }
}

class PdfUploadPreview extends Component {
  constructor(props) {
    super(props)
    this.userColor = new UserColor(Client.client.getUserId())
    this.pdfUrl = URL.createObjectURL(this.props.file)
    this.state = { 
      pdfPromise: PDFJS.getDocument(this.pdfUrl).promise,
      pdfPage: 1
    }
  }

  async componentDidMount() { 
    const pdf = await this.state.pdfPromise
    this.setState({totalPages: pdf.numPages}) 
  }

  componentWillUnmount() { URL.revokeObjectURL(this.pdfUrl) }

  textLayer = createRef()

  nextPage = _ => { 
    if (this.state.pdfPage < this.state.totalPages) this.setState(oldState => { return {pdfPage: oldState.pdfPage + 1} })
  }
  
  prevPage = _ => {
    if (this.state.pdfPage > 1) this.setState(oldState => { return {pdfPage: oldState.pdfPage - 1} })
  }

  setPdfDimensions = (pdfHeightPx, pdfWidthPx) => this.setState({pdfWidthPx, pdfHeightPx})

  setPdfFitRatio = pdfFitRatio => this.setState({pdfFitRatio})

  render(props, state) {
    const dynamicDocumentStyle = {
      "--pdfFitRatio": state.pdfFitRatio,
      "--pdfWidthPx": `${state.pdfWidthPx}px`,
      "--pdfHeightPx": `${state.pdfHeightPx}px`,
      "--selectColor": this.userColor.solid,
    }
    return <div id="pdf-upload-preview">
        <div id="pdf-upload-preview-outer-wrapper" style={dynamicDocumentStyle}>
          <div id="pdf-upload-preview-wrapper" style={dynamicDocumentStyle}>
          <PdfCanvas
            pdfScale={1}
            setPdfDimensions={this.setPdfDimensions}
            setPdfFitRatio={this.setPdfFitRatio}
            hasFetched={true}
            pdfPromise={state.pdfPromise}
            textLayer={this.textLayer}
            pageFocused={state.pdfPage}
            setPdfLoadingStatus={_ => {}}
          />
        </div>
      </div>
      <div id="pdf-upload-preview-controls">
        <button onClick={this.prevPage} id="document-preview-prev">{Icons.chevronLeft}</button>
        <button onClick={this.nextPage} id="document-preview-next">{Icons.chevronRight}</button>
      </div>
    </div>
  }
}

class MediaUploadPreview extends Component {
  constructor(props) {
    super(props)
    this.state = {playing: false}
    this.mediaUrl = URL.createObjectURL(props.file)
    this.isVideo = props.file.type.match(/^video/)
  }

  componentDidMount() {
    const pcm = []
    const prng = mulberry32(hashString(this.props.file.name))
    if (this.isVideo) this.videoElement.current.src = this.mediaUrl
    for (let i = 0; i < 2048; i++) pcm.push((prng() * 2) - 1)
    this.wavesurfer = new WaveSurfer.create({
      container: '#media-upload-preview-waveform',
      backend: 'MediaElement',
      barWidth: 5,
      scrollParent: true,
    })
    this.wavesurfer.on('scroll', e => { 
      if (Math.abs(this.lastLeft - e.target.scrollLeft) > 25) {
        this.wavesurfer.drawer.params.autoCenter = false;
      } else {
        this.lastLeft = e.target.scrollLeft
      }
    })
    this.wavesurfer.load(this.videoElement.current || this.mediaUrl, pcm)
  }

  componentWillUnmount() { 
    if (this.wavesurfer) this.wavesurfer.destroy()
    URL.revokeObjectURL(this.mediaUrl) 
  }

  videoElement = createRef()

  generatePeaks = _ => {
    if (!confirm("Warning: this operation is memory intensive, and may not work well on mobile devices. Continue?")) return
    this.wavesurfer.once('waveform-ready', _ => {
      this.wavesurfer.exportPCM(this.wavesurfer.getDuration() * 6,10000,true).then(pcm => {
        this.pcm = pcm
        setTimeout(_ => {
          this.wavesurfer.load(this.videoElement.current || this.mediaUrl, this.pcm), 1000
        })
      })
    })
    this.wavesurfer.load(this.videoElement.current || this.mediaUrl)
  }

  playPause = _ => {
    if (this.state.playing) {
      this.setState({playing:false})
      this.wavesurfer.pause()
    } else {
      this.wavesurfer.seekAndCenter(this.wavesurfer.getCurrentTime() / this.wavesurfer.getDuration() )
      //setting lastLeft is necessary to prevent the jump from canceling autocenter
      this.lastLeft = this.wavesurfer.drawer.wrapper.scrollLeft
      this.wavesurfer.drawer.params.autoCenter = true
      this.wavesurfer.play()
      this.setState({playing:true})
    }
  }

  render(_props, state) {
    return <div id="media-upload-preview">
      {this.isVideo ? <video ref={this.videoElement} /> : null}
      <div id="media-upload-preview-waveform">
      </div>
      <div id="media-upload-preview-controls">
        <ToolTip content={state.playing ? "Pause preview" : "Play preview" }>
          <button onClick={this.playPause}>{state.playing ? Icons.pauseButton : Icons.playButton }</button>
        </ToolTip>
        <ToolTip content={"Improve waveform"}>
          <button onClick={this.generatePeaks}>{Icons.waveform}</button>
        </ToolTip>
      </div>
    </div>
  }
}

class ImageUploadPreview extends Component {
  constructor(props) {
    super(props)
    this.imageUrl = URL.createObjectURL(this.props.file)
  }

  componentWillUnmount() { 
    URL.revokeObjectURL(this.imageUrl) 
  }

  render() {
    return <div id="image-upload-preview">
      <img src={this.imageUrl} />
    </div>
  }
}

class GenericUploadPreview extends Component {
  render(props) {
    return <div id="generic-upload-preview">
      <span>{Icons.file}</span>{props.file.name} : {props.file.size} bytes
    </div>
  }
}
