import { h, Fragment, Component, createRef } from 'preact';
import Client from './client.js'
import * as Icons from './icons.js'
import './styles/tagEditor.css'

export class TagEditor extends Component {
  constructor(props) {
    super(props)
    this.state = {
      newTag: "",
      tags: Object.keys(props.room.tags)
    }
    this.accountListener = this.accountListener.bind(this)
  }

  componentDidMount () {
    Client.client.on("Room.accountData", this.accountListener)
  }

  componentWillUnmount () {
    Client.client.off("Room.accountData", this.accountListener)
  }

  accountListener () {
    this.setState({tags: Object.keys(this.props.room.tags)})
  }

  newTagInput = createRef()

  handleBlur = _ => this.setState({newTag: ""})

  handleKeyup = e => {
    if (e.key === "Enter") {
      Client.client.setRoomTag(this.props.room.roomId, `u.${this.newTagInput.current.value}`, {order: 0.5})
      this.setState({newTag: ""})
    } else this.setState({newTag: this.newTagInput.current.value})
  }

  handleClick = name => _ => {
    Client.client.deleteRoomTag(this.props.room.roomId, name)
  }

  render(props, state) {
    const roomTags = state.tags
      .filter(tag => tag.slice(0, 2) === 'u.')
      .map(tag => <Fragment key={`${props.room.roomId}"-tag-"${tag}`}>
        <span onclick={this.handleClick(tag)}
          class="room-tag-delete-icon">{Icons.trash}</span>
        <Tag room={props.room} tag={tag} />
      </Fragment>)
    return <Fragment>
        <div class="tag-editor">
          <Fragment>{roomTags}</Fragment>
          <input ref={this.newTagInput}
            class="styled-input tag-input"
            value={state.newTag}
            onkeyup={this.handleKeyup}
            onblur={this.handleBlur}
            placeholder="новий тег" />
        </div>
      </Fragment>
  }
}

function Tag(props) {
  return <span class="room-tag">{props.tag.slice(2)}</span>
}

export function TagList(props) {
  const roomTags = Object.keys(props.room.tags)
    .filter(tag => tag.slice(0, 2) === 'u.')
    .map(tag => <Tag key={`${props.room.roomId}"-tag-"${props.tag}`} room={props.room} tag={tag} />)
  return <Fragment>{roomTags}</Fragment>
}
