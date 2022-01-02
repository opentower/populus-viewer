import { h, Fragment, createRef, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import './styles/spacesManager.css'
import Modal from './modal.js'
import { RoomColor } from './utils/colors.js'
import { pdfStateType, spaceChild, mscResourceData } from "./constants.js"

export default class SpacesManager extends Component {
  constructor(props) {
    super(props)
    this.state = {
      spaces: Client.client.getVisibleRooms()
        .filter(this.isCollection)
        .map(room => <SpaceListing key={room.roomId} room={room} />)
    }
  }

  handleRoom = _ => this.setState({
    spaces: Client.client.getVisibleRooms()
      .filter(this.isCollection)
      .map(room => <SpaceListing key={room.roomId} room={room} />)
  })

  componentDidMount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("Room.name", this.handleRoom)
  }

  componentWillUnmount () {
    Client.client.off("Room", this.handleRoom)
    Client.client.off("Room.name", this.handleRoom)
  }

  isCollection(room) {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isSpace = creation.getContent()?.type === "m.space"
    const isLegacy = roomState.getStateEvents(pdfStateType, "")
    const isResource = creation.getContent()?.[mscResourceData]
    return isSpace && !isResource && !isLegacy
  }

  createCollection = _ => {
    Modal.set(<CreateCollection />)
  }

  render(_props, state) {
    return <div id="spaces-manager">
      <h1>Collections</h1>
      <div id="spaces-list">
        {state.spaces}
        <button onclick={this.createCollection} id="create-space">+ Create New Collection</button>
      </div>
    </div>
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
      <h3 id="modalHeader">Create Collection</h3>
      <form ref={this.mainForm} onSubmit={this.handleSubmit} id="create-collection">
        <label for="name">Collection Name</label>
        <input name="name" oninput={this.validateName} ref={this.collectionNameInput} />
        <div class="name-validation-detail">{
          state.querying
            ? "querying..."
            : state.nameavailable
              ? "name available"
              : "name unavailable"
          }
        </div>
        <label for="topic" >Collection Topic</label>
        <textarea name="topic" ref={this.collectionTopicInput} />
        <div id="create-collection-submit">
          <button disabled={state.querying || !state.nameavailable} class="styled-button" ref={this.submitButton} type="submit">
            Create Collection
          </button>
        </div>
      </form>
    </Fragment>
  }
}

class SpaceListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      children: Client.client.getVisibleRooms()
        .filter(this.isChild)
        .map(room => <SpaceListingChild key={room.roomId} room={room} />)
    }
  }

  componentDidMount() {
    Client.client.on("RoomState.events", this.handleStateUpdate)
  }

  componentWillUnmount() {
    Client.client.off("RoomState.events", this.handleStateUpdate)
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === spaceChild) {
      this.setState({
        children: Client.client.getVisibleRooms()
          .filter(this.isChild)
          .map(room => <SpaceListingChild key={room.roomId} room={room} />)
      })
    }
  }

  isChild = room => {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const spaceState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isLegacy = roomState.getStateEvents(pdfStateType, "")
    const isResource = creation.getContent()?.[mscResourceData]
    const isDescendent = spaceState.getStateEvents("m.space.child", room.roomId)
    return isDescendent && (isResource || isLegacy)
  }

  addChild = _ => Modal.set(<AddChild room={this.props.room} />)

  roomColor = new RoomColor(this.props.room.name)

  render(props, state) {
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    // should do this in a more fine-grained way with hasSufficientPowerLevelFor
    return <div style={this.roomColor.styleVariables} class="space-listing">
      <h3> {props.room.name} </h3>
      <div class="space-listing-children">
        {state.children}
        {isAdmin && props.dragging ? <button onclick={this.addChild} class="add-child-to-collection">+</button> : null }
      </div>
    </div>
  }
}

class AddChild extends Component {
  constructor(props) {
    super(props)
    this.state = {
      discussions: Client.client.getVisibleRooms()
        .filter(this.isDiscussion)
        .map(room => <DiscussionListing room={room} collection={props.room} />)
    }
  }

  isDiscussion = room => {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isLegacy = roomState.getStateEvents(pdfStateType, "")
    const isResource = creation.getContent()?.[mscResourceData]
    return isResource || isLegacy
  }

  render(_props, state) {
    return <Fragment>
      <h3 id="modalHeader">Add Discussion to Collection</h3>
      {state.discussions}
    </Fragment>
  }
}

class DiscussionListing extends Component {
  addMe = async _ => {
    const theDomain = Client.client.getDomain()
    const childContent = { via: [theDomain] }
    await Client.client
      .sendStateEvent(this.props.collection.roomId, spaceChild, childContent, this.props.room.roomId)
      .catch(e => alert(e))
    Modal.hide()
  }

  render(props) {
    return <div onclick={this.addMe}>{props.room.name}</div>
  }
}

class SpaceListingChild extends Component {
  constructor(props) {
    super(props)
    const avatarEvent = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents("m.room.avatar", "")
    this.state = {
      avatarEvent,
      loaded: false,
      avatarUrl: avatarEvent?.getContent()?.url
        ? Client.client.mxcUrlToHttp(avatarEvent.getContent().url, 35, 35, "crop")
        : null
    }
  }

  roomColor = new RoomColor(this.props.room.name)

  render(props, state) {
    return <div data-has-avatar={!!state.avatarUrl} class="space-listing-child" style={this.roomColor.styleVariables}>
        { state.avatarUrl
          ? <img src={state.avatarUrl} />
          : props.room.name.slice(0, 1)
        }
      </div>
  }
}
