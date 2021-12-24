import { h, createRef, Component } from 'preact';
import './styles/pdfUpload.css'
import { resourceData, spaceChild } from "./constants.js"
import Client from './client.js'

export default class PdfUpload extends Component {
  constructor(props) {
    super(props)
    this.state = {
      querying: false,
      nameavailable: false,
      pdfvalid: false
    }
  }

  namingTimeout = null

  mainForm = createRef()

  fileLoader = createRef()

  roomNameInput = createRef()

  roomTopicInput = createRef()

  submitButton = createRef()

  progressHandler = (progress) => this.setState({progress})

  keydownHandler = e => e.stopPropagation()

  validateName = _ => {
    clearTimeout(this.namingTimeout)
    this.setState({querying: true})
    this.namingTimeout = setTimeout(_ => {
      Client.client.getRoomIdForAlias(`#${this.toAlias(this.roomNameInput.current.value)}:${Client.client.getDomain()}`)
        .then(_ => this.setState({querying: false, nameavailable: false}))
        .catch(err => {
          if (this.roomNameInput.current.value === "") this.setState({querying: false, nameavailable: false})
          else if (err.errcode === "M_NOT_FOUND") this.setState({querying: false, nameavailable: true})
          else alert(err)
        })
    }, 1000)
  }

  validatePdf = _ => {
    const theFile = this.fileLoader.current.files[0]
    if (theFile.type === "application/pdf") this.setState({pdfvalid: true})
    else {
      this.setState({pdfvalid: false})
      alert("Please make sure that the file you're uploading is a pdf.")
      this.mainForm.current.reset()
    }
  }

  toAlias(s) {
    // replace forbidden characters
    return s.replace(/[\s:]/g, '_')
  }

  uploadFile = async e => {
    e.preventDefault()
    const theFile = this.fileLoader.current.files[0]
    const theName = this.roomNameInput.current.value
    const theAlias = this.toAlias(theName)
    const theTopic = this.roomTopicInput.current.value
    const mxc = await Client.client.uploadContent(theFile, { progressHandler: this.progressHandler })
    this.submitButton.current.setAttribute("disabled", true)
    await Client.client.createRoom({
      room_alias_name: theAlias,
      visibility: "private",
      name: theName,
      topic: theTopic,
      // We declare the room a space
      creation_content: {
        type: "m.space",
        [resourceData]: {
          "m.file": {
            url: mxc,
            name: theFile.name,
            mimetype: "application/pdf",
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
    }).catch(e => { alert(e); })
    this.mainForm.current.reset()
    this.props.showMainView()
  }

  render (_, state) {
    return <form id="pdfUploadForm" ref={this.mainForm} onsubmit={this.uploadFile}>
      <label> Pdf to discuss</label>
      <input oninput={this.validatePdf} ref={this.fileLoader} accept="application/pdf" type="file" />
      <label>Name for Discussion</label>
      <input onkeydown={this.keydownHandler} oninput={this.validateName} ref={this.roomNameInput} type="text" />
      <div class="pdfupload-form-detail">{
        state.querying
          ? "querying..."
          : state.nameavailable
            ? "name available"
            : "name unavailable"
        }
      </div>
      <label>Topic of Discussion</label>
      <textarea
        onkeydown={this.keydownHandler}
        ref={this.roomTopicInput}
        type="text"
        data-gramm="false" // disable grammarly
      />
      <div id="pdfUploadFormSubmit">
        <button disabled={state.progress || state.querying || !state.nameavailable || !state.pdfvalid} class="styled-button" ref={this.submitButton} type="submit">
          { state.progress ? "Uploading..." : "Create Discussion" }
        </button>
      </div>
      {state.progress
        ? <div id="pdfUploadFormProgress">
          <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
        </div>
        : null
      }
    </form>
  }
}
