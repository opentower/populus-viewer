import { h, Component, createRef, Fragment } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import Location from './utils/location.js'
import Resource from './utils/resource.js'
import * as Icons from './icons.js'
import * as PopupMenu from './popUpMenu.js'
import Modal from './modal.js'
import CopyButton from './utils/copyButton.js'
import AvatarSelector from './avatarSelector.js'
import { mscLocation } from './constants.js';
import "./styles/roomSettings.css"

export default class RoomSettings extends Component {
  constructor(props) {
    super(props)
    this.roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.resourceState = props.resource?.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)

    this.initialJoinRule = this.roomState.getJoinRule()
    this.mayChangeJoinRule = this.roomState.maySendStateEvent(Matrix.EventType.RoomJoinRules, Client.client.getUserId())

    this.mayChangeAvatar = this.roomState.maySendStateEvent(Matrix.EventType.RoomAvatar, Client.client.getUserId())

    this.initialRoomName = props.room.name
    this.mayChangeRoomName = this.roomState.maySendStateEvent(Matrix.EventType.RoomName, Client.client.getUserId())

    this.initialRoomTopic= this.roomState.getStateEvents(Matrix.EventType.RoomTopic, "")?.getContent()?.topic
    this.mayChangeRoomTopic = this.roomState.maySendStateEvent(Matrix.EventType.RoomTopic, Client.client.getUserId())

    this.initialReadability = props.room.getHistoryVisibility()

    if (this.resourceState) {
      this.initialSpaceVisibility = this.resourceState.getStateEvents(Matrix.EventType.SpaceChild, props.room.roomId)?.getContent()?.via
        ? "visible"
        : "hidden"
      this.mayChangeSpaceVisibility = this.resourceState.maySendStateEvent(Matrix.EventType.SpaceChild, Client.client.getUserId())
    }

    this.restrictedAvailable = !["1","2","3","4","5","6","7"].includes(props.room.getVersion()) && 
        this.roomState.getStateEvents(Matrix.EventType.SpaceChild).length > 0

    this.mayChangeReadability = this.roomState.maySendStateEvent(Matrix.EventType.RoomHistoryVisibility, Client.client.getUserId())

    this.joinLink = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}` +
      `?join=${encodeURIComponent(props.room.roomId)}&via=${Client.client.getDomain()}`
    this.powerLevels = this.roomState.getStateEvents(Matrix.EventType.RoomPowerLevels, "")?.getContent()

    // TODO: add a warning for the case where the powerLevels event is missing

    this.member = props.room.getMember(Client.client.getUserId())

    this.state = {
      previewUrl: props.room.getAvatarUrl(Client.client.getHomeserverUrl(), 400, 400, "crop"),
      joinRule: this.initialJoinRule,
      roomName: this.initialRoomName,
      readability: this.initialReadability,
      spaceVisibility: this.initialSpaceVisibility,
      roomTopic: this.initialRoomTopic,
      users: this.powerLevels?.users || {},
      discovery: null,
      references: null,
      view: "APPEARANCE"
    }
  }

  componentDidMount () { 
    this.initialize() 
    this.resizeObserver.observe(this.settingsForm.current)
    this.roomTopicTextarea.current.style.height = 'auto';
    this.roomTopicTextarea.current.style.height = `${this.roomTopicTextarea.current.scrollHeight}px`;
  }

  componentWillUnmount() { 
    this.resizeObserver.disconnect() 
    clearTimeout(this.allowOverflow)
  }

  resizeObserver = new ResizeObserver(_ => this.resize())

  settingsFormWrapper = createRef()

  settingsForm = createRef()

  avatarSelector = createRef()

  roomTopicTextarea = createRef()

  async initialize() {
    let sendStatePowerLevel = 50
    if (this.powerLevels) {
      const pl = this.powerLevels?.state_default
      if (Number.isSafeInteger(pl)) sendStatePowerLevel = pl
    }
    if (this.member.powerLevel >= sendStatePowerLevel) this.mayChangeDiscovery = true 
    // assume you can if you have 50 power---per advice from #matrix-spec, since this is implementation-dependent
    const discovery = await Client.client.getRoomDirectoryVisibility(this.props.room.roomId)
    this.initialDiscovery = discovery.visibility
    const references = this.roomState.getStateEvents(Matrix.EventType.SpaceParent)
    this.setState({ references, discovery: discovery.visibility })
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

  handleSpaceVisibilityChange = e => this.setState({ spaceVisibility: e.target.value })

  handleNameInput = e => this.setState({ roomName: e.target.value })

  handleTopicInput = e => {
    this.setState({ roomTopic: e.target.value })
    this.roomTopicTextarea.current.style.height = "auto"
    this.roomTopicTextarea.current.style.height = `${this.roomTopicTextarea.current.scrollHeight}px`;
  }

  handleKeydown = e => e.stopPropagation() // don't go to global keypress handler

  handleDiscoveryChange = e => this.setState({ discovery: e.target.value })

  progressHandler = (progress) => this.setState({progress})

  avatarUpdateHandler = () => this.setState({avatarUpdated: true})

  roleToPowerLevel = role => role === "admin" ? 100
      : role === "mod" ? 50
      : 0 // should never be called on "custom" power level
  
  powerLevelsUpdated = _ => 
      !!this.state.invite         ||
      !!this.state.ban            ||
      !!this.state.kick           ||
      !!this.state.redact         ||
      !!this.state.events_default ||
      !!this.state[Matrix.EventType.SpaceChild]    ||
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
    this.setState({progress: "updating settings..."})
    this.forceUpdate()
    if (this.state.discovery !== this.initialDiscovery) await Client.client.setRoomDirectoryVisibility(this.props.room.roomId, this.state.discovery).catch(this.raiseErr)
    if (this.state.joinRule !== this.initialJoinRule) {
      const allowList = this.props.resource 
        ? [{type:"m.room_membership", room_id: this.props.resource.room.roomId}]
        : this.roomState.getStateEvents(spaceParent).map(ev => ({ type:"m.room_membership", room_id: ev.getStateKey() }))
      const newRule = {
        join_rule: this.state.joinRule, 
        ...(this.state.joinRule === "restricted" && {allow: allowList})
      }
      await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomJoinRules, newRule, "").catch(this.raiseErr)
    }
    if (this.state.spaceVisibility !== this.initialSpaceVisibility) this.state.spaceVisibility === "visible" ? this.publishReferences() : this.hideReferences()
    if (this.state.roomName !== this.initialRoomName) await Client.client.setRoomName(this.props.room.roomId, this.state.roomName).catch(this.raiseErr)
    if (this.state.roomTopic !== this.initialRoomTopic) await Client.client.setRoomTopic(this.props.room.roomId, this.state.roomTopic).catch(this.raiseErr)
    if (this.state.readability !== this.initialReadability) await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomHistoryVisibility, {
      history_visibility: this.state.readability
    }).catch(this.raiseErr)

    if (this.powerLevelsUpdated()) {
      if (this.state.invite) this.powerLevels.invite = this.roleToPowerLevel(this.state.invite)
      if (this.state.ban) this.powerLevels.ban = this.roleToPowerLevel(this.state.ban)
      if (this.state.kick) this.powerLevels.kick = this.roleToPowerLevel(this.state.kick)
      if (this.state.redact) this.powerLevels.redact = this.roleToPowerLevel(this.state.redact)
      if (this.state.events_default) this.powerLevels.events_default = this.roleToPowerLevel(this.state.events_default)
      if (this.state[Matrix.EventType.SpaceChild]) this.powerLevels.events[Matrix.EventType.SpaceChild] = this.roleToPowerLevel(this.state[Matrix.EventType.SpaceChild])
      if (this.rolesUpdated()) this.powerLevels.users = this.state.users

      await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomPowerLevels, this.powerLevels).catch(this.raiseErr)
    }

    await this.avatarSelector.current.uploadAvatar()

    Modal.hide()
  }

  raiseErr = _ => alert("Щось пішло не так. Можливо, у вас немає дозволу на зміну деяких з цих налаштувань.")

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
        .sendStateEvent(theLocation.getParent(), Matrix.EventType.SpaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    }
  }

  hideReferences() {
    for (const reference of this.state.references) {
      const theLocation = new Location(reference)
      if (!theLocation.isValid()) continue
      const childContent = {}
      Client.client
        .sendStateEvent(theLocation.getParent(), Matrix.EventType.SpaceChild, childContent, this.props.room.roomId)
        .catch(e => alert(e))
    }
  }

  showAppearance = _ => this.setState({view: "APPEARANCE"})

  showAccess = _ => this.setState({view: "ACCESS"})

  showLinks = _ => this.setState({view: "LINKS"})

  showRoles = _ => this.setState({view: "ROLES"})

  showPermissions = _ => this.setState({view: "PERMISSIONS"})

  setPowerLevelRole = (s,role) => this.setState({[s]:role})

  setUsers = users => this.setState({users})

  cancel = e => {
    e.preventDefault()
    Modal.hide()
  }

  render(props, state) {
    const updated = this.powerLevelsUpdated()                       ||
      this.state.discovery !== this.initialDiscovery                ||
      this.state.joinRule !== this.initialJoinRule                  ||
      this.state.roomName !== this.initialRoomName                  ||
      this.state.roomTopic !== this.initialRoomTopic                ||
      this.state.readability !== this.initialReadability            ||
      this.state.spaceVisibility !== this.initialSpaceVisibility    ||
      this.state.avatarUpdated

    return <Fragment>
      <div id="room-settings-select-view" class="select-view">
        <button onClick={this.showAppearance} data-current-button={state.view==="APPEARANCE"}>Зовнішній вигляд</button>
        <button onClick={this.showAccess} data-current-button={state.view==="ACCESS"}>Доступність</button>
        <button onClick={this.showRoles} data-current-button={state.view==="ROLES"}>Медики</button>
        <button onClick={this.showPermissions} data-current-button={state.view==="PERMISSIONS"}>Дозволи</button>
        {props.joinLink ? <button onClick={this.showLinks} data-current-button={state.view==="LINKS"}>Посилання</button> : null}
      </div>
      <div ref={this.settingsFormWrapper} id="room-settings-form-wrapper">
        <form 
          ref={this.settingsForm}
          id="room-settings-form">
          {state.view === "APPEARANCE"
            ? <Fragment>
              <AvatarSelector 
                ref={this.avatarSelector}
                previewUrl={state.previewUrl} 
                room={props.room}
                progressHandler={this.progressHandler}
                handleUpdate={this.avatarUpdateHandler}
              />
              <div class="room-settings-info" />
              <label htmlFor="room-name">Назва карти</label>
              <input name="room-name"
                type="text"
                class="styled-input"
                value={state.roomName}
                disabled={!this.mayChangeRoomName}
                onkeydown={this.handleKeydown}
                onInput={this.handleNameInput}
              />
              <div class="room-settings-info"></div>
              <label class="top-aligned-label" htmlFor="room-topic">Примітки</label>
              <textarea ref={this.roomTopicTextarea} name="room-topic"
                class="styled-input"
                value={state.roomTopic}
                disabled={!this.mayChangeRoomTopic}
                onkeydown={this.handleKeydown}
                onInput={this.handleTopicInput}
              />
              <div class="room-settings-info" />
            </Fragment>
            : state.view === "ACCESS"
            ? <Fragment>
              <label htmlFor="discovery">Видимість</label>
              <select disabled={!state.discovery|| !this.mayChangeDiscovery}
                class="styled-input"
                value={state.discovery}
                name="discovery"
                onchange={this.handleDiscoveryChange}>
                <option value="private">Приватно</option>
                <option value="public">Публічний перегляд</option>
              </select>
              <div class="room-settings-info">
                {state.discovery === "public"
                  ? "запис з'явиться в результатах пошуку"
                  : "запис не буде відображатися в результатах пошуку"
                }
              </div>
              <label htmlFor="joinRule">Обмеженя доступу</label>
              <select class="styled-input" value={state.joinRule} name="joinRule" onchange={this.handleJoinRuleChange}>
                <option value="public">Публічний</option>
                <option value="invite">Для запрошених</option>
                <option disabled={!this.restrictedAvailable} value="restricted">Обмежено</option>
              </select>
              <div class="room-settings-info">
                { state.joinRule === "public" ? "Долучитися може кожен, хто знайде цей запис"
                : state.joinRule === "invite" ? "для приєднання потрібне спеціальне запрошення"
                : props.resource ? "приєднатися може лише той, хто має доступ до запису, що анотується"
                : "тільки той, хто має доступ до мед. карти, що містить цей запис, може приєднатися"
                }
              </div>
              <label htmlFor="readability">Читабельність</label>
              <select class="styled-input" value={state.readability} disabled={!this.mayChangeReadability} name="readability" onchange={this.handleReadabilityChange}>
                <option value="shared">Виключно для учасників</option>
                <option value="world_readable">Загального доступу</option>
              </select>
              <div class="room-settings-info">
                {state.readability === "world_readable"
                  ? "будь-хто може бачити, що відбувається"
                  : "тільки запрошені учасники можуть бачити, що відбувається"
                }
              </div>
              { this.initialSpaceVisibility 
                ? <Fragment>
                  <label htmlFor="spaceVisibility">Видимість</label>
                  <select class="styled-input" value={state.spaceVisibility} disabled={!this.mayChangeSpaceVisibility} name="spaceVisibility" onchange={this.handleSpaceVisibilityChange}>
                    <option value="visible">Видима </option>
                    <option value="hidden">Пртховпна</option>
                  </select>
                  <div class="room-settings-info">
                    {state.spaceVisibility === "visible"
                      ? "анотацію бачать усі"
                      : "анотацію буде приховано, якщо ви її ще не бачили"
                    }
                  </div>
                </Fragment>
                : null
              }
            </Fragment>
            : state.view === "LINKS" ? <Fragment>
                <label>Приєднатися за посиланням</label>
                <div class="room-settings-link-group">
                  <pre id="room-settings-join-link">{this.joinLink} </pre>
                  <CopyButton copy={this.joinLink}/>
                </div>
                <div class="room-settings-info">
                натискання на це посилання призведе до спроби отримати доступ до анотування запису
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
                  label="Запросити"
                  member={this.member}
                  act="invite new members" />
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="kick"
                  label="Видалити"
                  requiredRole={state.kick}
                  member={this.member}
                  act="remove users from the room" />
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="ban"
                  label="Заблокувати"
                  requiredRole={state.ban}
                  member={this.member}
                  act="remove users and ban them from rejoining" />
                <ConfigurePowerForKey
                  setPowerLevelRole={this.setPowerLevelRole}
                  powerLevels={this.powerLevels}
                  powerKey="redact"
                  label="Редагувати"
                  requiredRole={state.redact}
                  member={this.member}
                  act="remove any message from the room" />
                {props.room.getType() === Matrix.RoomType.Space 
                  ? null
                  : <ConfigurePowerForKey
                      setPowerLevelRole={this.setPowerLevelRole}
                      powerLevels={this.powerLevels}
                      powerKey="events_default"
                      label="Повідомлення"
                      requiredRole={state.events_default}
                      member={this.member}
                      act="send messages" />
                }
               { Resource.hasResource(props.room)
                   ? <ConfigurePowerForState 
                      setPowerLevelRole={this.setPowerLevelRole}
                      powerLevels={this.powerLevels}
                      type={Matrix.EventType.SpaceChild}
                      requiredRole={state[Matrix.EventType.SpaceChild]}
                      label="Анотації"
                      member={this.member}
                      act="create annotations" />
                  : null 
              }
            </Fragment>
            : null
          }
          <div id="room-settings-submit-wrapper">
            <button disabled={!updated} className="styled-button" onClick={this.handleSubmit} >Зберегти зміни</button>
            <button className="styled-button" onClick={this.cancel} >Відмовитись</button>
          </div>
          {typeof(state.progress) === "string"
            ? <div id="room-settings-progress">
              {state.progress}
            </div>
            : state.progress?.total
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
          <option disabled={props.member.powerLevels < 100} value="admin">Лише пацієнт</option>
          <option disabled={props.member.powerLevels < 50} value="mod">Ведучий лікар </option>
          <option value="member">Будь хто з мед. персоналу</option>
          {this.initialRole === "custom" ? <option value="custom">Статус доступності</option>: null}
        </select>
        <div class="room-settings-info">
          {currentRole === "admin" ? `Only admins can ${props.act}`
            : currentRole === "mod" ? `пацієнт та ведучий лікар ${props.act}`
            : currentRole === "member" ? `інший мед. персонал ${props.act}`
            : `Рівень доступу ${this.initialPowerLevel} є необхідним ${props.act}`
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
          <option value="admin">Втключно пацієнт</option>
          <option value="mod">Ведучий лікар та пацієнт</option>
          <option value="member">Інший мед. персонал</option>
          {this.initialRole === "custom" ? <option value="custom">Рівень доступності</option>: null}
        </select>
        <div class="room-settings-info">
          {currentRole === "admin" ? `Лише пацієнт ${props.act}`
            : currentRole === "mod" ? `Пацієнт та ведучий лікар ${props.act}`
            : currentRole === "member" ? `Всі хто має доступ ${props.act}`
            : `Powerlevel ${this.initialPowerLevel}  можуть ${props.act}`
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
    else return <div class="room-settings-role-empty">Не вибрано пацієнта</div>
  }

  toggleAdmin = user => {
    const newUsers = Object.assign ({}, this.props.users)
    if (newUsers[user] !== 100) newUsers[user] = 100
    else delete newUsers[user]
    this.props.setUsers(newUsers)
  }

  addAdmin = user => {
    const newUsers = Object.assign ({}, this.props.users)
    if (newUsers[user] !== 100) newUsers[user] = 100
    this.props.setUsers(newUsers)
  }

  canAdd = this.props.room.getMember(Client.client.getUserId()).powerLevel >= 50

  render(props) {
    return <div class="room-settings-role-list">
      <h5>Пацієнт</h5>
      {this.getAdmins()}
      {this.canAdd ? <AddRole users={props.users} addRole={this.addAdmin} room={props.room}/> : null}
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
      if (theirPower >= myPower) return // TODO could trigger a transitent explainer here.
    }
    this.props.addRole(userId.trim())
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
    else return <div class="room-settings-role-empty">Пусто</div>
  }

  toggleMod = user => {
    const newUsers = Object.assign ({}, this.props.users)
    if (newUsers[user] !== 50) newUsers[user] = 50
    else delete newUsers[user]
    this.props.setUsers(newUsers)
  }

  addMod = user => {
    const newUsers = Object.assign ({}, this.props.users)
    if (newUsers[user] !== 50) newUsers[user] = 50
    this.props.setUsers(newUsers)
  }

  canAdd = this.props.room.getMember(Client.client.getUserId()).powerLevel >= 50

  render(props) {
    return <div class="room-settings-role-list">
      <h5>Ведучий лікар</h5>
      {this.getMods()}
      {this.canAdd ? <AddRole users={props.users} addRole={this.addMod} room={props.room}/> : null}
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
        {props.activated ? <span class="room-settings-role-change-info">буде додано в цю роль</span> : null}
        {props.deactivated ? <span class="room-settings-role-change-info">буде усунуто з цієї ролі</span> : null}
        {(props.deactivated || props.activated) && Client.client.getUserId() === props.user 
            ? <span style={{marginTop: "5px", color:"red"}} class="room-settings-role-change-info">
                <b>Уважно!</b>:Зміна власної ролі може бути незворотною і призвести до того, що ви втратите доступ до запису.
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
      <h5>Інші ролі</h5>
      {this.getOtherRoles()}
    </div>
  }
}
