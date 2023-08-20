import { h, Fragment, createRef, Component } from 'preact';
import UserPill from './userPill.js'
import MemberPill from './memberPill.js'
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import SearchBar from './search.js'
import * as Icons from './icons.js'
import './styles/invite.css'

export default class ManageMembership extends Component {
  constructor(props) {
    super(props)
    this.state = {
      view: "JOINING",
      joins: this.getSortedMembership("join"),
      invites: this.getSortedMembership("invite"),
      bans: this.getSortedMembership("ban"),
      knocks: this.getSortedMembership("knock"),
      search: ""
    }
  }

  componentDidMount () {
    Client.client.on("RoomMember.membership", this.updateMembership)
    this.resize()
  }

  componentWillUnmount () {
    Client.client.off("RoomMember.membership", this.updateMembership)
  }

  componentDidUpdate () {
    this.resize()
  }

  inviteSelect = createRef()

  inviteSelectWrapper = createRef()

  resize = _ => this.inviteSelectWrapper.current.style.height = `${this.inviteSelect.current.scrollHeight}px`

  updateMembership = event => {
    if (event.getRoomId() === this.props.room.roomId) this.setState({ 
      joins: this.getSortedMembership("join"),
      invites: this.getSortedMembership("invite"),
      bans: this.getSortedMembership("ban"),
      leaves: this.getSortedMembership("leave"),
      knocks: this.getSortedMembership("knocks")
    })
  }

  filterMembers = search => this.setState({ search })

  joinMembers = _ => this.setState({ view: "JOINING"})

  kickMembers = _ => this.setState({ view: "KICKING"})

  banMembers = _ => this.setState({ view: "BANNING"})

  unbanMembers = _ => this.setState({ view: "UNBANNING"})

  getSortedMembership = membership => this.props.room.getMembersWithMembership(membership)
    .sort((u1, u2) => u1.name.toUpperCase() > u2.name.toUpperCase() ? 1 : -1)

  isInvitable = userId => {
    if (this.state.joins.some(join => join.userId === userId)) return false
    if (this.state.invites.some(invite => invite.userId === userId)) return false
    if (this.state.bans.some(ban => ban.userId === userId)) return false
    return true
  }

  isKnocking = userId => this.state.knocks.some(knock => knock.userId == userId)

  getRemovalListing = _ => this.state.joins
    .filter(m => m.name.toUpperCase().includes(this.state.search.toUpperCase()))

  getDisinviteListing = _ => this.state.invites
    .filter(m => m.name.toUpperCase().includes(this.state.search.toUpperCase()))

  getBanListing = _ => this.state.joins
    .filter(m => m.name.toUpperCase().includes(this.state.search.toUpperCase()))

  getInviteListing = _ => Client.client.getUsers()
    .filter(u => this.isInvitable(u.userId))
    .filter(u => !this.isKnocking(u.userId))
    .filter(u => u.displayName.toUpperCase().includes(this.state.search.toUpperCase()))
    .sort((u1, u2) => u1.displayName.toUpperCase() > u2.displayName.toUpperCase() ? 1 : -1)

  getKnockResponseListing = _ => this.state.knocks
    .filter(m => m.name.toUpperCase().includes(this.state.search.toUpperCase()))

  render(props, state) {
    const roomState =  props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
    const userMember = props.room.getMember(Client.client.getUserId())
    const canInvite = roomState.hasSufficientPowerLevelFor("invite", userMember.powerLevel)
    const canKick = roomState.hasSufficientPowerLevelFor("kick", userMember.powerLevel)
    const canBan = roomState.hasSufficientPowerLevelFor("ban", userMember.powerLevel)
    const canUnban = roomState.hasSufficientPowerLevelFor("unban", userMember.powerLevel)
    const inviteListing =  this.getInviteListing()

    return <Fragment>
      <SearchBar search={state.search} setSearch={this.filterMembers} />
      <div id="invite-select-view" class="select-view">
        <button disabled={!canInvite} onClick={this.joinMembers} data-current-button={state.view === "JOINING"}>Запрошення</button> 
        <button disabled={!canKick} onClick={this.kickMembers} data-current-button={state.view === "KICKING"}>Видалення</button> 
        <button disabled={!canBan} onClick={this.banMembers} data-current-button={state.view === "BANNING"}>Блокування</button> 
        <button disabled={!canUnban} onClick={this.unbanMembers} data-current-button={state.view === "UNBANNING"}>Розбокування</button> 
      </div>
      <div ref={this.inviteSelectWrapper} id="invite-select-wrapper">
        { state.view === "JOINING"
          ? <div ref={this.inviteSelect} id="invite-join-members">
            <div>
              { this.getKnockResponseListing().map(m => <KnockResponse member={m} room={props.room} key={m.userId} />) }
              { inviteListing.map(u => <Invitation user={u} room={props.room} key={u.userId} />) }
            </div>
            <ServerResults resize={this.resize} search={state.search} isInvitable={this.isInvitable} inviteListing={inviteListing} room={props.room} />
          </div>
          : state.view === "KICKING"
          ? <div ref={this.inviteSelect} id="invite-kick-members">
            { this.getRemovalListing().map(m => <Removal member={m} userMember={userMember} room={props.room} key={m.userId} />) }
            { this.getDisinviteListing().map(m => <Disinvitation member={m} userMember={userMember} room={props.room} key={m.userId} />) }
          </div>
          : state.view === "BANNING"
          ? <div ref={this.inviteSelect} id="invite-ban-members">
            { this.getBanListing().map(m => <Ban member={m} userMember={userMember} room={props.room} key={m.userId} />) }
          </div>
          : state.view === "UNBANNING"
          ? <div ref={this.inviteSelect} id="invite-unban-members">
            { this.state.bans.map(m => <Unban member={m} room={props.room} key={m.userId} />) }
          </div>
          : null
        }
      </div>
    </Fragment>
  }
}

class Invitation extends Component {
  invite = _ => Client.client
    .invite(this.props.room.roomId, this.props.user.userId || this.props.user.user_id)
    // ^^^ handles raw results from the user directory which have user_id rather than userId
    .catch(alert)

  render(props) {
    return <button class="invite-candidate" onclick={this.invite} >
      <span class="small-icon">{Icons.userPlus}</span>
      <span><UserPill user={props.user} /></span>
    </button>
  }
}

class KnockResponse extends Component {
  invite = _ => Client.client
    .invite(this.props.room.roomId, this.props.member.userId)
    // ^^^ handles raw results from the user directory which have user_id rather than userId
    .catch(alert)

  render(props) {
    return <button class="invite-candidate" onclick={this.invite} >
      <span class="small-icon">{Icons.userPlus}</span>
      <span><MemberPill user={props.member} /></span>
      <span class="invite-candidate-knocked">has requested an invitation</span>
    </button>
  }
}

class Disinvitation extends Component {
  kick = _ => Client.client
    .kick(this.props.room.roomId, this.props.member.userId)
    .catch(alert)

  render(props) {
    if (props.userMember.powerLevel <= props.member.powerLevel) return null
    return <button class="disinvite-candidate" onclick={this.kick}>
      <span class="small-icon">{Icons.userMinus}</span>
      <span><MemberPill member={props.member} /></span>
    </button>
  }
}

class Removal extends Component {
  kick = _ => Client.client
    .kick(this.props.room.roomId, this.props.member.userId)
    .catch(alert)

  render(props) {
    if (props.userMember.powerLevel <= props.member.powerLevel) return null
    return <button class="removal-candidate" onclick={this.kick}>
      <span class="small-icon">{Icons.userMinus}</span>
      <span><MemberPill member={props.member} /></span>
    </button>
  }
}

class Ban extends Component {
  ban = _ => Client.client
    .ban(this.props.room.roomId, this.props.member.userId)
    .catch(alert)

  render(props) {
    if (props.userMember.powerLevel <= props.member.powerLevel) return null
    return <button class="ban-candidate" onclick={this.ban}>
      <span class="small-icon">{Icons.userX}</span>
      <span><MemberPill member={props.member} /></span>
    </button>
  }
}

class Unban extends Component {
  unban = _ => Client.client
    .unban(this.props.room.roomId, this.props.member.userId)
    .catch(alert)

  render(props) {
    return <button class="unban-candidate" onclick={this.unban}>
      <span class="small-icon">{Icons.userCheck}</span>
      <span><MemberPill member={props.member} /></span>
    </button>
  }
}

class ServerResults extends Component {
  constructor(props) {
    super(props)
    this.state = {
      results: [],
      pending: false,
      fired: false
    }
  }

  serverSearch = async _ => {
    this.setState({pending: true})
    const { results } = await Client.client.searchUserDirectory({term: this.props.search})
    this.setState({results, fired: true, pending: false}, this.props.resize)
  }

  render(props, state) {
    const buttonStyle = {
      visibility: props.search ? "visible" : "hidden"
    }
    const candidates = state.results
      .filter(u => !props.inviteListing.map(a => a.userId).includes(u.user_id))
      .filter(u => props.isInvitable(u.user_id))
      .filter(u => u.display_name
        ? u.display_name.toUpperCase().includes(props.search.toUpperCase())
        : u.user_id.toUpperCase().includes(props.search.toUpperCase())
      )
    return <Fragment>
      { state.fired && candidates.length > 0 ? <hr id="invite-search-divider" /> : null }
      { candidates.map(u => <Invitation key={u.user_id} user={u} room={props.room} />)
      }
      <div>
        <button style={buttonStyle} id="invite-search-directory" class="styled-button" disabled={state.pending} onclick={this.serverSearch}>
          {state.fired
            ? "Search again?"
            : "Search for more people?"
          }
        </button>
      </div>
    </Fragment>
  }
}
