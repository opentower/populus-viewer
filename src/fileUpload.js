import { h, createRef, Component, Fragment } from 'preact';
import './styles/fileUpload.css'
import { mscResourceData, spaceChild } from "./constants.js"
import { onlineOrAlert } from "./utils/alerts.js"
import PdfCanvas from "./pdfCanvas.js"
import * as PDFJS from "pdfjs-dist/webpack"
import { UserColor } from "./utils/colors.js"
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

  submitButton = createRef()

  progressHandler = (progress) => this.setState({progress})

  keydownHandler = e => e.stopPropagation()

  nameInputHandler = e => {
    e.stopPropagation()
    this.setState({name: e.target.value}, this.validateAlias)
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
    this.setState({fileValid})
    if (!fileValid) {
      alert("Please make sure that the file you're uploading is of a supported filetype and has the right extension at the end of its name. Supported filetypes are: pdf, wav, mp3, mp4, m4a, aac, mpeg, webm, and flac.")
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
          type: "m.room.join_rules",
          state_key: "",
          content: {join_rule: "public"}
        }
      ],
      power_level_content_override: {
        events: {
          // we allow anyone to annotate, by default, for now
          [spaceChild]: 0
        }
      }
    }).catch(alert)
    // make sure we've got the room before returning to the main view
    await Client.client.getRoomWithState(room_id)
    this.mainForm.current.reset()
    this.props.showMainView()
  }

  render (_, state) {
    return <div id="file-upload">
      <h2> Upload a new file</h2>
      <hr class="styled-rule" />
      { state.fileValid 
        ? <Fragment>
          <FileUploadPreview file={this.fileLoader.current.files[0]} /> 
          <hr class="styled-rule" />
        </Fragment>
        : null
      }
      <form id="file-upload-form" ref={this.mainForm} onsubmit={this.uploadFile}>
        <label for="file"> File to Discuss</label>
        <input name="file"
          oninput={this.validateFile}
          ref={this.fileLoader}
          accept="application/pdf, audio/wav, audio/mpeg, audio/x-m4a, audio/mp4, audio/aac, audio/aacp, audio/flac, video/mp4, video/mpeg, video/webm"
          type="file"
        />
        <label for="discussion" >Name for Discussion</label>
        <input name="discussion" value={state.name} onkeydown={this.keydownHandler} oninput={this.nameInputHandler} ref={this.roomNameInput} type="text" />
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
        <label for="topic">Topic of Discussion</label>
        <textarea
          name="topic"
          onkeydown={this.keydownHandler}
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
    if (props.file.type === "application/pdf") return <PdfUploadPreview key={props.file.name} file={props.file} />
    // if (props.file.type.match(/^audio|^video/)) return <MediaUploadPreview file={props.file} />
    return <GenericUploadPreview file={props.file}/>
  }
}

class PdfUploadPreview extends Component {
  constructor(props) {
    super(props)
    this.userColor = new UserColor(Client.client.getUserId())
    const pdfUrl = URL.createObjectURL(this.props.file)
    this.state = { pdfPromise: PDFJS.getDocument(pdfUrl).promise }
  }

  componentDidMount() { this.setState({}) }

  textLayer = createRef()

  setPdfDimensions = (pdfHeightPx, pdfWidthPx) => this.setState({pdfWidthPx, pdfHeightPx})

  setPdfFitRatio = pdfFitRatio => this.setState({pdfFitRatio})

  setTotalPages = totalPages => this.setState({totalPages})

  render(props, state) {
    const dynamicDocumentStyle = {
      "--pdfFitRatio": state.pdfFitRatio,
      "--pdfWidthPx": `${state.pdfWidthPx}px`,
      "--pdfHeightPx": `${state.pdfHeightPx}px`,
      "--selectColor": this.userColor.solid,
    }
    return <div id="pdf-upload-preview">
        <div id="pdf-upload-preview-wrapper" style={dynamicDocumentStyle}>
        <PdfCanvas
          pdfScale={1}
          setPdfDimensions={this.setPdfDimensions}
          setPdfFitRatio={this.setPdfFitRatio}
          hasFetched={true}
          pdfPromise={state.pdfPromise}
          textLayer={this.textLayer}
          pageFocused={1}
          setPdfLoadingStatus={_ => {}}
        />
      </div>
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
