import { h, createRef, Component } from 'preact';
import './styles/pdfUpload.css'
import { mscResourceData, spaceChild } from "./constants.js"
import Client from './client.js'

export default class PdfUpload extends Component {
  constructor(props) {
    super(props)
    this.state = {
      querying: false,
      aliasAvailable: false,
      pdfvalid: false,
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
    const theName = this.state.name
    const theAlias = this.state.alias.length > 0 ? this.state.alias : this.toAlias(this.state.name)
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
        [mscResourceData]: {
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
    return <div id="pdf-upload">
      <h2> Upload a new PDF</h2>
      <form id="pdfUploadForm" ref={this.mainForm} onsubmit={this.uploadFile}>
        <label for="pdf"> Pdf to discuss</label>
        <input name="pdf" oninput={this.validatePdf} ref={this.fileLoader} accept="application/pdf" type="file" />
        <label for="discussion" >Name for Discussion</label>
        <input name="discussion" value={state.name} onkeydown={this.keydownHandler} oninput={this.nameInputHandler} ref={this.roomNameInput} type="text" />
        {state.details
          ? null
          : <div class="pdfupload-form-detail">{
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
          <div class="pdfupload-details-wrapper">
            <label for="discussion" >Canonical Alias</label>
            <input name="discussion" value={state.alias} placeholder={this.toAlias(state.name)} oninput={this.aliasInputHandler} ref={this.roomAliasInput} type="text" />
            {!state.details
              ? null
              : <div class="pdfupload-form-detail">{
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
        <div id="pdfUploadFormSubmit">
          <button disabled={state.progress || state.querying || !state.aliasAvailable || !state.pdfvalid} class="styled-button" ref={this.submitButton} type="submit">
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
    </div>
  }
}
