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

    this.initialReadability = props.room.getHistoryVisibility()
    this.mayChangeReadability = this.roomState.maySendStateEvent(Matrix.EventType.RoomHistoryVisibility, Client.client.getUserId())

    this.joinLink = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}` +
      `?join=${encodeURIComponent(props.room.roomId)}&via=${Client.client.getDomain()}`
    this.powerLevels = this.roomState.getStateEvents(Matrix.EventType.RoomPowerLevels, "")?.getContent()

    this.member = props.room.getMember(Client.client.getUserId())

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

  componentDidMount () { this.initialize() }

  componentDidUpdate () { this.resize() }

  settingsFormWrapper = createRef()

  settingsForm = createRef()

  avatarImageInput = createRef()

  setInvitePowerLevel = createRef()

  setKickPowerLevel = createRef()

  setBanPowerLevel = createRef()

  setRedactPowerLevel = createRef()

  setMessagePowerLevel = createRef()

  setAnnotationPowerLevel = createRef()

  async initialize() {
    let sendStatePowerLevel = 50
    if (this.powerLevels) {
      const pl = this.powerLevels?.state_default
      if (Number.isSafeInteger(pl)) sendStatePowerLevel = pl
    }
    if (this.member.powerLevel >= sendStatePowerLevel) this.mayChangeVisibility = true 
    // assume you can if you have 50 power---per advice from #matrix-spec, since this is implementation-dependent
    const visibility = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialVisibility = visibility
    const references = this.roomState.getStateEvents(spaceParent)
    this.setState({ references, visibility: visibility.visibility })
    this.resize()
  }

  resize = _ => this.settingsFormWrapper.current.style.height = `${this.settingsForm.current.scrollHeight}px`

  handleJoinRuleChange = e => this.setState({ joinRule: e.target.value })

  handleReadabilityChange = e => this.setState({ readability: e.target.value })

  handleNameInput = e => this.setState({ roomName: e.target.value })

  handleKeydown = e => e.stopPropagation() // don't go to global keypress handler

  handleUploadAvatar = _ => this.avatarImageInput.current.click()

  handleVisibilityChange = e => this.setState({ visibility: e.target.value })

  progressHandler = (progress) => this.setState({progress})

  handleSubmit = async e => {
    e.preventDefault()
    if (this.state.visibility !== this.initialVisibility) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.visibility).catch(this.raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) await this.updateJoinRule()
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(this.raiseErr)
    if (this.state.readability !== this.initialReadability) await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomHistoryVisibility, {
      history_visibility: this.state.readability
    }).catch(this.raiseErr)

    if (this.setInvitePowerLevel.current.updatedValue()) this.powerLevels.invite = this.setInvitePowerLevel.current.updatedValue().updated
    if (this.setBanPowerLevel.current.updatedValue()) this.powerLevels.ban = this.setBanPowerLevel.current.updatedValue().updated
    if (this.setKickPowerLevel.current.updatedValue()) this.powerLevels.kick= this.setKickPowerLevel.current.updatedValue().updated
    if (this.setRedactPowerLevel.current.updatedValue()) this.powerLevels.redact = this.setRedactPowerLevel.current.updatedValue().updated
    if (this.setMessagePowerLevel.current?.updatedValue()) this.powerLevels.events_default = this.setMessagePowerLevel.current.updatedValue().updated
    if (this.setAnnotationPowerLevel.current?.updatedValue()) this.powerLevels.events[spaceChild] = this.setAnnotationPowerLevel.current.updatedValue().updated



    const powerLevelsUpdated = !!(this.setInvitePowerLevel.current.updatedValue()) ||
      !!(this.setBanPowerLevel.current.updatedValue()) ||
      !!(this.setKickPowerLevel.current.updatedValue()) ||
      !!(this.setRedactPowerLevel.current.updatedValue()) ||
      !!(this.setMessagePowerLevel.current.updatedValue()) ||
      !!(this.setAnnotationPowerLevel.current.updatedValue())
    
    // if I update power levels, then send the updated contents
    if (powerLevelsUpdated) await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomPowerLevels, 
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
      <div ref={this.settingsFormWrapper} id="room-settings-form-wrapper">
        <form 
          ref={this.settingsForm}
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
              <select disabled={!state.visibility || !this.mayChangeVisibility}
                class="styled-input"
                value={state.visibility}
                name="visibility"
                onchange={this.handleVisibilityChange}>
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
                <ConfigurePowerForKey
                  ref={this.setInvitePowerLevel}
                  powerLevels={this.powerLevels}
                  powerKey="invite"
                  label="Invite"
                  member={this.member}
                  resize={this.resize}
                  act="invite new members" />
                <ConfigurePowerForKey
                  ref={this.setKickPowerLevel}
                  powerLevels={this.powerLevels}
                  powerKey="kick"
                  label="Kick"
                  member={this.member}
                  resize={this.resize}
                  act="remove users from the room" />
                <ConfigurePowerForKey
                  ref={this.setBanPowerLevel}
                  powerLevels={this.powerLevels}
                  powerKey="ban"
                  label="Ban"
                  member={this.member}
                  resize={this.resize}
                  act="remove users and ban them from rejoining" />
                <ConfigurePowerForKey
                  ref={this.setRedactPowerLevel}
                  powerLevels={this.powerLevels}
                  powerKey="redact"
                  label="Redact"
                  member={this.member}
                  resize={this.resize}
                  act="remove any message from the room" />
                {props.room.getType() === Matrix.RoomType.Space 
                  ? null
                  : <ConfigurePowerForKey
                      ref={this.setMessagePowerLevel}
                      powerLevels={this.powerLevels}
                      powerKey="events_default"
                      label="Message"
                      member={this.member}
                      resize={this.resize}
                      act="send messages" />
                }
               { Resource.hasResource(props.room)
                   ? <ConfigurePowerForState 
                      ref={this.setAnnotationPowerLevel}
                      powerLevels={this.powerLevels}
                      type={spaceChild}
                      label="Annotate"
                      member={this.member}
                      resize={this.resize}
                      act="create annotations" />
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
      </div>
    </Fragment>
  }
}

class ConfigurePowerForState extends Component {
  constructor(props) {
    super(props)
    this.mayChangePowerLevel = this.mayChangePowerLevelForStateEvent()
    this.initialPowerLevel = this.getPowerLevelForStateEvent()
    this.initialRole =  this.initialPowerLevel >= 100 ? "admin" 
        : this.initialPowerLevel >= 50 ? "mod"
        : this.initialPowerLevel === 0 ? "member"
        : "custom"

    this.isMod = props.member.powerLevels >= 50
    this.isAdmin = props.member.powerLevels >= 100
    this.state = { requiredRole: this.initialRole }
  }

  getPowerLevelForStateEvent = _ => {
    if (this.props.type in this.props.powerLevels?.events) return this.props.powerLevels.events[this.props.type]
    let sendStatePowerLevel = 50
    if (this.props.powerLevels) {
      const pl = this.props.powerLevels?.state_default
      if (Number.isSafeInteger(pl)) sendStatePowerLevel = pl
    }
    return sendStatePowerLevel
  }

  handleChange = e => this.setState({ requiredRole: e.target.value }, this.props.resize)
  
  // but the maximum you can change it to is your own power level
  mayChangePowerLevelForStateEvent = _ => {
    if (Matrix.EventType.RoomPowerLevels in this.props.powerLevels?.events) {
      // forbidden if it's already set higher than your own level
      if (this.props.member.powerLevel < getPowerLevelForStateEvent(this.props.type)) return false
      // or if you can't send power level events
      const toAdjustPowerLevels = this.props.powerLevels.events[Matrix.EventType.RoomPowerLevels]
      return (this.props.member.powerLevel >= toAdjustPowerLevels)
    }
    return true
  }

  updatedValue = _ => {
    if (this.state.requiredRole === this.initialRole) return null
    if (this.state.requiredRole === "admin") return {updated:100}
    if (this.state.requiredRole === "mod") return {updated: 50}
    if (this.state.requiredRole === "member") return {updated: 0}
    // use object here to avoid 0-is-falsy footgun
    // it shouldn't be possible to return "custom", since those values can be displayed but not set ATM
  }

  render(props, state) {
    return <Fragment>
        <label htmlFor={props.label}>{props.label}</label>
        <select class="styled-input" value={state.requiredRole} disabled={!this.mayChangePowerLevel} name={props.label} onchange={this.handleChange}>
          <option value="admin">Administrators only</option>
          <option value="mod">Moderators and above</option>
          <option value="member">Any member</option>
          {this.initialRole === "custom" ? <option value="custom">Custom Value</option>: null}
        </select>
        <div class="room-settings-info">
          {state.requiredRole === "admin" ? `Only admins can ${props.act}`
            : state.requiredRole === "mod" ? `Admins and moderators can ${props.act}`
            : state.requiredRole === "member" ? `Any room member can ${props.act}`
            : `Powerlevel ${this.initialPowerLevel} is required to ${props.act}`
          }
        </div>
      </Fragment>
  }
}

class ConfigurePowerForKey extends Component {
  constructor(props) {
    super(props)
    this.mayChangePowerLevel = this.mayChangePowerLevelForKey()
    this.initialPowerLevel = this.getPowerLevelForKey()
    this.initialRole =  this.initialPowerLevel === 100 ? "admin" 
        : this.initialPowerLevel === 50 ? "mod"
        : this.initialPowerLevel === 0 ? "member"
        : "custom"

    this.isMod = props.member.powerLevels >= 50
    this.isAdmin = props.member.powerLevels >= 100
    this.state = { requiredRole: this.initialRole }
  }

  getPowerLevelForKey = _ => {
    if (this.props.powerKey in this.props.powerLevels) return this.props.powerLevels[this.props.powerKey]
    if (this.props.powerKey === "events_default") return 0
    // if there's no powerlevel event, the state_default is zero, but that's
    // irrelevant because mayChange below will return true.
    return 50
  }

  handleChange = e => this.setState({ requiredRole: e.target.value }, this.props.resize)
  
  // but the maximum you can change it to is your own power level
  mayChangePowerLevelForKey = _ => {
    if (Matrix.EventType.RoomPowerLevels in this.props.powerLevels?.events) {
      // forbidden if your powerlevel is lower than the current value
      if (this.props.member.powerLevel < this.getPowerLevelForKey(this.props.powerKey)) return false
      // or if you can't send power level events
      const toAdjustPowerLevels = this.props.powerLevels.events[Matrix.EventType.RoomPowerLevels]
      return (this.props.member.powerLevel >= toAdjustPowerLevels)
    }
    return true
  }

  updatedValue = _ => {
    if (this.state.requiredRole === this.initialRole) return null
    if (this.state.requiredRole === "admin") return {updated:100}
    if (this.state.requiredRole === "mod") return {updated: 50}
    if (this.state.requiredRole === "member") return {updated: 0}
    // use object here to avoid 0-is-falsy footgun
    // it shouldn't be possible to return "custom", since those values can be displayed but not set ATM
  }

  render(props, state) {
    return <Fragment>
        <label htmlFor={props.label}>{props.label}</label>
        <select class="styled-input" value={state.requiredRole} disabled={!this.mayChangePowerLevel} name={props.label} onchange={this.handleChange}>
          <option value="admin">Administrators only</option>
          <option value="mod">Moderators and above</option>
          <option value="member">Any member</option>
          {this.initialRole === "custom" ? <option value="custom">Custom Value</option>: null}
        </select>
        <div class="room-settings-info">
          {state.requiredRole === "admin" ? `Only admins can ${props.act}`
            : state.requiredRole === "mod" ? `Admins and moderators can ${props.act}`
            : state.requiredRole === "member" ? `Any room member can ${props.act}`
            : `Powerlevel ${this.initialPowerLevel} is required to ${props.act}`
          }
        </div>
      </Fragment>
  }
}
