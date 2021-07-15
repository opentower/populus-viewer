import { h, createRef, Component } from 'preact';
import './styles/pdfUpload.css'
import { roomType, pdfStateType, spaceType, spaceChild } from "./constants.js"
import Client from './client.js'

export default class PdfUpload extends Component {
  mainForm = createRef()

  fileLoader = createRef()

  roomNameInput = createRef()

  roomTopicInput = createRef()

  submitButton = createRef()

  progressHandler = (progress) => this.setState({progress})

  uploadFile = async (e) => {
    e.preventDefault()
    const theFile = this.fileLoader.current.files[0]
    const theName = this.roomNameInput.current.value
    const theTopic = this.roomTopicInput.current.value
    if (theFile.type === "application/pdf") {
      this.submitButton.current.setAttribute("disabled", true)
      const id = await Client.client.createRoom({
        room_alias_name: theName.replace(/[\s:]/g, '_'), // replace forbidden characters
        visibility: "public",
        name: theName,
        topic: theTopic,
        // We declare the room a space
        creation_content: {
          [roomType]: spaceType
        },
        // we allow anyone to join, by default, for now
        initial_state: [{
          type: "m.room.join_rules",
          state_key: "",
          content: {join_rule: "public"}
        }],
        power_level_content_override: {
          events: {
            [spaceChild]: 0 // we allow anyone to annotate, by default, for now
          }
        }
      }).catch(e => { alert(e); })
      Client.client.uploadContent(theFile, { progressHandler: this.progressHandler }).then(e => {
        Client.client.sendStateEvent(id.room_id, pdfStateType, { mxc: e })
        // XXX: this event doesn't get through before the name is
        // assigned, so the room isn't detected as a pdf room. Probably
        // need to include the pdf in the room's creation event to make
        // this work right.
      }).then(_ => {
        this.mainForm.current.reset()
        this.props.showMainView()
      }).catch(e => alert(e))
    } else {
      alert("Please make sure that the file you're uploading is a pdf.")
      this.mainForm.current.reset()
    }
  }

  render () {
    return <form id="pdfUploadForm" ref={this.mainForm} onsubmit={this.uploadFile}>
      <label> Pdf to discuss</label>
      <input ref={this.fileLoader} accept="application/pdf" type="file" />
      <label>Name for Discussion</label>
      <input ref={this.roomNameInput} type="text" />
      <label>Topic of Discussion</label>
      <textarea ref={this.roomTopicInput} type="text" />
      <div id="pdfUploadFormSubmit">
        <button disabled={this.state.progress} class="styled-button" ref={this.submitButton} type="submit">
          { this.state.progress ? "Uploading..." : "Create Discussion" }
        </button>
      </div>
      {this.state.progress
        ? <div id="pdfUploadFormProgress">
          <progress max={this.state.progress.total} value={this.state.progress.loaded} />
        </div>
        : null
      }
    </form>
  }
}
