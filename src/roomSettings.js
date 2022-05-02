import { h, Component, createRef, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import { loadImageElement } from "./utils/media.js"
import Location from './utils/location.js'
import Resource from './utils/resource.js'
import * as Icons from './icons.js'
import * as PopupMenu from './popUpMenu.js'
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

    this.initialRoomName = props.room.name
    this.mayChangeRoomName = this.roomState.maySendStateEvent(Matrix.EventType.RoomName, Client.client.getUserId())

    this.initialReadability = props.room.getHistoryVisibility()
    this.mayChangeReadability = this.roomState.maySendStateEvent(Matrix.EventType.RoomHistoryVisibility, Client.client.getUserId())

    this.joinLink = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}` +
      `?join=${encodeURIComponent(props.room.roomId)}&via=${Client.client.getDomain()}`
    this.powerLevels = this.roomState.getStateEvents(Matrix.EventType.RoomPowerLevels, "")?.getContent()
    // TODO: add a warning for the case where the powerLevels event is missing
    console.log(this.powerLevels)

    this.member = props.room.getMember(Client.client.getUserId())

    this.state = {
      previewUrl: props.room.getAvatarUrl(`https://${Client.client.getDomain()}`, 300, 300, "crop"),
      joinRule: this.initialJoinRule,
      roomName: this.initialRoomName,
      readability: this.initialReadability,
      users: this.powerLevels?.users || {},
      visibility: null,
      references: null,
      view: "APPEARANCE"
    }
  }

  componentDidMount () { this.initialize() }

  componentDidUpdate () { this.resize() }

  settingsFormWrapper = createRef()

  settingsForm = createRef()

  avatarImageInput = createRef()

  async initialize() {
    let sendStatePowerLevel = 50
    if (this.powerLevels) {
      const pl = this.powerLevels?.state_default
      if (Number.isSafeInteger(pl)) sendStatePowerLevel = pl
    }
    if (this.member.powerLevel >= sendStatePowerLevel) this.mayChangeVisibility = true 
    // assume you can if you have 50 power---per advice from #matrix-spec, since this is implementation-dependent
    const visibility = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialVisibility = visibility.visibility
    const references = this.roomState.getStateEvents(spaceParent)
    this.setState({ references, visibility: visibility.visibility })
    this.resize()
  }

  resize = _ => {
    clearTimeout(this.allowOverflow)
    this.settingsFormWrapper.current.style.height = `${this.settingsForm.current.scrollHeight}px`
    // we pause and reactivate overflow to allow the popup menu to overflow the box.
    this.settingsFormWrapper.current.style.overflowY = "hidden"
    this.allowOverflow = setTimeout(_ => this.settingsFormWrapper.current.style.overflowY = "visible", 250)
  }

  handleJoinRuleChange = e => this.setState({ joinRule: e.target.value })

  handleReadabilityChange = e => this.setState({ readability: e.target.value })

  handleNameInput = e => this.setState({ roomName: e.target.value })

  handleKeydown = e => e.stopPropagation() // don't go to global keypress handler

  handleUploadAvatar = _ => this.avatarImageInput.current.click()

  handleVisibilityChange = e => this.setState({ visibility: e.target.value })

  progressHandler = (progress) => this.setState({progress})

  roleToPowerLevel = role => role === "admin" ? 100
      : role === "mod" ? 50
      : 0 // should never be called on "custom" power level
  
  powerLevelsUpdated = _ => 
      !!this.state.invite         ||
      !!this.state.ban            ||
      !!this.state.kick           ||
      !!this.state.redact         ||
      !!this.state.events_default ||
      !!this.state[spaceChild]    ||
      this.rolesUpdated()
      

  rolesUpdated = _ => {
    for (const user in this.state.users) {
      if (!(user in this.powerLevels?.users)) return true
      if (this.state.users[user] !== this.powerLevels?.users?.[user]) return true
    }
    for (const user in this.powerLevels?.users) {
      if (!(user in this.state.users)) return true
      if (this.state.users[user] !== this.powerLevels?.users?.[user]) return true
    }
    return false
  }

  handleSubmit = async e => {
    e.preventDefault()
    if (this.state.visibility !== this.initialVisibility) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.visibility).catch(this.raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) await this.updateJoinRule()
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(this.raiseErr)
    if (this.state.readability !== this.initialReadability) await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomHistoryVisibility, {
      history_visibility: this.state.readability
    }).catch(this.raiseErr)

    if (this.powerLevelsUpdated()) {
      if (this.state.invite) this.powerLevels.invite = this.roleToPowerLevel(this.state.invite)
      if (this.state.ban) this.powerLevels.ban = this.roleToPowerLevel(this.state.ban)
      if (this.state.kick) this.powerLevels.kick = this.roleToPowerLevel(this.state.kick)
      if (this.state.redact) this.powerLevels.redact = this.roleToPowerLevel(this.state.redact)
      if (this.state.events_default) this.powerLevels.events_default = this.roleToPowerLevel(this.state.events_default)
      if (this.state[spaceChild]) this.powerLevels.events[spaceChild] = this.roleToPowerLevel(this.state[spaceChild])
      if (this.rolesUpdated()) this.powerLevels.users = this.state.users

      await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomPowerLevels, this.powerLevels).catch(this.raiseErr)
    }

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

  showAppearance = _ => this.setState({view: "APPEARANCE"})

  showAccess = _ => this.setState({view: "ACCESS"})

  showLinks = _ => this.setState({view: "LINKS"})

  showRoles = _ => this.setState({view: "ROLES"})

  showPermissions = _ => this.setState({view: "PERMISSIONS"})

  uploadAvatar = _ => this.avatarImageInput.current.click()

  removeAvatar = _ => this.setState({ previewUrl: null })

  setPowerLevelRole = (s,role) => this.setState({[s]:role})

  setUsers = users => this.setState({users})

  cancel = e => {
    e.preventDefault()
    Modal.hide()
  }

  render(props, state) {
    const updated = this.powerLevelsUpdated()            ||
      this.state.visibility !== this.initialVisibility   ||
      this.state.joinRule !== this.initialJoinRule       ||
      this.state.roomName !== this.initialRoomName       ||
      this.state.readability !== this.initialReadability ||
      this.avatarImage && /^image/.test(this.avatarImage.type)

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
                disabled={!this.mayChangeRoomName}
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
                <AdminList 
                  initialUsers={this.powerLevels?.users} 
                  users={this.state.users} 
                  setUsers={this.setUsers}
                  room={props.room}
                />
                <ModList 
                  initialUsers={this.powerLevels?.users} 
                  users={this.state.users} 
                  setUsers={this.setUsers}
                  room={props.room}
                />
                <OtherRoleList users={this.state.users} />
            </Fragment>
            : state.view === "PERMISSIONS" ? <Fragment>
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="invite"
                  requiredRole={state.invite}
                  label="Invite"
                  member={this.member}
                  resize={this.resize}
                  act="invite new members" />
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="kick"
                  label="Kick"
                  requiredRole={state.kick}
                  member={this.member}
                  resize={this.resize}
                  act="remove users from the room" />
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="ban"
                  label="Ban"
                  requiredRole={state.ban}
                  member={this.member}
                  resize={this.resize}
                  act="remove users and ban them from rejoining" />
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="redact"
                  label="Redact"
                  requiredRole={state.redact}
                  member={this.member}
                  resize={this.resize}
                  act="remove any message from the room" />
                {props.room.getType() === Matrix.RoomType.Space 
                  ? null
                  : <ConfigurePowerForKey
                      setPowerLevelRole={this.setPowerLevelRole}
                      powerLevels={this.powerLevels}
                      powerKey="events_default"
                      label="Message"
                      requiredRole={state.events_default}
                      member={this.member}
                      resize={this.resize}
                      act="send messages" />
                }
               { Resource.hasResource(props.room)
                   ? <ConfigurePowerForState 
                      setPowerLevelRole={this.setPowerLevelRole}
                      powerLevels={this.powerLevels}
                      type={spaceChild}
                      requiredRole={state[spaceChild]}
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
            <button disabled={!updated} className="styled-button" onClick={this.handleSubmit} >Save Changes</button>
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

  handleChange = e => {
    if (e.target.value === this.initialRole) this.props.setPowerLevelRole(this.props.type, undefined)
    else this.props.setPowerLevelRole(this.props.type, e.target.value)
  }

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

  render(props) {
    const currentRole = props.requiredRole || this.initialRole
    return <Fragment>
        <label htmlFor={props.label}>{props.label}</label>
        <select class="styled-input" value={currentRole} disabled={!this.mayChangePowerLevel} name={props.label} onchange={this.handleChange}>
          <option disabled={props.member.powerLevels < 100} value="admin">Administrators only</option>
          <option disabled={props.member.powerLevels < 50} value="mod">Moderators and above</option>
          <option value="member">Any member</option>
          {this.initialRole === "custom" ? <option value="custom">Custom Value</option>: null}
        </select>
        <div class="room-settings-info">
          {currentRole === "admin" ? `Only admins can ${props.act}`
            : currentRole === "mod" ? `Admins and moderators can ${props.act}`
            : currentRole === "member" ? `Any room member can ${props.act}`
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
  }

  getPowerLevelForKey = _ => {
    if (this.props.powerKey in this.props.powerLevels) return this.props.powerLevels[this.props.powerKey]
    if (this.props.powerKey === "events_default") return 0
    // if there's no powerlevel event, the state_default is zero, but that's
    // irrelevant because mayChange below will return true.
    return 50
  }

  handleChange = e => {
    if (e.target.value === this.initialRole) this.props.setPowerLevelRole(this.props.powerKey, undefined)
    else this.props.setPowerLevelRole(this.props.powerKey, e.target.value)
  }
  
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

  render(props) {
    const currentRole = props.requiredRole || this.initialRole
    return <Fragment>
        <label htmlFor={props.label}>{props.label}</label>
        <select class="styled-input" value={currentRole} disabled={!this.mayChangePowerLevel} name={props.label} onchange={this.handleChange}>
          <option value="admin">Administrators only</option>
          <option value="mod">Moderators and above</option>
          <option value="member">Any member</option>
          {this.initialRole === "custom" ? <option value="custom">Custom Value</option>: null}
        </select>
        <div class="room-settings-info">
          {currentRole === "admin" ? `Only admins can ${props.act}`
            : currentRole === "mod" ? `Admins and moderators can ${props.act}`
            : currentRole === "member" ? `Any room member can ${props.act}`
            : `Powerlevel ${this.initialPowerLevel} is required to ${props.act}`
          }
        </div>
      </Fragment>
  }
}

class AdminList extends Component {
  constructor(props) {
    super(props)
    this.state = { search: "" }
  }

  toggleAdmin = user => {
    const newUsers = Object.assign ({}, this.props.users)
    if (newUsers[user] !== 100) newUsers[user] = 100
    else delete newUsers[user]
    this.props.setUsers(newUsers)
  }

  getAdmins = _ => {
    let admins = []
    for (const user in this.props.users) {
      if (this.props.users[user] === 100) {
        const activated = !(user in this.props.initialUsers) ||
          this.props.initialUsers[user] !== this.props.users[user]
        admins.push(<RoleListing 
          activated={activated}
          toggleRole={this.toggleAdmin}
          room={this.props.room}
          key={user}
          user={user}
          />)
      }
    }
    for (const user in this.props.initialUsers) {
      if (this.props.initialUsers[user] === 100 && !(user in this.props.users))
        admins.push(<RoleListing
          deactivated
          toggleRole={this.toggleAdmin}
          room={this.props.room}
          key={user}
          user={user}
          />)
    }
    if (admins.length > 0) return admins
    else return <div class="room-settings-role-empty">No admins!</div>
  }

  canAdd = this.props.room.getMember(Client.client.getUserId()).powerLevel >= 50

  render(props) {
    return <div class="room-settings-role-list">
      <h5>Administrators</h5>
      {this.getAdmins()}
      {this.canAdd ? <AddRole users={props.users} toggleRole={this.toggleAdmin} room={props.room}/> : null}
    </div>
  }
}

class AddRole extends Component {
  constructor(props) {
    super(props)
    this.state = { search: "" }
  }

  searchInput = createRef()

  handleInput = e => this.setState({search: e.target.value})

  setSearch = search => this.setState({search})

  popupActions = { "@": props => <PopupMenu.Members roomId={this.props.room.roomId} {...props} />, }

  addRole = userId => {
    this.setSearch("")
    if (Client.client.getUserId() !== userId.trim()) {
      const theirPower = this.props.room.getMember(userId.trim()).powerLevel
      const myPower = this.props.room.getMember(Client.client.getUserId()).powerLevel
      console.log(theirPower, myPower)
      if (theirPower >= myPower) return // TODO could trigger a transitent explainer here.
    }
    this.props.toggleRole(userId.trim())
  }

  render(props, state) {
    return <div class="room-settings-add-role">
      <span class="small-icon">{Icons.userPlus}</span>
      <div class="room-settings-add-role-input-wrapper">
        <input ref={this.searchInput} oninput={this.handleInput} value={state.search} type="text" class="styled-input" />
        <PopupMenu.Menu
          below={true}
          textValue={state.search}
          textarea={this.searchInput}
          actions={this.popupActions}
          getSelection={this.addRole}
        />
      </div>
    </div>
  }
}

class ModList extends Component {

  getMods = _ => {
    let mods = []
    for (const user in this.props.users) {
      if (this.props.users[user] === 50) {
        const activated = !(user in this.props.initialUsers) ||
          this.props.initialUsers[user] !== this.props.users[user]
        mods.push(<RoleListing 
          activated={activated}
          toggleRole={this.toggleMod}
          key={user}
          room={this.props.room}
          user={user}
          power={50} />)
      }
    }
    for (const user in this.props.initialUsers) {
      if (this.props.initialUsers[user] === 50 && !(user in this.props.users))
        mods.push(<RoleListing
          deactivated
          toggleRole={this.toggleMod}
          key={user}
          room={this.props.room}
          user={user}
          power={50} />)
    }
    if (mods.length > 0) return mods
    else return <div class="room-settings-role-empty">None</div>
  }

  toggleMod = user => {
    const newUsers = Object.assign ({}, this.props.users)
    if (newUsers[user] !== 50) newUsers[user] = 50
    else delete newUsers[user]
    this.props.setUsers(newUsers)
  }

  canAdd = this.props.room.getMember(Client.client.getUserId()).powerLevel >= 50

  render(props) {
    return <div class="room-settings-role-list">
      <h5>Moderators</h5>
      {this.getMods()}
      {this.canAdd ? <AddRole users={props.users} toggleRole={this.toggleMod} room={props.room}/> : null}
    </div>
  }
}


class RoleListing extends Component {

  handleClick = _ => { this.props.toggleRole(this.props.user) }

  canToggle = 
    this.props.user === Client.client.getUserId() || 
    this.props.activated ||
    this.props.power < this.props.room.getMember(Client.client.getUserId()).powerLevel

  render(props) {
    return <button type="button"
        data-role-deactivated={props.deactivated}
        data-role-toggleable={this.canToggle}
        onclick={this.canToggle ? this.handleClick : null}
        class="room-settings-role-listing">
        <span class="small-icon">{props.deactivated ? Icons.userPlus : Icons.userMinus}</span>
        <span class="room-settings-role-user"> {props.user}</span>
        {props.activated ? <span class="room-settings-role-change-info">will be added to this role</span> : null}
        {props.deactivated ? <span class="room-settings-role-change-info">will be removed from this role</span> : null}
        {(props.deactivated || props.activated) && Client.client.getUserId() === props.user 
            ? <span style={{marginTop: "5px", color:"red"}} class="room-settings-role-change-info">
                <b>Warning</b>: changing your own role can be irreversible, and can cause you to lose control of the room.
            </span> 
            : null
        }
      </button>
  }
}


class OtherRoleList extends Component {

  getOtherRoles = _ => {
    let others = []
    for (const user in this.props.users) {
      if (this.props.users[user] !== 100 && this.props.users[user] !== 50)
        others.push(<div class="room-settings-otherrole-listing" key={user}>{user}</div>)
    }
    if (others.length > 0) return others
    else return null
  }

  render() {
    if (!this.getOtherRoles()) return null
    else return <div class="room-settings-role-list">
      <h5>Other Roles</h5>
      {this.getOtherRoles()}
    </div>
  }
}

