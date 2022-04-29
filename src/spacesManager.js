import { h, Fragment, createRef, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import './styles/spacesManager.css'
import Modal from './modal.js'
import { toastError } from "./utils/alerts.js"
import Invite from './invite.js'
import Resource from './utils/resource.js'
import RoomSettings from './roomSettings.js'
import SearchBar from './search.js'
import RoomIcon from './roomIcon.js'
import * as Icons from './icons.js'
import { RoomColor } from './utils/colors.js'
import { spaceChild, spaceParent, populusCollectionChild } from "./constants.js"

export default class SpacesManager extends Component {
  constructor(props) {
    super(props)
    SpacesManager.init()
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

  static init() {
    if (SpacesManager.initialized) return
    SpacesManager.initialized = true
    SpacesManager.spaces = {}
    Client.client.on("RoomState.events", e => {
      if (SpacesManager.spaces[e.getRoomId()] && e.getType() === spaceChild) {
        if (e.getContent().via) {
          const responsePromise = Client.client.getRoomHierarchy(e.getStateKey(), 1, 0)
          responsePromise.then(response => {
            const [child] = response.rooms
            SpacesManager.spaces[e.getRoomId()].children[child.room_id] = child
            SpacesManager.spaces[e.getRoomId()].via[e.getStateKey()] = e.getContent().via
          }).then(_ => Client.client.emit("Space.update", e.getRoomId()))
        } else {
          delete SpacesManager.spaces[e.getRoomId()].children[e.getStateKey()]
          Client.client.emit("Space.update", e.getRoomId())
        }
      }
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

  filterSet = s => {
    this.props.setFilterItems([s])
    this.props.showMainView
      ? this.props.showMainView()
      : null
  }

  filterToggle = s => {
    const newItems = this.props.filterItems.filter(item => item.value !== s.value)
    if (newItems.length === this.props.filterItems.length) newItems.push(s)
    this.props.setFilterItems(newItems)
    this.props.showMainView
      ? this.props.showMainView()
      : null
  }

  isCollection(room) {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isSpace = creation?.getContent()?.type === "m.space"
    return isSpace && !Resource.hasResource(room)
  }

  createCollection = _ => {
    Modal.set(<CreateCollection />)
  }

  render(props, state) {
    return <div id="spaces-manager">
      <h1>Collections</h1>
      <div id="spaces-list">
        {state.spaces.map(room => <SpaceListing filterToggle={this.filterToggle} filterSet={this.filterSet} layout={props.layout} key={room.roomId} room={room} />)}
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
    if (!SpacesManager.spaces[this.props.room.roomId]) {
      SpacesManager.spaces[this.props.room.roomId] = {
        via: {},
        children: {},
        nextBatch: null
      }
    }
    this.state = {
      actionsVisible: false,
      // We use an array here to avoid duplicating children
      children: SpacesManager.spaces[this.props.room.roomId].children,
      limit: 30,
      via: SpacesManager.spaces[this.props.room.roomId].via
    }
  }

  componentDidMount() {
    Client.client.on("Space.update", this.handleSpaceUpdate)
    if (this.state.limit > Object.keys(this.state.children).length) this.loadChildren()
  }

  componentWillUnmount() {
    Client.client.off("Space.update", this.handleSpaceUpdate)
  }

  handleSpaceUpdate = roomId => {
    if (roomId === this.props.room.roomId) {
      const children = SpacesManager.spaces[this.props.room.roomId].children
      const via = SpacesManager.spaces[this.props.room.roomId].via
      this.setState({ via, children }, this.refreshModal)
    }
  }

  loadChildren = async _ => {
    // dendrite will still use the fallback route, which can't restrict depth
    let nextBatch = SpacesManager.spaces[this.props.room.roomId].nextBatch
    const response = await Client.client.getRoomHierarchy(this.props.room.roomId, 30, 1, false, nextBatch)
    const via = SpacesManager.spaces[this.props.room.roomId].via
    for (const childState of response.rooms[0]?.children_state) {
      via[childState.state_key] = childState.content.via
    }
    const children = SpacesManager.spaces[this.props.room.roomId].children
    for (const child of response.rooms) {
      if (child.room_id !== this.props.room.roomId) children[child.room_id] = child
    }
    nextBatch = response.next_batch
    SpacesManager.spaces[this.props.room.roomId] = { via, children, nextBatch }
    this.setState({ via, children }, this.refreshModal)
  }

  pageChildren = async _ => {
    const nextBatch = SpacesManager.spaces[this.props.room.roomId].nextBatch
    if (nextBatch) this.loadChildren()
  }

  addChildren = _ => {
    const limit = this.state.limit + 15
    if (limit > Object.keys(this.state.children).length) this.pageChildren()
    this.setState({limit})
  }

  refreshModal = _ => Modal.getTitle() === "addChild"
    ? Modal.set(<AddChild
        children={Object.values(this.state.children)}
        nextBatch={this.state.nextBatch}
        pageChildren={this.pageChildren}
        room={this.props.room}
      />, "addChild")
    : null

  searchMe = _ => this.props.filterSet({
    display: <Fragment><span class="small-icon">{Icons.collection}</span>{this.props.room.name}</Fragment>,
    value: `*${this.props.room.name}`
  })

  toggleActions = _ => this.setState(oldState => { return { actionsVisible: !oldState.actionsVisible } })

  addChild = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<AddChild
      // the root is always first in the listing
      children={Object.values(this.state.children)}
      nextBatch={this.state.nextBatch}
      pageChildren={this.pageChildren}
      room={this.props.room}
      />, "addChild")
  }

  joinChild = roomId => Client.client.joinRoom(roomId, { viaServers: this.state.via[roomId] })
    .catch(toastError("Couldn't join this discussion"))

  toggleChild = (roomId, name) => this.props.filterToggle({
    value: roomId,
    display: <Fragment><span class="small-icon">{Icons.page}</span>{name}</Fragment>
  })

  openSettings = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<RoomSettings joinLink={true} room={this.props.room} />)
  }

  openInvite = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<Invite room={this.props.room} />)
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
          ? <button data-narrow-view={props.layout !== "wide"} onclick={this.toggleActions}>{Icons.moreVertical}</button>
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
          ? Object.values(state.children).slice(0, state.limit).map(child => <RoomIcon
              key={child.room_id}
              size={50}
              inactiveClick={this.joinChild}
              activeClick={this.toggleChild}
              roomId={child.room_id}
              avatarUrl={child.avatar_url}
              name={child.name || child?.canonical_alias?.slice(1) || "?"}
            />)
          : null // insert loading bling here.
        }
        {(state.nextBatch || state.limit < Object.values(state.children).length)
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
      adding: true,
      discussions: Client.client
        .getVisibleRooms()
        .filter(room => Resource.hasResource(room))
    }
  }

  componentDidMount () {
    this.updateHeight()
  }

  componentDidUpdate () {
    this.updateHeight()
  }

  currentList = createRef()

  currentListWrapper = createRef()

  handleScroll = _ => {
    clearTimeout(this.debounceTimeout)
    this.debounceTimeout = setTimeout(_ => {
      const list = this.currentList.current
      if (list.scrollTop + list.clientHeight + 10 >= list.scrollHeight) {
        this.props.pageChildren()
      }
    }, 500)
  }

  updateHeight = _ => this.currentListWrapper.current.style.height = `${this.currentList.current.scrollHeight}px`

  addDiscussions = _ => this.setState({adding: true})

  removeDiscussions = _ => this.setState({adding: false})

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
    const childIds = this.props.children.map(child => child.room_id)
    const availableDiscussions = state.adding && state.discussions.filter(room => !childIds.includes(room.roomId))
    const currentDiscussions = !state.adding && props.children.filter(child => child.name.toLowerCase().includes(state.search.toLowerCase()))
    return <Fragment>
      <h3 id="modalHeader">Manage Discussions in {props.room.name}</h3>
      <SearchBar search={state.search} setSearch={this.filterDiscussions} />
      <div id="manage-discussion-select-view" class="select-view">
        <button onClick={this.addDiscussions} data-current-button={state.adding}>Add Discussions</button>
        <button onClick={this.removeDiscussions} data-current-button={!state.adding}>Remove Discussions</button>
      </div>
      <div id="manage-discussion-list-wrapper" ref={this.currentListWrapper}>
        {state.adding
          ? <div ref={this.currentList} id="available-discussions-list">
            { availableDiscussions.map(room => <AvailableDiscussionListing key={room.roomId} room={room} collection={props.room} />) }
          </div>
          : <div onscroll={this.handleScroll} ref={this.currentList} id="current-discussions-list">
            { currentDiscussions.map(child => <CurrentDiscussionListing key={child.room_id} child={child} collection={props.room} />) }
          </div>
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
      .catch(toastError("Couldn't remove discussion from collection"))
    await Client.client
      .sendStateEvent(this.props.child.room_id, spaceParent, {}, this.props.collection.roomId)
      .catch(toastError("Couldn't remove collection as parent of discussion"))
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
    const childContent = {
      via: [theDomain],
      [populusCollectionChild]: true
    }
    const parentContent = { via: [theDomain] }
    await Client.client
      .sendStateEvent(this.props.collection.roomId, spaceChild, childContent, this.props.room.roomId)
      .catch(toastError("Couldn't add discussion to collection"))
    await Client.client
      .sendStateEvent(this.props.room.roomId, spaceParent, parentContent, this.props.collection.roomId)
      .catch(toastError("Couldn't add collection as parent of discussion"))
  }

  render(props, state) {
    return <button
      aria-label={`add ${props.room.name} to discussion`}
      data-change-pending={state.pending}
      class="discussion-listing"
      onclick={this.addMe}>
        <span>{Icons.newDiscussion}</span>
        <span>{props.room.name}</span>
    </button>
  }
}
