import { h, Fragment, createRef, Component } from 'preact';
import UserPill from './userPill.js'
import MemberPill from './memberPill.js'
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import SearchBar from './search.js'
import * as Icons from './icons.js'
import './styles/invite.css'

export default class Invite extends Component {
  constructor(props) {
    super(props)
    const joins = this.props.room.getMembersWithMembership("join")
      .sort((u1, u2) => u1.name.toUpperCase() > u2.name.toUpperCase() ? 1 : -1)
    const invites = this.props.room.getMembersWithMembership("invite")
      .sort((u1, u2) => u1.name.toUpperCase() > u2.name.toUpperCase() ? 1 : -1)
    const memberIds = joins.map(join => join.userId).concat(invites.map(invite => invite.userId))
    this.state = {
      view: "JOINING",
      joins,
      invites,
      memberIds,
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
    const joins = this.props.room.getMembersWithMembership("join")
      .sort((u1, u2) => u1.name.toUpperCase() > u2.name.toUpperCase() ? 1 : -1)
    const invites = this.props.room.getMembersWithMembership("invite")
      .sort((u1, u2) => u1.name.toUpperCase() > u2.name.toUpperCase() ? 1 : -1)
    const memberIds = joins.map(join => join.userId).concat(invites.map(invite => invite.userId))
    if (event.getRoomId() === this.props.room.roomId) this.setState({ joins, invites, memberIds })
  }

  filterMembers = search => this.setState({ search })

  joinMembers = _ => this.setState({ view: "JOINING"})

  getJoinListing = _ => Client.client.getUsers()
    .filter(u => !this.state.memberIds.includes(u.userId))
    .filter(u => u.displayName.toUpperCase().includes(this.state.search.toUpperCase()))
    .sort((u1, u2) => u1.displayName.toUpperCase() > u2.displayName.toUpperCase() ? 1 : -1)

  kickMembers = _ => this.setState({ view: "KICKING"})

  getRemovalListing = _ => this.state.joins
    .filter(m => m.name.toUpperCase().includes(this.state.search.toUpperCase()))

  getInviteListing = _ => this.state.invites
    .filter(m => m.name.toUpperCase().includes(this.state.search.toUpperCase()))

  render(props, state) {
    const roomState =  props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
    const userMember = props.room.getMember(Client.client.getUserId())
    const canInvite = roomState.hasSufficientPowerLevelFor("invite", userMember.powerLevel)
    const canKick = roomState.hasSufficientPowerLevelFor("kick", userMember.powerLevel)

    return <Fragment>
      <h3 id="modalHeader">Manage Membership {props.room.name ? `for ${props.room.name}` : ""}</h3>
      <SearchBar search={state.search} setSearch={this.filterMembers} />
      <div id="invite-select-view" class="select-view">
        {canInvite 
          ? <button onClick={this.joinMembers} data-current-button={state.view === "JOINING"}> Add Members</button> 
          : null
        }
        {canKick 
          ? <button onClick={this.kickMembers} data-current-button={state.view === "KICKING"}>Remove Members</button> 
          : null
        }
      </div>
      <div ref={this.inviteSelectWrapper} id="invite-select-wrapper">
        { state.view === "JOINING"
          ? <div ref={this.inviteSelect} id="invite-join-members">
            <div>
              { this.getJoinListing()
                  .map(u => <Invitation user={u} room={props.room} key={u.userId} />) }
            </div>
            <ServerResults resize={this.resize} search={state.search} memberIds={state.memberIds} additions={this.getJoinListing()} room={props.room} />
          </div>
          : state.view === "KICKING"
          ? <div ref={this.inviteSelect} id="invite-kick-members">
            { this.getRemovalListing().map(m => <Removal member={m} room={props.room} key={m.userId} />) }
            { this.getInviteListing().map(m => <Disinvitation member={m} room={props.room} key={m.userId} />) }
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
      <UserPill user={props.user} />
    </button>
  }
}

class Disinvitation extends Component {
  kick = _ => Client.client
    .kick(this.props.room.roomId, this.props.member.userId)
    .catch(alert)

  render(props) {
    return <button class="disinvite-candidate" onclick={this.kick}>
      <span class="small-icon">{Icons.userMinus}</span>
      <MemberPill member={props.member} />
    </button>
  }
}

class Removal extends Component {
  kick = _ => Client.client
    .kick(this.props.room.roomId, this.props.member.userId)
    .catch(alert)

  render(props) {
    return <button class="removal-candidate" onclick={this.kick}>
      <span class="small-icon">{Icons.userMinus}</span>
      <MemberPill member={props.member} />
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
      .filter(u => !props.additions.map(a => a.userId).includes(u.user_id))
      .filter(u => !props.memberIds.includes(u.user_id))
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
