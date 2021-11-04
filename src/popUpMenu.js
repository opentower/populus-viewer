import { h, Component } from 'preact';
import Client from './client.js'
import './styles/popUpMenu.css'

export default class PopupMenu extends Component {
  constructor(props) {
    super(props)
    this.state = {
      active: false,
      popupItems: []
    }
  }

  componentDidMount () {
    if (this.props.textarea) {
      this.props.textarea.current.addEventListener("keydown", this.handleKeydown)
      this.props.textarea.current.addEventListener("keyup", this.handleKeyup)
      this.props.textarea.current.addEventListener("click", this.cancel)
      this.props.textarea.current.addEventListener("blur", this.cancel)
    }
  }

  componentWillUnmount () {
    if (this.props.textarea) {
      this.props.textarea.current.removeEventListener("keydown", this.handleKeydown)
      this.props.textarea.current.removeEventListener("keyup", this.handleKeyup)
      this.props.textarea.current.removeEventListener("click", this.cancel)
      this.props.textarea.current.removeEventListener("blur", this.cancel)
    }
  }

  cancel = _ => this.setState({active: false})

  handleKeydown = e => {
    if (e.key === "@") {
      this.setState({active: true})
    }
  }

  generatePopupItems(value) {
    const room = Client.client.getRoom(this.props.roomId)
    if (room) {
      const matchingMembers = room.getMembersWithMembership("join")
        .filter(member => member.userId.includes(value) || member.name.includes(value))
      console.log(matchingMembers)
      return matchingMembers
        .map(member => <PopupMenuMember key={member.userId} member={member} />)
    }
    return []
  }

  handleKeyup = _ => {
    if (this.state.active) {
      const selstart = this.props.textarea.current.selectionStart
      const selend = this.props.textarea.current.selectionEnd
      if (selstart === selend) {
        const matches = this.props.textvalue.slice(0, selend).match(/@\S*$/)
        if (matches) {
          this.setState({popupItems: this.generatePopupItems(matches[0].substring(1))})
          return
        }
      }
      this.setState({active: false})
    }
  }

  render(_props, state) {
    if (state.active) {
      // We use a relatively positioned wrapper to keep the PUM in the document flow
      return <div id="pop-up-wrapper">
        <div id="pop-up-menu">
          {this.state.popupItems}
        </div>
      </div>
    }
  }
}

function PopupMenuMember(props) {
  return <div class="pop-up-menu-item">
    <span> {props.member.userId.split(":")[0].substring(1)} </span>
    <span> ({props.member.name}) </span>
  </div>
}
