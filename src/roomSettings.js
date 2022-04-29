import { h, Component, createRef, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { loadImageElement } from "./utils/media.js"
import Location from './utils/location.js'
import Resource from './utils/resource.js'
import Modal from './modal.js'
import { mscLocation, joinRule, spaceParent, spaceChild } from './constants.js';
import "./styles/roomSettings.css"

export default class RoomSettings extends Component {
  constructor(props) {
    super(props)
    this.roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.initialJoinRule = this.roomState.getJoinRule()
    this.mayChangeJoinRule = this.roomState.maySendStateEvent(Matrix.EventType.RoomJoinRules, Client.client.getUserId())
    this.mayChangeAvatar = this.roomState.maySendStateEvent(Matrix.EventType.RoomAvatar, Client.client.getUserId())
    this.initialName = props.room.name
    this.mayChangeName = this.roomState.maySendStateEvent(Matrix.EventType.RoomName, Client.client.getUserId())
    this.initialVisibility = null
    this.initialReadability = props.room.getHistoryVisibility()
    this.mayChangeReadability = this.roomState.maySendStateEvent(Matrix.EventType.RoomHistoryVisibility, Client.client.getUserId())
    this.joinLink = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}` +
      `?join=${encodeURIComponent(props.room.roomId)}&via=${Client.client.getDomain()}`
    this.powerLevels = this.roomState.getStateEvents(Matrix.EventType.RoomPowerLevels, "")?.getContent()
    this.mayChangePowerLevels = this.roomState.maySendStateEvent(Matrix.EventType.RoomPowerLevels, Client.client.getUserId())

    this.initialAnnotationPowerLevel = this.getPowerLevelForStateEvent(spaceChild)
    this.initialCanAnnotate =  this.initialAnnotationPowerLevel >= 100 ? "admin" 
        : this.initialAnnotationPowerLevel >= 50 ? "mod"
        : "member",

    this.state = {
      previewUrl: props.room.getAvatarUrl(`https://${Client.client.getDomain()}`, 300, 300, "crop"),
      joinRule: this.initialJoinRule,
      roomName: this.initialName,
      readability: this.initialReadability,
      visibility: null,
      canAnnotate: this.initialCanAnnotate,
      references: null,
      view: "APPEARANCE"
    }
  }

  componentDidMount () {
    this.initialize()
  }

  getPowerLevelForStateEvent = s => {
    console.log(this.powerLevels.events[s])
    if (s in this.powerLevels?.events) return this.powerLevels.events[s]
    let sendStatePowerLevel = 50
    if (this.powerLevels) {
      const pl = this.powerLevels?.state_default
      if (Number.isSafeInteger(pl)) sendStatePowerLevel = pl
    }
    return sendStatePowerLevel
  }

  avatarImageInput = createRef()

  async initialize() {
    let sendStatePowerLevel = 50
    const me = this.props.room.getMember(Client.client.getUserId())
    if (this.powerLevels) {
      const pl = this.powerLevels?.state_default
      if (Number.isSafeInteger(pl)) sendStatePowerLevel = pl
    }
    if (me.powerLevel >= sendStatePowerLevel) this.canChangeVisibility = true 
    // assume you can if you have 50 power---per advice from #matrix-spec, since this is implementation-dependent
    const visibility = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialVisibility = visibility
    const references = this.roomState.getStateEvents(spaceParent)
    this.setState({ references, visibility: visibility.visibility })
  }

  handleJoinRuleChange = e => {
    this.setState({ joinRule: e.target.value })
  }

  handleReadabilityChange = e => {
    this.setState({ readability: e.target.value })
  }

  handleAnnotationChange = e => {
    this.setState({ canAnnotate: e.target.value })
  }

  handleNameInput = e => {
    this.setState({ roomName: e.target.value })
  }

  handleKeydown = e => {
    e.stopPropagation() // don't go to global keypress handler
  }

  handleUploadAvatar = _ => this.avatarImageInput.current.click()

  handleVisibilityChange = e => {
    this.setState({ visibility: e.target.value })
  }

  progressHandler = (progress) => this.setState({progress})

  handleSubmit = async e => {
    e.preventDefault()
    if (this.state.visibility !== this.initialVisibility) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.visibility).catch(this.raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) await this.updateJoinRule()
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(this.raiseErr)
    if (this.state.readability !== this.initialReadability) await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomHistoryVisibility, {
      history_visibility: this.state.readability
    }).catch(this.raiseErr)

    if (this.state.canAnnotate !== this.initialCanAnnotate) {
      if (!this.powerLevels.events) this.powerLevels.events = {}
      if (this.state.canAnnotate === "admin") this.powerLevels.events[spaceChild] = 100
      if (this.state.canAnnotate === "mod") this.powerLevels.events[spaceChild] = 50
      if (this.state.canAnnotate === "member") this.powerLevels.events[spaceChild] = 0
    }
    
    // if I update power levels, then send the updated contents
    if (this.state.canAnnotate !== this.initialCanAnnotate) await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomPowerLevels, 
      this.powerLevels).catch(this.raiseErr)

    if (this.avatarImage && /^image/.test(this.avatarImage.type)) {
      const {width, height} = await loadImageElement(this.avatarImage)
      await Client.client.uploadContent(this.avatarImage, { progressHandler: this.progressHandler })
        .then(e => Client.client
          .sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomAvatar, {
            info: {
              w: width,
              h: height,
              mimetype: this.avatarImage.type ? this.avatarImage.type : "application/octet-stream",
              size: this.avatarImage.size
            },
            url: e
          }, "")
        )
    } else if (!this.state.previewUrl) {
      Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomAvatar, {}, "")
    }
    Modal.hide()
  }

  raiseErr = _ => alert("Something went wrong. You may not have permission to adjust some of these settings.")

  updatePreview = _ => {
    this.avatarImage = this.avatarImageInput.current.files[0]
    if (this.avatarImage && /^image/.test(this.avatarImage.type)) {
      this.setState({previewUrl: URL.createObjectURL(this.avatarImage) })
    }
  }

  async updateJoinRule() {
    const theContent = { join_rule: this.state.joinRule }
    await Client.client.sendStateEvent(this.props.room.roomId, joinRule, theContent, "").catch(this.raiseErr)
    if (this.state.joinRule === "public") this.publishReferences()
    if (this.state.joinRule === "invite") this.hideReferences()
  }

  publishReferences() {
    const theDomain = Client.client.getDomain()
    for (const reference of this.state.references) {
      const theLocation = new Location(reference)
      if (!theLocation.isValid()) continue
      const childContent = {
        via: [theDomain],
        [mscLocation]: theLocation.location
      }
      Client.client
        .sendStateEvent(theLocation.getParent(), spaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    }
  }

  hideReferences() {
    for (const reference of this.state.references) {
      const theLocation = new Location(reference)
      if (!theLocation.isValid()) continue
      const childContent = {}
      Client.client
        .sendStateEvent(theLocation.getParent(), spaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    }
  }

  getAdmins = _ => {
    if (!this.powerLevels?.users) return
    let admins = []
    for (const user in this.powerLevels.users) {
      if (this.powerLevels.users[user] === 100)
        admins.push(<div class="room-settings-admin-listing" key={user}>{user}</div>)
    }
    if (admins.length > 0) return admins
    else return <div>No admins!</div>
  }

  getMods = _ => {
    if (!this.powerLevels?.users) return
    let mods = []
    for (const user in this.powerLevels.users) {
      if (this.powerLevels.users[user] === 50)
        mods.push(<div class="room-settings-moderator-listing" key={user}>{user}</div>)
    }
    if (mods.length > 0) return mods 
    else return <div>none</div>
  }

  getOtherRoles = _ => {
    if (!this.powerLevels?.users) return
    let others = []
    for (const user in this.powerLevels.users) {
      if (this.powerLevels.users[user] !== 100 && this.powerLevels.users[user] !== 50)
        others.push(<div class="room-settings-otherrole-listing" key={user}>{user}</div>)
    }
    if (others.length > 0) return others
    else return <div>none</div>
  }

  showAppearance = _ => this.setState({view: "APPEARANCE"})

  showAccess = _ => this.setState({view: "ACCESS"})

  showLinks = _ => this.setState({view: "LINKS"})

  showRoles = _ => this.setState({view: "ROLES"})

  showPermissions = _ => this.setState({view: "PERMISSIONS"})

  uploadAvatar = _ => this.avatarImageInput.current.click()

  removeAvatar = _ => this.setState({ previewUrl: null })

  getHeight = _ => {
    const wide = (document.body.offsetWidth > 600)
    const progressFactor = this.state.progress ? 50 : 0
    switch (this.state.view) {
      case "APPEARANCE" : return `${(wide ? 290 : 370) + progressFactor}px`
      case "ACCESS" : return `${(wide ? 240 : 400) + progressFactor}px`
      case "LINKS" : return `${(wide ? 130 : 180) + progressFactor}px`
      default : return "fit-content"
    }
  }

  cancel = e => {
    e.preventDefault()
    Modal.hide()
  }

  render(props, state) {
    return <Fragment>
      <h3 id="modalHeader">Room Settings</h3>
      <div id="room-settings-select-view" class="select-view">
        <button onClick={this.showAppearance} data-current-button={state.view==="APPEARANCE"}>Appearance</button>
        <button onClick={this.showAccess} data-current-button={state.view==="ACCESS"}>Access</button>
        <button onClick={this.showRoles} data-current-button={state.view==="ROLES"}>Roles</button>
        <button onClick={this.showPermissions} data-current-button={state.view==="PERMISSIONS"}>Permissions</button>
        {props.joinLink ? <button onClick={this.showLinks} data-current-button={state.view==="LINKS"}>Links</button> : null}
      </div>
      <form 
        style={{height:this.getHeight()}}
        id="room-settings-form">
        {state.view === "APPEARANCE"
          ? <Fragment>
            <label htmlFor="room-avatar">Room Avatar</label>
            <div id="room-settings-avatar-wrapper">
              {state.previewUrl
                ? <img onclick={this.mayChangeAvatar && this.handleUploadAvatar} id="room-settings-avatar-selector" src={state.previewUrl} />
                : <div key="room-settings-avatar-selector" onclick={this.mayChangeAvatar && this.uploadAvatar} id="room-settings-avatar-selector" />}
              {state.previewUrl && this.mayChangeAvatar ? <button id="room-settings-clear-avatar" type="button" onclick={this.removeAvatar}>Remove Avatar</button> : null}
            </div>
            <input name="room-avatar" id="room-avatar-selector-hidden" onchange={this.updatePreview} ref={this.avatarImageInput} accept="image/*" type="file" />
            <div class="room-settings-info" />
            <label htmlFor="room-name">Room Name</label>
            <input name="room-name"
              type="text"
              class="styled-input"
              value={state.roomName}
              disabled={!this.mayChangeName}
              onkeydown={this.handleKeydown}
              onInput={this.handleNameInput} />
            <div class="room-settings-info" />
          </Fragment>
          : state.view === "ACCESS"
          ? <Fragment>
            <label htmlFor="visibility">Discovery</label>
            <select disabled={!state.visibility} class="styled-input" value={state.visibility} name="visibility" onchange={this.handleVisibilityChange}>
              <option value="private">Private</option>
              <option value="public">Publicly Listed</option>
            </select>
            <div class="room-settings-info">
              {state.visibility === "public"
                ? "the room will appear in room search results"
                : "the room will not appear in room search results"
              }
            </div>
            <label htmlFor="joinRule">Join Rule</label>
            <select class="styled-input" value={state.joinRule} name="joinRule" onchange={this.handleJoinRuleChange}>
              <option value="public">Public</option>
              <option value="invite">Invite-Only</option>
            </select>
            <div class="room-settings-info">
              {state.joinRule === "public"
                ? "anyone who can find the room may join"
                : "an explicit invitation is required before joining"
              }
            </div>
            <label htmlFor="readability">Readability</label>
            <select class="styled-input" value={state.readability} disabled={!this.mayChangeReadability} name="readability" onchange={this.handleReadabilityChange}>
              <option value="shared">Members Only</option>
              <option value="world_readable">World Readable</option>
            </select>
            <div class="room-settings-info">
              {state.readability === "world_readable"
                ? "guests can see what's happening in the room"
                : "only room members can see what's happening in the room"
              }
            </div>
          </Fragment>
          : state.view === "LINKS" ? <Fragment>
              <label>Join Link</label>
              <pre id="room-settings-join-link">{this.joinLink}</pre>
              <div class="room-settings-info">
                Clicking this link will cause an attempt to join this room
              </div>
            </Fragment>
          : state.view === "ROLES" ? <Fragment>
            <div class="room-settings-role-list">
              <h5>Administrators</h5>
              {this.getAdmins()}
            </div>
            <div class="room-settings-role-list">
              <h5>Moderators</h5>
              {this.getMods()}
            </div>
            <div class="room-settings-role-list">
              <h5>Other Roles</h5>
              {this.getOtherRoles()}
            </div>
          </Fragment>
          : state.view === "PERMISSIONS" ? <Fragment>
            { Resource.hasResource(props.room) 
                ? <Fragment>
                  <label htmlFor="annotate">Annotate</label>
                  <select class="styled-input" value={state.canAnnotate} disabled={!this.mayChangePowerLevels} name="annotate" onchange={this.handleAnnotationChange}>
                    <option value="admin">Administrators only</option>
                    <option value="mod">Moderators and above</option>
                    <option value="member">Any member</option>
                  </select>
                  <div class="room-settings-info">
                    {state.canAnnotate === "admin" ? "only admins can create annotations"
                      : state.canAnnotate === "mod" ? "only moderators can create annotations"
                      : "any room member can create annotations"
                    }
                  </div>
                </Fragment>
                : null 
            }
          </Fragment>
          : null
        }
        <div id="room-settings-submit-wrapper">
          <button className="styled-button" onClick={this.handleSubmit} >Save Changes</button>
          <button className="styled-button" onClick={this.cancel} >Cancel</button>
        </div>
        {this.state.progress
          ? <div id="room-settings-progress">
            <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
          </div>
          : null
        }
      </form>
    </Fragment>
  }
}
