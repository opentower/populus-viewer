import { h, Fragment, createRef, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import './styles/spacesManager.css'
import Modal from './modal.js'
import Invite from './invite.js'
import Resource from './utils/resource.js'
import RoomSettings from './roomSettings.js'
import SearchBar from './search.js'
import * as Icons from './icons.js'
import { RoomColor } from './utils/colors.js'
import { pdfStateType, spaceChild, spaceParent, mscResourceData } from "./constants.js"

export default class SpacesManager extends Component {
  constructor(props) {
    super(props)
    this.state = {
      spaces: Client.client.getVisibleRooms()
        .filter(room => room.getMyMembership() === "join")
        .filter(this.isCollection)
    }
  }

  handleRoom = _ => {
    clearTimeout(this.roomDebounceTimeout)
    this.roomDebounceTimeout = setTimeout(_ => {
      this.setState({
        spaces: Client.client.getVisibleRooms()
          .filter(room => room.getMyMembership() === "join")
          .filter(this.isCollection)
      })
    })
  }

  componentDidMount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("Room.name", this.handleRoom)
  }

  componentWillUnmount () {
    Client.client.off("Room", this.handleRoom)
    Client.client.off("Room.name", this.handleRoom)
  }

  searchPush = s => this.props.setSearch(`${this.props.searchFilter} "${s}"`)

  isCollection(room) {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isSpace = creation.getContent()?.type === "m.space"
    return isSpace && !Resource.hasResource(room)
  }

  createCollection = _ => {
    Modal.set(<CreateCollection />)
  }

  render(props, state) {
    return <div id="spaces-manager">
      <h1>Collections</h1>
      <div id="spaces-list">
        {state.spaces.map(room => <SpaceListing searchPush={this.searchPush} narrow={props.narrow} key={room.roomId} room={room} />)}
      </div>
      <div>
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
      actionsVisible: false,
      children: [],
      limit: 15,
      nextBatch: null
    }
  }

  componentDidMount() {
    Client.client.on("RoomState.events", this.handleStateUpdate)
    this.loadChildren()
  }

  componentWillUnmount() {
    Client.client.off("RoomState.events", this.handleStateUpdate)
  }

  loadChildren = async _ => {
    // dendrite will still use the fallback route, which can't restrict depth
    const response = await Client.client.getRoomHierarchy(this.props.room.roomId, 15, 1, false, this.state.nextBatch)
    this.setState({
      children: this.state.children.concat(response.rooms),
      nextBatch: response.next_batch
    }, _ => Modal.isVisible()
      ? Modal.set(<AddChild
          children={this.state.children.slice(1)}
          nextBatch={this.state.nextBatch}
          pageChildren={this.pageChildren}
          room={this.props.room}
        />)
      : null
    )
  }

  pageChildren = async _ => {
    if (this.state.nextBatch) this.loadChildren()
  }

  addChildren = _ => {
    const limit = this.state.limit + 15
    if (limit > this.state.children.length) this.pageChildren()
    this.setState({limit})
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === spaceChild) {
      this.pageChildren()
      // going to have to handle pagination eventually, insert this rather than redo the whole listing.
    }
  }

  searchMe = _ => this.props.searchPush(`*${this.props.room.name}`)

  toggleActions = _ => this.setState(oldState => { return { actionsVisible: !oldState.actionsVisible } })

  addChild = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<AddChild
      // the root is always first in the listing
      children={this.state.children.slice(1)}
      nextBatch={this.state.nextBatch}
      pageChildren={this.pageChildren}
      room={this.props.room}
      />)
  }

  openSettings = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<RoomSettings room={this.props.room} />)
  }

  openInvite = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<Invite roomId={this.props.room.roomId} />)
  }

  roomColor = new RoomColor(this.props.room.name)

  render(props, state) {
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    // should do this in a more fine-grained way with hasSufficientPowerLevelFor
    return <div style={this.roomColor.styleVariables} class="space-listing">
      <h3>
        <span onclick={this.searchMe}>{props.room.name}</span>
        {isAdmin
          ? <button data-narrow-view={props.narrow} onclick={this.toggleActions}>{Icons.moreVertical}</button>
          : null
        }
      </h3>
      { state.actionsVisible
        ? <div class="space-listing-actions">
            <button class="small-icon" onclick={this.addChild}>{ Icons.newDiscussion }</button>
            <button class="small-icon" onclick={this.openInvite}>{ Icons.userPlus }</button>
            <button class="small-icon" onclick={this.openSettings}>{ Icons.settings }</button>
          </div>
        : null
      }
      <div class="space-listing-children">
        {state.children
          // the root is always first in the listing
          ? state.children.slice(1, state.limit + 1).map(child => <SpaceListingChild key={child.room_id} child={child} />)
          : null // insert loading bling here.
        }
        {isAdmin && props.dragging ? <button ondrop={_ => alert('drop not implemented!')} class="add-child-to-collection">+</button> : null }
        {(state.nextBatch || state.limit < state.children.length)
          ? <div class="space-listing-more" onclick={this.addChildren}>...</div>
          : null
        }
      </div>
    </div>
  }
}

class AddChild extends Component {
  constructor(props) {
    super(props)
    props.children.map(child => child.name)
    this.state = {
      search: "",
      discussions: Client.client
        .getVisibleRooms()
        .filter(room => Resource.hasResource(room))
    }
  }

  currentList = createRef()

  handleScroll = _ => {
    clearTimeout(this.debounceTimeout)
    this.debounceTimeout = setTimeout(_ => {
      const list = this.currentList.current
      if (list.scrollTop + list.clientHeight + 10 >= list.scrollHeight) {
        console.log("scrolled")
        this.props.pageChildren()
      }
    }, 500)
  }

  filterDiscussions = search => {
    this.setState({
      search,
      discussions: Client.client
        .getVisibleRooms()
        .filter(room =>
          Resource.hasResource(room) &&
          room.name.toLowerCase().includes(search.toLowerCase())
        )
    })
  }

  render(props, state) {
    const childNames = this.props.children.map(child => child.name)
    return <Fragment>
      <h3 id="modalHeader">Manage Discussions in Collection</h3>
      <SearchBar search={state.search} setSearch={this.filterDiscussions} />
      {props.children.length > 0
        ? <Fragment>
          <h4>Current Discussions</h4>
          <div onscroll={this.handleScroll} ref={this.currentList}class="current-discussions-list">
            {props.children
              .filter(child => child.name.toLowerCase().includes(state.search.toLowerCase()))
              .map(child =>
                <CurrentDiscussionListing key={child.room_id} child={child} collection={props.room} />
              )
            }
          </div>
        </Fragment>
        : null
      }
      <h4>Available Discussions</h4>
      <div class="available-discussions-list">
        {state.discussions
          .filter(room => !childNames.includes(room.name))
          .map(room =>
            <AvailableDiscussionListing key={room.roomId} room={room} collection={props.room} />
          )
        }
      </div>
    </Fragment>
  }
}

class CurrentDiscussionListing extends Component {
  removeMe = async _ => {
    this.setState({pending: true})
    await Client.client
      .sendStateEvent(this.props.collection.roomId, spaceChild, {}, this.props.child.room_id)
      .catch(e => alert(e))
    await Client.client
      .sendStateEvent(this.props.child.room_id, spaceParent, {}, this.props.collection.roomId)
      .catch(e => alert(e))
    // need a better way of displaying this alert
  }

  render(props, state) {
    return <button
      data-change-pending={state.pending}
      class="discussion-listing"
      onclick={this.removeMe}>
        <span>{Icons.trash}</span>
        <span>{props.child.name}</span>
      </button>
  }
}

class AvailableDiscussionListing extends Component {
  addMe = async _ => {
    this.setState({pending: true})
    const theDomain = Client.client.getDomain()
    const childContent = { via: [theDomain] }
    const parentContent = { via: [theDomain] }
    await Client.client
      .sendStateEvent(this.props.collection.roomId, spaceChild, childContent, this.props.room.roomId)
      .catch(e => alert(e))
    await Client.client
      .sendStateEvent(this.props.room.roomId, spaceParent, parentContent, this.props.collection.roomId)
      .catch(e => alert(e))
    // need a better way of displaying this alert
  }

  render(props, state) {
    return <button
      data-change-pending={state.pending}
      class="discussion-listing"
      onclick={this.addMe}>
        <span>{Icons.newDiscussion}</span>
        <span>{props.room.name}</span>
      </button>
  }
}

class SpaceListingChild extends Component {
  constructor(props) {
    super(props)
    this.state = {
      joined: this.amJoined(),
      loaded: false,
      avatarUrl: props.child.avatar_url
        ? Client.client.mxcUrlToHttp(props.child.avatar_url, 35, 35, "crop")
        : null
    }
  }

  amJoined = _ => !!(Client.client.getRoom(this.props.child.room_id)?.getMyMembership() === "join")

  componentDidMount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom)
  }

  componentDidUnmount () {
    Client.client.on("Room", this.handleRoom)
    Client.client.on("RoomState.events", this.handleRoom)
  }

  handleRoom = (e, r) => {
    if (e.roomId === this.props.child.room_id || r?.roomId === this.props.child.room_id) {
      clearTimeout(this.roomDebounceTimeout)
      this.roomDebounceTimeout = setTimeout(_ => {
        this.setState({ joined: this.amJoined() })
      })
    }
  }

  joinRoom = _ => Client.client.joinRoom(this.props.child.room_id)

  roomColor = new RoomColor(this.props.child.name)

  render(props, state) {
    return <div onclick={this.joinRoom}
      data-joined={state.joined}
      data-has-avatar={!!state.avatarUrl}
      class="space-listing-child"
      style={this.roomColor.styleVariables}>
        { state.avatarUrl
          ? <img src={state.avatarUrl} />
          : props.child.name.slice(0, 1)
        }
      </div>
  }
}
