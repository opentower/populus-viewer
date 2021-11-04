import { h, Component } from 'preact';
import Client from './client.js'
import './styles/popUpMenu.css'

export default class PopupMenu extends Component {
  constructor(props) {
    super(props)
    this.state = {
      active: false,
      popupItems: [],
      selection: 0
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
    if (this.state.active && e.key === "ArrowDown") {
      e.preventDefault()
      if (this.state.selection + 1 < this.state.popupItems.length) {
        this.setState(oldState => { return {selection: oldState.selection + 1} })
      }
    }
    if (this.state.active && e.key === "ArrowUp") {
      e.preventDefault()
      if (this.state.selection > 0) {
        this.setState(oldState => { return {selection: oldState.selection - 1} })
      }
    }
    if (this.state.active && e.key === "Enter") {
      e.preventDefault()
      this.insertSelection()
    }
  }

  generatePopupItems(value) {
    const room = Client.client.getRoom(this.props.roomId)
    if (room) {
      const matchingMembers = room.getMembersWithMembership("join")
        .filter(member => member.userId.includes(value) || member.name.includes(value))
      return matchingMembers
        .map((member, idx) => <PopupMenuMember
          key={member.userId}
          selected={this.state.selection === idx}
          member={member} />
        )
    }
    return []
  }

  insertSelection() {
    const userId = this.state.popupItems[this.state.selection].props.member.userId
    const selstart = this.props.textarea.current.selectionStart
    const selend = this.props.textarea.current.selectionEnd
    if (selstart === selend) {
      const initialSegment = this.props.textValue.slice(0, selend)
      const terminalSegment = this.props.textValue.slice(selend)
      const newSegment = initialSegment.replace(/@\S*$/, "@" + userId.split(":")[0].substring(1))
      this.props.setTextValue(`${newSegment}${terminalSegment}`,
        _ => {
          this.props.textarea.current.focus()
          this.props.textarea.current.selectionEnd = newSegment.length
        }
      )
    }
    this.setState({active: false})
  }

  handleKeyup = _ => {
    // TODO: debounce
    if (this.state.active) {
      const selstart = this.props.textarea.current.selectionStart
      const selend = this.props.textarea.current.selectionEnd
      if (selstart === selend) {
        const matches = this.props.textValue.slice(0, selend).match(/@\S*$/)
        if (matches) {
          const popupItems = this.generatePopupItems(matches[0].substring(1))
          const newState = {popupItems}
          if (popupItems.length < this.state.selection + 1) {
            newState.selection = popupItems.length - 1
          }
          this.setState(newState)
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
  return <div class={props.selected ? "pop-up-menu-item-selected pop-up-menu-item" : "pop-up-menu-item"}>
    <span> {props.member.userId.split(":")[0].substring(1)} </span>
    <span> ({props.member.name}) </span>
  </div>
}
