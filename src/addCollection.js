import { h, Fragment, createRef, Component } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import * as Icons from './icons.js'
import Resource from './utils/resource.js'
import Modal from './modal.js'
import './styles/addCollection.css'

export default class AddCollection extends Component {
  constructor(props) {
    super(props)
    this.state = { 
      creating: true,
      archived: Client.client.getVisibleRooms()
        .filter(room => room.getMyMembership() === "join")
        .filter(this.isArchived)
    }
  }

  componentDidMount () {
    Client.client.on("Room.accountData", this.handleRoom)
  }

  componentWillUnmount () {
    Client.client.off("Room.accountData", this.handleRoom)
  }

  handleRoom = _ => {
    clearTimeout(this.roomDebounceTimeout)
    this.roomDebounceTimeout = setTimeout(_ => {
      const archived = Client.client.getVisibleRooms()
          .filter(room => room.getMyMembership() === "join")
          .filter(this.isArchived)
      this.setState({
        creating: this.state.creating || archived.length === 0,
        archived
      })
    })
  }

  currentListWrapper = createRef()

  updateHeight = _ => this.currentListWrapper.current.style.height = `${this.currentList.current.scrollHeight}px`

  createCollection = _ => this.setState({creating:true})

  unarchiveCollection = _ => this.setState({creating:false})

  isArchived(room) {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isSpace = creation?.getContent()?.type === "m.space"
    const isArchived = room.tags["m.lowpriority"]
    return isSpace && isArchived && !Resource.hasResource(room)
  }

  render(props,state) {
    return <>
      <div id="add-collection-select-view" class="select-view">
        <button onClick={this.createCollection} data-current-button={state.creating}>Додати мед. карту</button>
        <button onClick={this.unarchiveCollection} disabled={state.archived.length === 0} data-current-button={!state.creating}>Відновити з архіву </button>
      </div>
      <div id="add-collection-list-wrapper" ref={this.currentListWrapper}>
        {state.creating
          ? <CreateCollection />
          : <div id="add-collection-unarchive-list" ref={this.currentList}>
            {state.archived.map(room => <UnarchiveCollection room={room}/>)}
          </div>
        }
      </div>
    </>
  }
}

class CreateCollection extends Component {
  constructor(props) {
    super(props)
    this.state = {
      querying: false,
      nameavailable: false
    }
  }

  mainForm = createRef()

  collectionNameInput = createRef()

  collectionTopicInput = createRef()

  // DRY duplication with pdfUpload
  validateName = _ => {
    clearTimeout(this.namingTimeout)
    this.setState({querying: true})
    this.namingTimeout = setTimeout(_ => {
      Client.client.getRoomIdForAlias(`#${this.toAlias(this.collectionNameInput.current.value)}:${Client.client.getDomain()}`)
        .then(_ => this.setState({querying: false, nameavailable: false}))
        .catch(err => {
          if (this.collectionNameInput.current.value === "") this.setState({querying: false, nameavailable: false})
          else if (err.errcode === "M_NOT_FOUND") this.setState({querying: false, nameavailable: true})
          else alert(err)
        })
    }, 1000)
  }

  toAlias(s) {
    // replace forbidden characters
    return s.replace(/[\s:]/g, '_')
  }

  handleSubmit = async e => {
    e.preventDefault()
    const theName = this.collectionNameInput.current.value
    const theAlias = this.toAlias(theName)
    const theTopic = this.collectionTopicInput.current.value
    await Client.client.createRoom({
      room_alias_name: theAlias,
      visibility: "private",
      name: theName,
      topic: theTopic,
      // We declare the room a space
      creation_content: { type: "m.space" },
      initial_state: [
        // we allow anyone to join, by default, for now
        {
          type: "m.room.join_rules",
          state_key: "",
          content: {join_rule: "public"}
        }
      ]
    }).catch(err => { alert(err); })
    Modal.hide()
  }

  render(_props, state) {
    return <Fragment>
      <form ref={this.mainForm} onSubmit={this.handleSubmit} id="create-collection">
        <label for="name">Назва карти</label>
        <input 
          name="name"
          class="styled-input"
          oninput={this.validateName}
          ref={this.collectionNameInput} />
        <div class="name-validation-detail">{
          state.querying
            ? "запитую..."
            : state.nameavailable
              ? "назва вірна"
              : "назва некоректна чи не доступна"
          }
        </div>
        <label for="topic" >Опис карти</label>
        <textarea 
          name="topic" 
          class="styled-input"
          ref={this.collectionTopicInput} />
        <div id="create-collection-submit">
          <button disabled={state.querying || !state.nameavailable} class="styled-button" ref={this.submitButton} type="submit">
            Додати мед. карту
          </button>
        </div>
      </form>
    </Fragment>
  }
}

class UnarchiveCollection extends Component {
  unarchive = _ => {
    this.setState({pending:true})
    Client.client.deleteRoomTag(this.props.room.roomId, "m.lowpriority")
  }

  render(props, state) {
    return <button
      class="unarchive-collection"
      data-change-pending={state.pending}
      onclick={this.unarchive}>
      <span class="small-icon">{Icons.archive}</span>
      <span>{props.room.name}</span>
    </button>
  }
}
