import { h, Fragment, createRef, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import './styles/spacesManager.css'
import Modal from './modal.js'
import { toastError } from "./utils/alerts.js"
import ManageMembership from './manageMembership.js'
import Resource from './utils/resource.js'
import RoomSettings from './roomSettings.js'
import SearchBar from './search.js'
import LeaveRoom from './leaveRoom.js'
import ArchiveRoom from './archiveRoom.js'
import AddCollection from './addCollection.js'
import RoomIcon from './roomIcon.js'
import ToolTip from './utils/tooltip.js'
import { RoomIconPlaceholder } from './roomIcon.js'
import * as Icons from './icons.js'
import { RoomColor } from './utils/colors.js'
import { populusCollectionChild } from "./constants.js"

export default class SpacesManager extends Component {
  constructor(props) {
    super(props)
    SpacesManager.init()
    this.state = {
      spaces: Client.client.getVisibleRooms()
        .filter(room => room.getMyMembership() === "join")
        .filter(this.isActiveCollection)
    }
  }

  handleRoom = _ => {
    clearTimeout(this.roomDebounceTimeout)
    this.roomDebounceTimeout = setTimeout(_ => {
      this.setState({
        spaces: Client.client.getVisibleRooms()
          .filter(room => room.getMyMembership() === "join")
          .filter(this.isActiveCollection)
      })
    })
  }

  static init() {
    if (SpacesManager.initialized) return
    SpacesManager.initialized = true
    SpacesManager.spaces = {}
    Client.client.on("RoomState.events", e => {
      if (SpacesManager.spaces[e.getRoomId()] && e.getType() === Matrix.EventType.SpaceChild) {
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
    Client.client.on("Room.accountData", this.handleRoom)
  }

  componentWillUnmount () {
    Client.client.off("Room", this.handleRoom)
    Client.client.off("Room.name", this.handleRoom)
    Client.client.off("Room.accountData", this.handleRoom)
  }

  filterToggle = s => {
    const newItems = this.props.filterItems.filter(item => item.value !== s.value)
    if (newItems.length === this.props.filterItems.length) newItems.push(s)
    this.props.setFilterItems(newItems)
    this.props.showMainView
      ? this.props.showMainView()
      : null
  }

  isActiveCollection(room) {
    const roomState = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const creation = roomState.getStateEvents("m.room.create", "")
    const isSpace = creation?.getContent()?.type === "m.space"
    const isActive = !room.tags["m.lowpriority"]
    return isSpace && isActive && !Resource.hasResource(room)
  }

  addCollection = _ => {
    Modal.set(<AddCollection />, "Додати нову мед. карту")
  }

  render(props, state) {
    return <div id="spaces-manager">
      <h1>Карти пацієнта</h1>
      <hr class="styled-rule" />
      <div id="spaces-list">
        {state.spaces.map(room => <SpaceListing filterToggle={this.filterToggle} oneColumn={props.oneColumn} key={room.roomId} room={room} />)}
      </div>
      <div>
        <button onclick={this.addCollection} id="add-space">Додати нову мед. картку</button>
      </div>
    </div>
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
    this.initialChildCount = props.room.getLiveTimeline() 
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents("m.space.child")
      .filter(childEvent => childEvent.getContent()?.via)
      .length

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

  refreshModal = _ => Modal.getTitle() === "Manage Discussions"
    ? Modal.set(<AddChild
        children={Object.values(this.state.children)}
        nextBatch={this.state.nextBatch}
        pageChildren={this.pageChildren}
        room={this.props.room}
      />, "Manage Discussions", `to ${this.props.room.name}`)
    : null

  searchMe = _ => this.props.filterToggle({
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
      />, "Manage Discussions", `in ${this.props.room.name}`)
  }

  joinChild = roomId => Client.client.joinRoom(roomId, { viaServers: this.state.via[roomId] })
    .catch(toastError("Не вдалося долучитися до обговорення"))

  toggleChild = (roomId, name) => this.props.filterToggle({
    value: roomId,
    display: <Fragment><span class="small-icon">{Icons.page}</span>{name}</Fragment>
  })

  openSettings = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<RoomSettings joinLink={true} room={this.props.room} />, "Налаштування", `для ${this.props.room.name}`)
  }

  openMembership = _ => {
    this.setState({ actionsVisible: false })
    Modal.set(<ManageMembership room={this.props.room} />, "Хто спілкується", `в ${this.props.room.name}`)
  }

  handleClose = _ => Modal.set(<LeaveRoom room={this.props.room} />, "Видалити мед. карту?", ` ${this.props.room.name}`)

  archiveRoom = _ => Modal.set(<ArchiveRoom room={this.props.room} />, "Перенести до архіву?", `>>> ${this.props.room.name}`)

  roomColor = new RoomColor(this.props.room.name)

  render(props, state) {
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    const canInvite = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .hasSufficientPowerLevelFor("invite", userMember.powerLevel)
    // should do this in a more fine-grained way with hasSufficientPowerLevelFor
    return <div style={this.roomColor.styleVariables} class="space-listing">
      <h3>
        <span onclick={this.searchMe}>{props.room.name}</span>
        <button data-narrow-view={props.oneColumn} onclick={this.toggleActions}>{Icons.moreVertical}</button>
      </h3>
      { state.actionsVisible
        ? <div class="space-listing-actions">
          {isAdmin 
            ? <ToolTip content="Add new discussion">
              <button class="small-icon" onclick={this.addChild}>{ Icons.newDiscussion }</button> 
            </ToolTip>
            : null
          }
          {canInvite 
            ? <ToolTip content="Manage membership">
              <button class="small-icon" onclick={this.openMembership}>{ Icons.userPlus }</button> 
            </ToolTip>
            : null
          }
          {isAdmin 
              ? <ToolTip content="Configure settings">
                <button class="small-icon" onclick={this.openSettings}>{ Icons.settings }</button> 
              </ToolTip>
              : null
          }
          <ToolTip content="Hide and archive">
            <button class="small-icon" onclick={this.archiveRoom}>{ Icons.archive }</button>
          </ToolTip>
          <ToolTip content="Leave collection">
            <button class="small-icon" onclick={this.handleClose}>{ Icons.exit }</button>
          </ToolTip>
        </div>
        : null
      }
      <div class="space-listing-children">
      {Object.values(state.children).length > 0
          // the root is always first in the listing
          ? Object.values(state.children).slice(0, state.limit).map(child => <RoomIcon
              key={child.room_id}
              size={50}
              inactiveClick={this.joinChild}
              activeClick={this.toggleChild}
              roomId={child.room_id}
              avatarUrl={child.avatar_url}
              numJoinedMembers={child.num_joined_members}
              joinRule={child.join_rule}
              topic={child.topic}
              name={child.name || child?.canonical_alias?.slice(1) || "?"}
            />)
          : Array(Math.min(state.limit, this.initialChildCount)).fill().map((_, idx) => <RoomIconPlaceholder
              key={idx}
              size={50}
            />)
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
      <SearchBar search={state.search} setSearch={this.filterDiscussions} />
      <div id="manage-discussion-select-view" class="select-view">
        <button onClick={this.addDiscussions} data-current-button={state.adding}>Додати обговорення</button>
        <button onClick={this.removeDiscussions} data-current-button={!state.adding}>Видалити обговорення</button>
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
      .sendStateEvent(this.props.collection.roomId, Matrix.EventType.SpaceChild, {}, this.props.child.room_id)
      .catch(toastError("Не вдалося видалити дискусію з списку"))
    await Client.client
      .sendStateEvent(this.props.child.room_id, Matrix.EventType.SpaceParent, {}, this.props.collection.roomId)
      .catch(toastError("Не вдалося видалити мед. карту, що містить обговорення"))
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
      .sendStateEvent(this.props.collection.roomId, Matrix.EventType.SpaceChild, childContent, this.props.room.roomId)
      .catch(toastError("Не вдалося додати обговорення до колекції"))
    await Client.client
      .sendStateEvent(this.props.room.roomId, Matrix.EventType.SpaceParent, parentContent, this.props.collection.roomId)
      .catch(toastError("Не вдалося додати картоку як батька обговорення"))
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
