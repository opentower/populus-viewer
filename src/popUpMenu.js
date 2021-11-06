import { h, Component } from 'preact';
import Client from './client.js'
import UserColor from './userColors.js'
import './styles/popUpMenu.css'

export default class PopupMenu extends Component {
  componentDidMount () {
    if (this.props.textarea) {
      this.props.textarea.current.addEventListener("input", this.handleInput)
      this.props.textarea.current.addEventListener("click", this.cancel)
      this.props.textarea.current.addEventListener("blur", this.cancel)
    }
  }

  componentWillUnmount () {
    if (this.props.textarea) {
      this.props.textarea.current.removeEventListener("input", this.handleInput)
      this.props.textarea.current.removeEventListener("click", this.cancel)
      this.props.textarea.current.removeEventListener("blur", this.cancel)
    }
  }

  cancel = _ => this.setState({active: null})

  // we use this instead of keydown for compatibility with mobile chrome
  handleInput = e => {
    if (e.data === "@") {
      this.setState({active: "member"})
    }
  }

  insert = s => {
    const selstart = this.props.textarea.current.selectionStart
    const selend = this.props.textarea.current.selectionEnd
    if (selstart === selend) {
      const initialSegment = this.props.textValue.slice(0, selend)
      const terminalSegment = this.props.textValue.slice(selend)
      const newSegment = initialSegment.replace(/@\S*$/, s)
      this.props.setTextValue(`${newSegment}${terminalSegment}`,
        _ => {
          this.props.textarea.current.focus()
          this.props.textarea.current.selectionEnd = newSegment.length
        }
      )
    }
    this.cancel()
  }

  render(props, state) {
    switch (state.active) {
      case "member" : return <PopupMenuMembers
          insert={this.insert}
          cancel={this.cancel}
          textarea={props.textarea}
          textValue={props.textValue}
          roomId={props.roomId}
        />
      default: return null
    }
  }
}

export class PopupMenuMembers extends Component {
  constructor(props) {
    super(props)
    this.state = {
      popupItems: [],
      selection: 0
    }
  }

  componentDidMount () {
    if (this.props.textarea) {
      this.props.textarea.current.addEventListener("keydown", this.handleKeydown)
      this.props.textarea.current.addEventListener("keyup", this.handleKeyup)
    }
  }

  componentWillUnmount () {
    if (this.props.textarea) {
      this.props.textarea.current.removeEventListener("keydown", this.handleKeydown)
      this.props.textarea.current.removeEventListener("keyup", this.handleKeyup)
    }
  }

  handleKeydown = e => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (this.state.selection + 1 < this.state.popupItems.length) {
        this.setState(oldState => { return {selection: oldState.selection + 1} })
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (this.state.selection > 0) {
        this.setState(oldState => { return {selection: oldState.selection - 1} })
      }
    }
    if (e.key === "Enter") {
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
        .slice(0, 3) // top 3
        .map((member, idx) => <PopupMenuMember
          insert={this.insert}
          key={member.userId}
          selected={this.state.selection === idx}
          member={member} />
        )
    }
    return []
  }

  insertSelection() {
    const userId = this.state.popupItems[this.state.selection].props.member.userId
    this.props.insert(`@${userId.split(":")[0].substring(1)} `)
  }

  handleKeyup = _ => {
    const selstart = this.props.textarea.current.selectionStart
    const selend = this.props.textarea.current.selectionEnd
    if (selstart === selend) {
      const matches = this.props.textValue.slice(0, selend).match(/@\S*$/)
      if (matches) {
        const popupItems = this.generatePopupItems(matches[0].substring(1))
        const newState = {popupItems}
        if (popupItems.length < this.state.selection + 1) {
          newState.selection = Math.max(popupItems.length - 1, 0)
        }
        this.setState(newState)
        return
      }
    }
    this.props.cancel()
  }

  render(_props, state) {
    // We use a relatively positioned wrapper to keep the PUM in the document flow
    return <div style={{top: `${state.popupItems.length * 40}px`}} id="popup-wrapper">
      <div id="popup-menu">
        {this.state.popupItems}
      </div>
    </div>
  }
}

class PopupMenuMember extends Component {
  colorFromId = new UserColor(this.props.member.userId)

  insertName = e => {
    e.preventDefault() // try to prevent textarea losing focus
    this.props.insert(`@${this.props.member.userId.split(":")[0].substring(1)} `)
  }

  render(props) {
    return <div
      onmousedown={this.insertName}
      style={this.colorFromId.styleVariables}
      class={props.selected ? "popup-menu-item-selected popup-menu-item" : "popup-menu-item"}>
      <span class="popup-menu-item-userid"> {props.member.userId.split(":")[0].substring(1)} </span>
      <span>•</span>
      <span class="popup-menu-item-username"> {props.member.name} </span>
    </div>
  }
}
