import { h, Component } from 'preact';
import Client from './client.js'
import { UserColor } from './utils/colors.js'
import { Database } from 'emoji-picker-element'
import './styles/popUpMenu.css'

export class Menu extends Component {
  componentDidMount () {
    if (this.props.textarea?.current) {
      this.props.textarea.current.addEventListener("input", this.handleInput)
      this.props.textarea.current.addEventListener("click", this.cancel)
      this.props.textarea.current.addEventListener("blur", this.cancel)
    }
  }

  componentWillUnmount () {
    if (this.props.textarea?.current) {
      this.props.textarea.current.removeEventListener("input", this.handleInput)
      this.props.textarea.current.removeEventListener("click", this.cancel)
      this.props.textarea.current.removeEventListener("blur", this.cancel)
    }
  }

  cancel = _ => this.setState({active: null})

  handleInput = e => this.props.actions[e.data]
    ? this.setState({ active: this.props.actions[e.data] })
    : null

  insert = (insertion, regex) => {
    if (this.props.setTextValue) {
      const selstart = this.props.textarea.current.selectionStart
      const selend = this.props.textarea.current.selectionEnd
      if (selstart === selend) {
        const initialSegment = this.props.textValue.slice(0, selend)
        const terminalSegment = this.props.textValue.slice(selend)
        const newSegment = initialSegment.replace(regex, insertion)
        this.props.setTextValue(`${newSegment}${terminalSegment}`,
          _ => {
            this.props.textarea.current.focus()
            this.props.textarea.current.selectionEnd = newSegment.length
          }
        )
      }
    }
    if (this.props.getSelection) this.props.getSelection(insertion)
    this.cancel()
  }

  render(props, state) {
    if (state.active) {
      return state.active({
        insert: this.insert,
        cancel: this.cancel,
        textarea: props.textarea,
        textValue: props.textValue,
        below: props.below
      })
    }
  }
}

export class Emojis extends Component {
  constructor(props) {
    super(props)
    this.state = {
      popupItems: [],
      selection: 0
    }
    // not sure if this is too inefficient
    this.database = new Database()
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
    if ((e.key === "Enter" || e.key === ":") &&
      this.state.popupItems.length > 0) {
      e.preventDefault()
      this.insertSelection()
    }
  }

  handleKeyup = _ => {
    const selstart = this.props.textarea.current.selectionStart
    const selend = this.props.textarea.current.selectionEnd
    if (selstart === selend) {
      const matches = this.props.textValue.slice(0, selend).match(/:\S*$/)
      if (matches) {
        const match = matches[0].slice(1)
        if (match.length < 2) return this.setState({ popupItems: [] })
        this.database.getEmojiBySearchQuery(match).then(emojis => {
          this.setState({
            popupItems: emojis
              .filter(emoji => emoji.version < 13) // For compatibility with older devices
              .sort((a, b) => {
                if (a.shortcodes[0] === match) return -1
                if (b.shortcodes[0] === match) return 1
                return a.shortcodes[0].includes(match)
                  ? (b.shortcodes[0].includes(match) ? 0 : -1)
                  : (b.shortcodes[0].includes(match) ? 1 : 0)
              }).slice(0, 3).map((emoji, idx) =>
              <Emoji
                key={emoji.unicode}
                emoji={emoji}
                insert={this.props.insert}
                selected={this.state.selection === idx}
              />)
          })
        })
        return
      }
    }
    this.props.cancel()
  }

  insertSelection = _ => {
    const emoji = this.state.popupItems[this.state.selection].props.emoji.unicode
    this.props.insert(emoji, /:\S*$/)
  }

  render(props, state) {
    if (this.state.popupItems.length > 0) {
      // We use a relatively positioned wrapper to keep the PUM in the document flow
      return <div style={{top: `${state.popupItems.length * 40}px`}} id="popup-wrapper">
        <div id="popup-menu" style={props.below ? {top: "0px"} : {bottom: "0px"}}>
          {this.state.popupItems}
        </div>
      </div>
    }
  }
}

class Emoji extends Component {
  insertEmoji = e => {
    e.preventDefault() // try to prevent textarea losing focus
    this.props.insert(this.props.emoji.unicode, /:\S*$/)
  }

  render(props) {
    return <div
      onmousedown={this.insertEmoji}
      class={props.selected ? "popup-menu-item-selected-emoji popup-menu-item" : "popup-menu-item"}>
      <span class="popup-menu-item-emojishortcode"> :{props.emoji.shortcodes[0]}: </span>
      <span>•</span>
      <span class="popup-menu-item-emojiglyph"> {props.emoji.unicode} </span>
    </div>
  }
}

export class Users extends Component {
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
    if (e.key === "Enter" && this.state.popupItems.length > 0) {
      e.preventDefault()
      this.insertSelection()
    }
  }

  generatePopupItems(value) {
    return Client.client.getUsers()
      .filter(user => 
        user.userId.includes(value.toLowerCase()) || 
        user.displayName.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 3) // top 3
      .map((user, idx) => <User
        insert={this.props.insert}
        key={user.userId}
        selected={this.state.selection === idx}
        user={user} />
      )
  }

  insertSelection = _ => {
    const userId = this.state.popupItems[this.state.selection].props.user.userId
    this.props.insert(`${userId} `, /@\S*$/)
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

  render(props, state) {
    if (this.state.popupItems.length > 0) {
      // We use a relatively positioned wrapper to keep the PUM in the document flow
      return <div style={{top: `${state.popupItems.length * 40}px`}} id="popup-wrapper">
        <div id="popup-menu" style={props.below ? {top: "0px"} : {bottom: "0px"}}>
          {this.state.popupItems}
        </div>
      </div>
    }
  }
}

class User extends Component {
  colorFromId = new UserColor(this.props.user.userId)

  insertUserId = e => {
    e.preventDefault() // try to prevent textarea losing focus
    this.props.insert(`${this.props.user.userId} `, /@\S*$/)
  }

  render(props) {
    return <div
      onmousedown={this.insertUserId}
      style={this.colorFromId.styleVariables}
      class={props.selected ? "popup-menu-item-selected-user popup-menu-item" : "popup-menu-item"}>
      <span class="popup-menu-item-userid"> @{props.user.userId.split(":")[0].substring(1)} </span>
      <span>•</span>
      <span class="popup-menu-item-username"> {props.user.displayName} </span>
    </div>
  }
}

export class Members extends Component {
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
    if (e.key === "Enter" && this.state.popupItems.length > 0) {
      e.preventDefault()
      this.insertSelection()
    }
  }

  generatePopupItems(value) {
    const room = Client.client.getRoom(this.props.roomId)
    if (room) {
      return room.getMembersWithMembership("join")
        .filter(member => 
          member.userId.includes(value.toLowerCase()) || 
          member.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 3) // top 3
        .map((member, idx) => <Member
          insert={this.props.insert}
          key={member.userId}
          selected={this.state.selection === idx}
          member={member} />
        )
    }
    return []
  }

  insertSelection = _ => {
    const userId = this.state.popupItems[this.state.selection].props.member.userId
    this.props.insert(`${userId} `, /@\S*$/)
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

  render(props, state) {
    if (this.state.popupItems.length > 0) {
      // We use a relatively positioned wrapper to keep the PUM in the document flow
      return <div style={{top: `${state.popupItems.length * 40}px`}} id="popup-wrapper">
        <div id="popup-menu" style={props.below ? {top: "0px"} : {bottom: "0px"}}>
          {this.state.popupItems}
        </div>
      </div>
    }
  }
}

class Member extends Component {
  colorFromId = new UserColor(this.props.member.userId)

  insertUserId = e => {
    e.preventDefault() // try to prevent textarea losing focus
    this.props.insert(`${this.props.member.userId} `, /@\S*$/)
  }

  render(props) {
    return <div
      onmousedown={this.insertUserId}
      style={this.colorFromId.styleVariables}
      class={props.selected ? "popup-menu-item-selected-user popup-menu-item" : "popup-menu-item"}>
      <span class="popup-menu-item-userid"> @{props.member.userId.split(":")[0].substring(1)} </span>
      <span>•</span>
      <span class="popup-menu-item-username"> {props.member.name} </span>
    </div>
  }
}

export class Flags extends Component {
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
    if (e.key === "Enter" && this.state.popupItems.length > 0) {
      e.preventDefault()
      this.insertSelection()
    }
  }

  generatePopupItems(value) {
    return this.props.flags
      .filter(flag => flag.keyword.includes(value))
      .slice(0, 3) // top 3
      .map((flag, idx) => <Flag
        insert={this.props.insert}
        key={flag.keyword}
        selected={this.state.selection === idx}
        flag={flag} />
      )
  }

  insertSelection = _ => {
    const keyword = this.state.popupItems[this.state.selection].props.flag.keyword
    this.props.insert(`~${keyword} `, /~\S*$/)
  }

  handleKeyup = _ => {
    const selstart = this.props.textarea.current.selectionStart
    const selend = this.props.textarea.current.selectionEnd
    if (selstart === selend) {
      const matches = this.props.textValue.slice(0, selend).match(/~\S*$/)
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

  render(props, state) {
    if (this.state.popupItems.length > 0) {
      // We use a relatively positioned wrapper to keep the PUM in the document flow
      return <div style={{top: `${state.popupItems.length * 40}px`}} id="popup-wrapper">
        <div id="popup-menu" style={props.below ? {top: "0px"} : {bottom: "0px"}}>
          {this.state.popupItems}
        </div>
      </div>
    }
  }
}

class Flag extends Component {
  insertFlag = e => {
    e.preventDefault() // try to prevent textarea losing focus
    this.props.insert(`~${this.props.flag.keyword} `, /~\S*$/)
  }

  render(props) {
    return <div
      onmousedown={this.insertFlag}
      class={props.selected ? "popup-menu-item-selected-flag popup-menu-item" : "popup-menu-item"}>
      <span class="popup-menu-item-flag"> ~{props.flag.keyword} </span>
      <span>•</span>
      <span class="popup-menu-item-flag-description"> {props.flag.description} </span>
    </div>
  }
}
